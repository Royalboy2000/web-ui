from flask import Flask, jsonify, request, render_template, Response # Add Response
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import json # For serializing data to JSON strings

# Attempt to import from local common_field_names.py
try:
    from .common_field_names import COMMON_USERNAME_FIELDS, COMMON_PASSWORD_FIELDS, COMMON_CSRF_TOKEN_FIELDS
except ImportError:
    # Fallback for environments where relative import might fail (e.g. running script directly)
    import common_field_names
    COMMON_USERNAME_FIELDS = common_field_names.COMMON_USERNAME_FIELDS
    COMMON_PASSWORD_FIELDS = common_field_names.COMMON_PASSWORD_FIELDS
    COMMON_CSRF_TOKEN_FIELDS = common_field_names.COMMON_CSRF_TOKEN_FIELDS


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
                for common_p_name in COMMON_PASSWORD_FIELDS:
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
        for name_candidate in COMMON_USERNAME_FIELDS:
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
                for common_csrf_name_candidate in COMMON_CSRF_TOKEN_FIELDS:
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
                    if 'Origin' in headers: del headers['Origin'] # Ensure it's removed if None

                app.logger.info(f"SSE stream: Starting paired credential testing. Number of pairs to test: {num_pairs_to_test}")
                if num_pairs_to_test == 0: # Should have been caught by list empty checks
                    yield f"data: {json.dumps({'status': 'complete', 'message': 'No username/password pairs to test.'})}\n\n"
                    app.logger.info("SSE stream: No pairs to test, sending completion event early.")
                    return

                for i in range(num_pairs_to_test):
                    username_attempt = username_list[i]
                    password_attempt = password_list[i]

                    app.logger.info(f"SSE stream: Attempting pair {i+1}/{num_pairs_to_test}: User '{username_attempt}' with Password '********'")

                    payload = {
                        username_field_name: username_attempt,
                        password_field_name: password_attempt,
                    }
                    if csrf_token_name and csrf_token_value:
                        payload[csrf_token_name] = csrf_token_value

                    attempt_result = {
                        "username": username_attempt,
                        "password": password_attempt, # Actual password sent in stream
                        "status": "unknown",
                        "response_url": None,
                        "status_code": None,
                        "details": ""
                    }

                    try:
                        pre_request_cookies = session.cookies.copy()

                        if form_method == 'POST':
                            response = session.post(target_post_url, data=payload, headers=headers, timeout=10, allow_redirects=True)
                        elif form_method == 'GET':
                            response = session.get(target_post_url, params=payload, headers=headers, timeout=10, allow_redirects=True)
                        else:
                            attempt_result["status"] = "error"
                            attempt_result["details"] = f"Unsupported form method: {form_method}"
                            yield f"data: {json.dumps(attempt_result)}\n\n"
                            continue

                        attempt_result["status_code"] = response.status_code
                        attempt_result["response_url"] = response.url

                        response_text_lower = response.text.lower()
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
                        app.logger.warning(f"SSE stream: Timeout for user {username_attempt} (pass: ****)", exc_info=False) # exc_info=False for less noise on frequent timeouts
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
        # Ensure this returns a standard JSON error response, not trying to stream if setup fails
        return jsonify({"error": f"An unexpected server error occurred before streaming could start."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
