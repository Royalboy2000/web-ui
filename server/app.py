from flask import Flask, jsonify, request, render_template, Response
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs # Added parse_qs
import json
import os
import sys

# Add the parent directory of 'server' to sys.path to find common_field_names
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import common_field_names

app = Flask(__name__, static_folder='static', template_folder='templates')

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
        username_list = data['username_list']
        password_list = data['password_list']
        form_method = data.get('form_method', 'POST').upper()

        if not isinstance(username_list, list):
            app.logger.warning(f"'username_list' is not a list in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'username_list' must be a list."}), 400
        if not username_list:
            app.logger.warning(f"'username_list' is empty in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'username_list' cannot be empty."}), 400

        if not isinstance(password_list, list):
            app.logger.warning(f"'password_list' is not a list in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'password_list' must be a list."}), 400
        if not password_list:
            app.logger.warning(f"Received request with empty password_list from {request.remote_addr}.")
            return jsonify({"error": "'password_list' cannot be empty."}), 400

        csrf_token_name = data.get('csrf_token_name')
        csrf_token_value = data.get('csrf_token_value')
        initial_cookies = data.get('cookies', {})

        def event_stream():
            app.logger.info(f"SSE stream: Starting for {len(username_list)} users and {len(password_list)} passwords (paired).")
            num_pairs_to_test = min(len(username_list), len(password_list))

            initial_info = {
                "type": "info",
                "total_expected_attempts": num_pairs_to_test,
                "message": f"Test run initiated. Expecting {num_pairs_to_test} pairs to be tested."
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

            with requests.Session() as session:
                if initial_cookies:
                    session.cookies.update(initial_cookies)

                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': urlparse(target_post_url).scheme + '://' + urlparse(target_post_url).netloc if target_post_url.startswith('http') else None,
                    'Referer': target_post_url
                }
                if headers['Origin'] is None:
                    if 'Origin' in headers: del headers['Origin']

                app.logger.info(f"SSE stream: Starting paired credential testing. Number of pairs to test: {num_pairs_to_test}")
                if num_pairs_to_test == 0:
                    yield f"data: {json.dumps({'status': 'complete', 'message': 'No username/password pairs to test.'})}\n\n"
                    app.logger.info("SSE stream: No pairs to test, sending completion event early.")
                    return

                for i in range(num_pairs_to_test):
                    username_attempt = username_list[i]
                    password_attempt = password_list[i]

                    app.logger.info(f"SSE stream: Attempting pair {i+1}/{num_pairs_to_test}: User '{username_attempt}' with Password '********'")

                    current_payload_for_request = { # Corrected variable name
                        username_field_name: username_attempt,
                        password_field_name: password_attempt,
                    }
                    if csrf_token_name and csrf_token_value:
                        current_payload_for_request[csrf_token_name] = csrf_token_value

                    attempt_result = {
                        "username": username_attempt,
                        "password_actual": password_attempt,
                        "status": "unknown",
                        "response_url": None,
                        "status_code": None,
                        "content_length": None,
                        "request_details": current_payload_for_request.copy(),
                        "response_body": None,
                        "details": ""
                    }

                    try:
                        pre_request_cookies = session.cookies.copy()

                        if form_method == 'POST':
                            response = session.post(target_post_url, data=current_payload_for_request, headers=headers, timeout=10, allow_redirects=True)
                        elif form_method == 'GET':
                            response = session.get(target_post_url, params=current_payload_for_request, headers=headers, timeout=10, allow_redirects=True)
                        else:
                            attempt_result["status"] = "error"
                            attempt_result["details"] = f"Unsupported form method: {form_method}"
                            yield f"data: {json.dumps(attempt_result)}\n\n"
                            continue

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

                        response_text_lower = response_text_content.lower()
                        attempt_result["status"] = "failure"

                        found_error_message_text = None
                        for err_msg in common_error_messages:
                            if err_msg in response_text_lower:
                                found_error_message_text = err_msg
                                break

                        if found_error_message_text:
                            attempt_result["details"] = f"Login failed: Found error message '{found_error_message_text}' in response."
                        elif response.status_code >= 400:
                            attempt_result["details"] = f"Login attempt failed with HTTP status code: {response.status_code}."
                        else:
                            parsed_target_post_url = urlparse(target_post_url)
                            parsed_response_url = urlparse(response.url)
                            is_redirected = len(response.history) > 0
                            is_redirected_significantly = is_redirected and \
                                (parsed_target_post_url.netloc != parsed_response_url.netloc or \
                                (parsed_target_post_url.path.split('/')[1] if parsed_target_post_url.path.count('/') > 1 else '') != \
                                (parsed_response_url.path.split('/')[1] if parsed_response_url.path.count('/') > 1 else ''))
                            has_success_keywords_in_url = any(succ_kw in response.url.lower() for succ_kw in common_success_keywords)
                            has_success_keywords_in_body = any(succ_kw in response_text_lower for succ_kw in common_success_keywords)

                            post_request_cookies = session.cookies.get_dict()
                            cookies_changed = False
                            if len(post_request_cookies) > len(pre_request_cookies):
                                cookies_changed = True
                            else:
                                for k, v in post_request_cookies.items():
                                    if k not in pre_request_cookies or pre_request_cookies[k] != v:
                                        cookies_changed = True
                                        break
                            if cookies_changed:
                                 app.logger.info(f"SSE stream: Cookies changed for user {username_attempt} (pass: ****). Before: {len(pre_request_cookies)} keys, After: {len(post_request_cookies)} keys.")

                            if is_redirected_significantly:
                                attempt_result["status"] = "success"
                                attempt_result["details"] = f"Success: Redirected from login page to {response.url} (Status: {response.status_code})."
                            elif (has_success_keywords_in_url or has_success_keywords_in_body):
                                attempt_result["status"] = "success"
                                attempt_result["details"] = f"Success: Found success keywords in URL/body (Status: {response.status_code})."
                            elif response.status_code == 200 and cookies_changed and not is_redirected_significantly and not (parsed_target_post_url.path == parsed_response_url.path and parsed_target_post_url.query == parsed_response_url.query) :
                                 attempt_result["status"] = "success"
                                 attempt_result["details"] = f"Possible success: Status 200, new/changed cookies, and URL changed to {response.url}."
                            elif response.status_code == 200 and cookies_changed:
                                 attempt_result["status"] = "success"
                                 attempt_result["details"] = f"Possible success: Status 200, new/changed cookies detected. Final URL: {response.url}."
                            elif response.status_code == 200:
                                 attempt_result["details"] = f"Status 200, but no clear success indicators. Final URL: {response.url}. Likely a soft failure."
                            else:
                                attempt_result["details"] = f"Login attempt status unclear. Final URL: {response.url} (Status: {response.status_code})."

                        app.logger.debug(f"SSE stream: Yielding result for {username_attempt} - {attempt_result['status']}")
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
    app.run(debug=True, port=5001)
