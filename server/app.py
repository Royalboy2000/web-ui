from flask import Flask, jsonify, request, render_template, Response
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs # Added parse_qs
import json
import os
import sys
import re
# Removed argparse import

# Add the parent directory of 'server' to sys.path to find common_field_names
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import common_field_names

app = Flask(__name__, static_folder='static', template_folder='templates')

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
            "cookies": session.cookies.get_dict()
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


@app.route('/test_credentials', methods=['POST'])
def test_credentials():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    log_payload_summary = {}
    if request.is_json:
        json_data = request.get_json()
        log_payload_summary = {k: v for k, v in json_data.items() if k not in ['username_list', 'password_list']}
        log_payload_summary['username_list_count'] = len(json_data.get('username_list', []))
        log_payload_summary['password_list_count'] = len(json_data.get('password_list', []))
        app.logger.debug(f"Request JSON payload summary: {log_payload_summary}")

    try:
        data = request.get_json()
        required_fields = [
            "target_post_url", "username_field_name", "password_field_name",
            "username_list", "password_list", "form_method"
        ]
        if not data or not all(field in data for field in required_fields):
            missing = [field for field in required_fields if field not in data]
            app.logger.warning(f"Missing required fields in /test_credentials from {request.remote_addr}: {', '.join(missing)}")
            return jsonify({"error": f"Missing required fields in request payload: {', '.join(missing)}"}), 400

        target_post_url = data['target_post_url']
        username_field_name = data['username_field_name']
        password_field_name = data['password_field_name']
        username_list_payload = data['username_list'] # Renamed to avoid conflict with function-scoped var
        password_list_payload = data['password_list'] # Renamed
        form_method = data.get('form_method', 'POST').upper()
        auth_file_content = data.get('auth_file_content')

        # Defer strict validation of username_list_payload and password_list_payload
        # until after we check auth_file_content.
        # Basic type checks can remain if desired, but emptiness check is key.
        if not isinstance(username_list_payload, list):
            app.logger.warning(f"'username_list' from payload is not a list in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'username_list' (from payload) must be a list."}), 400
        if not isinstance(password_list_payload, list):
            app.logger.warning(f"'password_list' from payload is not a list in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'password_list' (from payload) must be a list."}), 400

        csrf_token_name = data.get('csrf_token_name')
        csrf_token_value = data.get('csrf_token_value')
        initial_cookies = data.get('cookies', {})

        def event_stream():
            source_usernames = []
            source_passwords = []
            credential_source_message = ""
            has_valid_auth_content = False

            if auth_file_content:
                app.logger.info("Auth file content provided in payload. Attempting to parse.")
                parsed_credentials = parse_auth_content(auth_file_content)
                if parsed_credentials:
                    source_usernames = [cred[0] for cred in parsed_credentials]
                    source_passwords = [cred[1] for cred in parsed_credentials]
                    credential_source_message = f"Using {len(source_usernames)} credential pairs from uploaded auth content."
                    has_valid_auth_content = True
                else:
                    app.logger.warning("Auth file content provided but was empty/invalid.")
                    # Message will indicate fallback below if this path is taken

            if not has_valid_auth_content:
                source_usernames = username_list_payload
                source_passwords = password_list_payload

                if auth_file_content: # Implies it was present but invalid/empty from parse_auth_content
                    credential_source_message = f"Uploaded auth content empty/invalid. Using {len(source_usernames)} credential pairs from individual payload lists."
                else: # No auth_file_content was ever provided
                    credential_source_message = f"No auth file content provided. Using {len(source_usernames)} credential pairs from individual payload lists."

                # If, after all this, both lists are empty, it means no usable credentials from any source.
                if not source_usernames and not source_passwords:
                    credential_source_message = "No valid credentials provided from any source."

            # Logging without request.remote_addr in the loop for these specific messages
            if not has_valid_auth_content: # Only log these if we fell back to payload lists
                if not username_list_payload:
                    app.logger.warning("Username list (from payload) is empty.")
                if not password_list_payload:
                    app.logger.warning("Password list (from payload) is empty.")

            app.logger.info(f"Final credential source message: {credential_source_message}")
            num_pairs_to_test = min(len(source_usernames), len(source_passwords))

            # If after all checks, there are no pairs to test (e.g. one list is empty),
            # the existing num_pairs_to_test == 0 check in the stream will handle it.
            # We only error out early if basic payload structure is wrong (e.g. username_list not a list).

            initial_info = {
                "type": "info",
                "total_expected_attempts": num_pairs_to_test,
                "message": f"Test run initiated. {credential_source_message} Expecting {num_pairs_to_test} pairs to be tested."
            }
            app.logger.info(f"SSE stream: Sending initial info event: {initial_info}")
            yield f"data: {json.dumps(initial_info)}\n\n"

            common_error_messages = [
                "incorrect password", "invalid password", "login failed", "login failure",
                "wrong credentials", "authentication failed", "invalid username or password",
                "username or password incorrect", "user not found", "account locked",
                "too many attempts", "session expired", "login error", "access denied",
                "unauthorized", "kullanıcı adı veya şifre hatalı", "e-posta veya şifre yanlış"
            ]
            common_success_keywords = [
                "welcome", "dashboard", "my account", "logout", "sign out",
                "settings", "profile", "control panel", "logged in as", "sign off"
            ]

            # Headers are mostly constant for all attempts in this run
            base_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': urlparse(target_post_url).scheme + '://' + urlparse(target_post_url).netloc if target_post_url.startswith('http') else None,
                'Referer': target_post_url
            }
            if base_headers['Origin'] is None:
                del base_headers['Origin'] # Remove if not applicable

            app.logger.info(f"SSE stream: Starting paired credential testing. Number of pairs to test: {num_pairs_to_test}")
            if num_pairs_to_test == 0:
                yield f"data: {json.dumps({'status': 'complete', 'message': 'No username/password pairs to test.'})}\n\n"
                app.logger.info("SSE stream: No pairs to test, sending completion event early.")
                return

            for i in range(num_pairs_to_test):
                # Create a new session for each attempt to ensure isolation
                with requests.Session() as session:
                    if initial_cookies:
                        session.cookies.update(initial_cookies)

                    # Use a copy of base_headers for this specific attempt if needed, though usually not modified per attempt
                    current_headers = base_headers.copy()

                    username_attempt = source_usernames[i]
                    password_attempt = source_passwords[i]

                    app.logger.info(f"SSE stream: Attempting pair {i+1}/{num_pairs_to_test}: User '{username_attempt}' with Password '********'")

                    current_payload_for_request = {
                        username_field_name: username_attempt,
                        password_field_name: password_attempt,
                    }
                    if csrf_token_name and csrf_token_value:
                        current_payload_for_request[csrf_token_name] = csrf_token_value

                    attempt_result = {
                        "username": username_attempt,
                        "password_actual": password_attempt, # For client-side reference if needed
                        "status": "unknown",
                        "response_url": None,
                        "status_code": None,
                        "content_length": None,
                        "request_details": current_payload_for_request.copy(), # Log what was sent
                        "response_body": None, # Store response for modal
                        "details": "" # Summary of analysis
                    }

                    try:
                        # The 'session' object is new for this attempt.
                        # 'initial_cookies' were applied to it if they existed.
                        # So, the state of session.cookies BEFORE the request is effectively 'initial_cookies'.

                        # Make the request
                        if form_method == 'POST':
                            response = session.post(target_post_url, data=current_payload_for_request, headers=current_headers, timeout=10, allow_redirects=True)
                        elif form_method == 'GET':
                            response = session.get(target_post_url, params=current_payload_for_request, headers=current_headers, timeout=10, allow_redirects=True)
                        else:
                            attempt_result["status"] = "error"
                            attempt_result["details"] = f"Unsupported form method: {form_method}"
                            yield f"data: {json.dumps(attempt_result)}\n\n"
                            continue

                        # After the request, session.cookies contains post-request cookies.
                        # initial_cookies (passed to event_stream) is the pre-request state for this attempt's session.

                        attempt_result["status_code"] = response.status_code
                        attempt_result["response_url"] = response.url

                        response_text_content = ""
                        try:
                            response_text_content = response.text
                            attempt_result["content_length"] = len(response_text_content)
                            attempt_result["response_body"] = response_text_content

                            MAX_RESPONSE_BODY_LOG_WARN_SIZE = 1 * 1024 * 1024 # 1MB
                            if len(response_text_content) > MAX_RESPONSE_BODY_LOG_WARN_SIZE:
                                app.logger.warning(
                                    f"Response body for {username_attempt} with password '********' is very large: "
                                    f"{len(response_text_content)} bytes. Consider implications for streaming and frontend memory."
                                )
                        except Exception as e_text_body:
                            app.logger.warning(f"Could not get response.text for response_body for user {username_attempt}: {e_text_body}")
                            attempt_result["response_body"] = f"Error retrieving response body: {str(e_text_body)}"
                            header_cl = response.headers.get('Content-Length')
                            if header_cl and header_cl.isdigit():
                                attempt_result["content_length"] = int(header_cl)
                            else:
                                attempt_result["content_length"] = -1

                        # Initialize analysis variables
                        login_score = 0
                        positive_indicators = []
                        negative_indicators = []
                        soup = BeautifulSoup(response.text, 'html.parser')
                        response_text_lower = response.text.lower()
                        original_response_length = len(response.text)

                        # --- MOVED UP: C1: Check for Significant URL Redirection ---
                        parsed_target_post_url = urlparse(target_post_url)
                        parsed_response_url = urlparse(response.url) # Defined early
                        is_redirected = len(response.history) > 0
                        is_redirected_significantly = False
                        if is_redirected:
                            if parsed_target_post_url.netloc != parsed_response_url.netloc:
                                is_redirected_significantly = True
                            else:
                                target_path_segment = (parsed_target_post_url.path.split('/')[1] if parsed_target_post_url.path.count('/') > 1 else parsed_target_post_url.path).lower()
                                response_path_segment = (parsed_response_url.path.split('/')[1] if parsed_response_url.path.count('/') > 1 else parsed_response_url.path).lower()
                                common_login_paths = ['login', 'signin', 'auth', 'account', 'authenticate']
                                if any(lp in target_path_segment for lp in common_login_paths) and not any(lp in response_path_segment for lp in common_login_paths):
                                    is_redirected_significantly = True
                                elif target_path_segment != response_path_segment and parsed_target_post_url.path != parsed_response_url.path :
                                    is_redirected_significantly = True

                        # Define is_on_known_success_page *after* redirect variables are set
                        is_on_known_success_page = (is_redirected_significantly and parsed_response_url.path.endswith('/frontend/rest/v1/welcome'))

                        # Apply scoring for redirects (still part of C1 conceptually)
                        if is_on_known_success_page:
                            login_score += 70
                            positive_indicators.append(f"Redirected to known success URL: '{parsed_response_url.path}'")
                        elif is_redirected_significantly:
                            login_score += 40
                            positive_indicators.append(f"Significant URL redirection from '{parsed_target_post_url.path}' to '{parsed_response_url.path}'")
                        elif is_redirected:
                            login_score += 5
                            positive_indicators.append(f"Minor URL redirection to '{parsed_response_url.path}'")
                        # --- END OF MOVED C1 and its scoring ---

                        # Category A: Definitive Failure Indicators
                        # A1: Check for Explicit Error Messages
                        detailed_error_messages = common_error_messages + [
                            "invalid login attempt", "please try again", "check your credentials",
                            "account disabled", "contact support", "kullanıcı bulunamadı",
                            "şifre yanlış", "hesap kilitli", "doğrulama kodu hatalı",
                            "güvenlik resmi yanlış", "captcha validation failed",
                            "csrf token mismatch", "token expired", "forbidden", "access denied"
                        ]
                        found_error_message_text = None
                        for err_msg in detailed_error_messages:
                            if err_msg in response_text_lower:
                                found_error_message_text = err_msg
                                break
                        if found_error_message_text:
                            login_score -= 100
                            negative_indicators.append(f"Found explicit error text: '{found_error_message_text}'")

                        # A2: Check for Login Form Persistence (Password Field)
                        if password_field_name and soup.find('input', {'name': password_field_name}):
                            login_score -= 75
                            negative_indicators.append(f"Login form (password field '{password_field_name}') is still present")
                        elif soup.find('input', {'type': 'password'}):
                            login_score -= 60
                            negative_indicators.append("Login form (generic password field) is still present")

                        # A3: Check for CAPTCHA
                        captcha_keywords = ["captcha", "i'm not a robot", "g-recaptcha", "recaptcha", "security check", "are you human"]
                        captcha_elements_selectors = [
                            {'class': 'g-recaptcha'},
                            {'id': lambda x: x and 'captcha' in x.lower()},
                            {'name': lambda x: x and 'captcha' in x.lower()}
                        ]
                        found_captcha_keyword = any(kw in response_text_lower for kw in captcha_keywords)
                        found_captcha_element = any(soup.find(attrs=selector) for selector in captcha_elements_selectors)

                        # is_on_known_success_page is already defined
                        if found_captcha_keyword or found_captcha_element:
                            if is_on_known_success_page: # If we are on success page, CAPTCHA (from prev page) is less of a failure indicator
                                login_score -= 10
                                negative_indicators.append("CAPTCHA elements/keywords detected (possibly on intermediate page, but landed on welcome)")
                            else: # If not on success page and CAPTCHA found, it's a strong failure signal
                                login_score -= 100
                                negative_indicators.append("CAPTCHA challenge detected on page")

                        # A4: Check for Critical HTTP Error Codes
                        if response.status_code in [401, 403, 429]:
                            login_score -= 100
                            negative_indicators.append(f"Received critical HTTP error code: {response.status_code}")
                        elif response.status_code >= 400 and response.status_code < 500:
                            login_score -= 40
                            negative_indicators.append(f"Received client-side HTTP error code: {response.status_code}")

                        # Category B: Definitive Success Indicators
                        # B1: Check for Definitive Post-Login Elements
                        post_login_selectors = [
                            {'href': lambda href: href and ('logout' in href.lower() or 'signout' in href.lower() or 'logoff' in href.lower())},
                            {'id': lambda x: x and ('dashboard' in x.lower() or 'user-profile' in x.lower() or 'account-settings' in x.lower())},
                            {'class': lambda x: x and any(c in x.lower() for c in ['user-menu', 'profile-dropdown', 'site-header-actions--logged-in'])},
                            {'aria-label': lambda x: x and ('logout' in x.lower() or 'profile' in x.lower())},
                        ]
                        found_post_login_element_detail = None
                        for selector_type in post_login_selectors:
                            if isinstance(selector_type, dict):
                                found_element = soup.find(attrs=selector_type)
                                if found_element:
                                    found_post_login_element_detail = f"Found element matching {selector_type}"
                                    break
                        if found_post_login_element_detail:
                            login_score += 80
                            positive_indicators.append(f"Found definitive post-login element ({found_post_login_element_detail})")

                        # B2: Check for User-Specific Information (Expected Username)
                        if username_attempt and username_attempt.lower() in response_text_lower:
                            is_in_input_value = False
                            for input_tag in soup.find_all('input'):
                                if input_tag.get('value', '').lower() == username_attempt.lower():
                                    is_in_input_value = True
                                    break
                            if not is_in_input_value:
                                login_score += 70
                                positive_indicators.append(f"Expected username '{username_attempt}' found in page body (not as input value)")
                            else:
                                login_score -= 10
                                negative_indicators.append(f"Expected username '{username_attempt}' found, but only in an input field value (potential prefill on failure)")

                        # Category C: Strong Corroborating Indicators (C1 was moved up)
                        # C2: Check for Changed Cookies
                        pre_request_cookies_dict = initial_cookies.copy() if initial_cookies else {}
                        post_request_cookies_dict = session.cookies.get_dict()
                        cookies_changed = False

                        if len(post_request_cookies_dict) != len(pre_request_cookies_dict):
                            cookies_changed = True
                        else:
                            for k, v in post_request_cookies_dict.items():
                                if k not in pre_request_cookies_dict or pre_request_cookies_dict[k] != v:
                                    cookies_changed = True
                                    break

                        if cookies_changed:
                            app.logger.info(f"SSE stream: Cookies changed for user {username_attempt} (pass: ****). Before: {len(pre_request_cookies_dict)} keys, After: {len(post_request_cookies_dict)} keys. Pre: {pre_request_cookies_dict}, Post: {post_request_cookies_dict}")
                            login_score += 25
                            positive_indicators.append("Session cookies were set or changed")

                        # C3: Check for Absence of Login Form (Password Field)
                        # This is the inverse of A2. More reliable if specific password_field_name is NOT found.
                        if password_field_name and not soup.find('input', {'name': password_field_name}) and not soup.find('input', {'type': 'password'}):
                            login_score += 20
                            positive_indicators.append(f"Login form (password field '{password_field_name}' or generic) is no longer present")
                        elif not soup.find('input', {'type': 'password'}): # Generic check
                            login_score += 15 # Slightly less if only generic check passes
                            positive_indicators.append("Login form (generic password field) is no longer present")

                        # C4: Check for "Soft" Failure URL
                        soft_failure_url_patterns = ["error=", "login_failed=", "failure=", "denied=", "auth_error="]
                        if any(pattern in response.url.lower() for pattern in soft_failure_url_patterns):
                            login_score -= 30
                            negative_indicators.append(f"URL '{response.url}' contains failure parameters")

                        # C5: Check for Success Keywords in Body/URL
                        # Using a refined list of success keywords
                        refined_success_keywords = [
                            "welcome back", "successfully logged in", "dashboard overview",
                            "my profile", "account settings", "control panel access", "manage account",
                            "logout", "sign out" # Be careful with "logout" if not tied to a link element
                        ]
                        if any(kw in response_text_lower for kw in refined_success_keywords) or \
                           any(kw in response.url.lower() for kw in refined_success_keywords):
                            login_score += 15
                            positive_indicators.append("Found success-associated keyword in body/URL")

                        # C6: Check for HTTP 200 OK on POST URL (potential soft failure)
                        # This means the page might have just reloaded with an error message not caught by A1.
                        if response.status_code == 200 and response.url == target_post_url and not is_redirected:
                            login_score -= 20
                            negative_indicators.append("Page reloaded with 200 OK (same URL as POST), indicating probable soft failure (no redirect)")


                        # Category D: Contextual & Minor Indicators
                        # D1: Check for Page Title Change
                        # This requires knowing the original page title. For now, we can check if the title
                        # seems like a "non-login" title.
                        title_tag = soup.find('title')
                        if title_tag:
                            page_title_lower = title_tag.get_text(strip=True).lower()
                            login_related_titles = ["login", "log in", "sign in", "signin", "authenticate", "access"]
                            dashboard_related_titles = ["dashboard", "my account", "profile", "settings", "welcome"]
                            if any(dt in page_title_lower for dt in dashboard_related_titles) and \
                               not any(lt in page_title_lower for lt in login_related_titles):
                                login_score += 10
                                positive_indicators.append(f"Page title changed to '{page_title_lower}', suggesting success")
                            elif any(lt in page_title_lower for lt in login_related_titles) and not found_error_message_text and not soup.find('input', {'type': 'password'}):
                                # Title still says login, but form is gone and no error, could be intermediate step or odd success
                                login_score += 5
                                positive_indicators.append(f"Page title ('{page_title_lower}') still login-related, but form gone and no errors.")
                            elif any(lt in page_title_lower for lt in login_related_titles) and (found_error_message_text or soup.find('input', {'type': 'password'})):
                                login_score -=5
                                negative_indicators.append(f"Page title ('{page_title_lower}') remains login-related with other failure signs.")


                        # D2: Check for Increased Response Size
                        # This is tricky without a baseline. A very small response after login might be an error.
                        # A significantly larger one might be a dashboard.
                        # Let's assume a "typical" error page is < 5KB and a dashboard > 10KB. This is highly speculative.
                        current_response_length = len(response.text)
                        if current_response_length > 10000 and not found_error_message_text: # > 10KB and no obvious error
                            login_score += 10
                            positive_indicators.append(f"Response size ({current_response_length} bytes) is relatively large, may indicate a content-rich page (e.g., dashboard)")
                        elif current_response_length < 2000 and not is_redirected_significantly : # < 2KB and not a significant redirect (could be a small success confirmation)
                            # If it's very small but we have other strong success signals, it might be ok (e.g. API success message)
                            # If it's small and we have failure signals, it reinforces failure.
                            # This check alone is weak.
                            pass # Avoid penalizing too much for small size alone if other indicators are mixed.

                        # D3: Check for Input Field Error Classes
                        error_input_classes = ["input-error", "field-error", "has-error", "is-invalid"]
                        found_error_class = False
                        for input_tag in soup.find_all('input'):
                            input_classes = input_tag.get('class', [])
                            if any(err_cls in input_classes for err_cls in error_input_classes):
                                found_error_class = True
                                break
                        if found_error_class:
                            login_score -= 15
                            negative_indicators.append("Found CSS error classes on input fields")

                        # D4: Check for Redirect Loop
                        if len(response.history) > 10: # requests default max_redirects is 30
                            login_score -= 50
                            negative_indicators.append(f"Potential redirect loop detected ({len(response.history)} redirects)")

                        # D5: Check for API-Driven Login (JSON response)
                        try:
                            json_response = response.json()
                            if isinstance(json_response, dict):
                                # Check for success patterns
                                if json_response.get('success') is True or \
                                   json_response.get('status','').lower() == 'success' or \
                                   any(k in json_response for k in ['token', 'session_id', 'auth_token', 'jwt']):
                                    login_score += 90
                                    positive_indicators.append("API success response detected (e.g., success:true or token found)")
                                # Check for failure patterns
                                elif json_response.get('success') is False or \
                                     any(k in json_response for k in ['error', 'errors', 'message']) or \
                                     json_response.get('status','').lower() in ['fail', 'failure', 'error'] :

                                    error_message_from_json = json_response.get('error') or json_response.get('message') or json.dumps(json_response.get('errors'))
                                    login_score -= 90
                                    negative_indicators.append(f"API failure response detected (e.g., success:false or error message: {error_message_from_json})")
                                else:
                                    # Neutral JSON response, not clearly success or failure by common patterns
                                    login_score += 0 # No change, needs other indicators
                                    positive_indicators.append("JSON response received, structure not indicative of immediate success/failure")
                        except json.JSONDecodeError:
                            # Not a JSON response, this check doesn't apply
                            pass


                        # D6: Check for 2FA/MFA Prompt
                        mfa_keywords = ["two-factor", "2fa", "mfa", "multi-factor", "verification code", "authenticator app", "security code", "enter code"]
                        if any(kw in response_text_lower for kw in mfa_keywords):
                            login_score += 30 # Partial success, but needs more action
                            positive_indicators.append("2FA/MFA prompt detected. User authenticated, needs second factor.")
                            # Optionally, could set a specific status here like "needs_2fa" if score is ambiguous.

                        # D7: Check for Welcome Message Specificity
                        welcome_messages_generic = ["welcome", "hello"]
                        welcome_messages_user_specific_pattern = rf"(welcome|hello|hi)[\s,]+{re.escape(username_attempt)}[!\.]?" if username_attempt else None

                        found_generic_welcome = any(f" {wm} " in response_text_lower or f"{wm}!" in response_text_lower for wm in welcome_messages_generic)
                        found_specific_welcome = False
                        if welcome_messages_user_specific_pattern:
                             if re.search(welcome_messages_user_specific_pattern, response_text_lower, re.IGNORECASE):
                                found_specific_welcome = True

                        if found_specific_welcome:
                            login_score += 50
                            positive_indicators.append(f"Specific welcome message found for user '{username_attempt}'")
                        elif found_generic_welcome and not found_specific_welcome: # Generic welcome, but not specific (and B2 didn't catch it more strongly)
                            if not any("welcome to our service" in pi.lower() for pi in positive_indicators): # Avoid double counting if already part of a keyword
                                login_score += 5
                                positive_indicators.append("Generic welcome message found")


                        # D8: Check for Session-Related Headers (Set-Cookie in the final response)
                        # This is somewhat covered by C2 (cookies_changed), but specifically looks at the final response headers.
                        if 'Set-Cookie' in response.headers:
                            # Check if this specific indicator for Set-Cookie is already covered by "cookies_changed" to avoid double points for same underlying reason
                            already_counted_cookie_change = any("cookies were set or changed" in pi for pi in positive_indicators)
                            if not already_counted_cookie_change:
                                login_score += 15
                                positive_indicators.append("Set-Cookie header found in the final response, indicating session activity")

                        # Ensure positive and negative indicators are unique to avoid clutter if same condition met multiple ways
                        positive_indicators = list(set(positive_indicators))
                        negative_indicators = list(set(negative_indicators))

                        # Determine Final Status and Details
                        final_status = "unknown"
                        if login_score >= 50:
                            final_status = "success"
                        elif login_score <= -50:
                            final_status = "failure"
                        # else: final_status remains "unknown" or could be "likely_success/failure" based on score bands

                        details_string = f"Final Score: {login_score}. Positive Indicators: {positive_indicators}. Negative Indicators: {negative_indicators}."
                        if final_status == "unknown":
                            if login_score > 0:
                                details_string += " (Ambiguous, leaning positive)"
                            elif login_score < 0:
                                details_string += " (Ambiguous, leaning negative)"
                            else:
                                details_string += " (Ambiguous, neutral score)"


                        attempt_result["status"] = final_status
                        attempt_result["details"] = details_string
                        attempt_result["analysis"] = {
                            "score": login_score,
                            "positive_indicators": positive_indicators,
                            "negative_indicators": negative_indicators
                        }

                        # Log the detailed analysis for debugging on the server
                        app.logger.debug(f"SSE stream: User '{username_attempt}', Pass '********', Final Score: {login_score}, Status: {final_status}")
                        app.logger.debug(f"Positive Indicators: {positive_indicators}")
                        app.logger.debug(f"Negative Indicators: {negative_indicators}")

                        yield f"data: {json.dumps(attempt_result)}\n\n"

                    except requests.exceptions.Timeout:
                        attempt_result["status"] = "error"
                        attempt_result["details"] = "Request timed out during login attempt."
                        app.logger.warning(f"SSE stream: Timeout for user {username_attempt} (pass: ****)", exc_info=False)
                        yield f"data: {json.dumps(attempt_result)}\n\n"
                    except requests.exceptions.RequestException as e:
                        attempt_result["status"] = "error"
                        attempt_result["details"] = f"Request error: {str(e)}"
                        app.logger.error(f"SSE stream: RequestException for user {username_attempt} (pass: ****): {str(e)}", exc_info=True)
                        yield f"data: {json.dumps(attempt_result)}\n\n"
                    except Exception as e:
                        attempt_result["status"] = "error"
                        attempt_result["details"] = "An unexpected error occurred during this attempt."
                        app.logger.error(f"SSE stream: Unexpected error for user {username_attempt} (pass: ****)", exc_info=True)
                        yield f"data: {json.dumps(attempt_result)}\n\n"

                completion_event = {'status': 'complete', 'message': 'All credential tests finished.'}
                app.logger.info("SSE stream: All pairs processed, sending completion event.")
                yield f"data: {json.dumps(completion_event)}\n\n"

        return Response(event_stream(), mimetype='text/event-stream')

    except Exception as e:
        app.logger.error(f"Error in /test_credentials before streaming: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred before streaming could start."}), 500

if __name__ == '__main__':
    # Removed argparse logic for --auth-file
    app.run(debug=True, port=5001)
