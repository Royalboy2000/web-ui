from flask import Flask, jsonify, request, render_template # Added render_template
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse # To resolve relative URLs, and parse for domain/path comparison

app = Flask(__name__, static_folder='static', template_folder='templates') # Explicitly define folders

# Serve the main index.html page
@app.route('/')
def serve_index():
    return render_template('index.html')

@app.route('/analyze_url', methods=['POST'])
def analyze_url():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    if request.is_json:
        app.logger.debug(f"Request JSON payload: {request.get_json()}")
    try:
        data = request.get_json()
        if not data or 'url' not in data:
            app.logger.warning(f"Missing 'url' in request payload from {request.remote_addr}")
            return jsonify({"error": "Missing 'url' in request payload"}), 400

        target_url = data['url']

        headers = { # Mimic a common browser User-Agent
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

        # Use a session object to handle cookies automatically
        session = requests.Session()
        response = session.get(target_url, headers=headers, timeout=10) # 10 second timeout
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)

        soup = BeautifulSoup(response.text, 'html.parser')

        # --- Form Detection Logic (Basic) ---
        login_form = None
        password_input_field = None # Renamed from password_input to avoid confusion

        # Try to find a form containing a password input
        password_inputs = soup.find_all('input', {'type': 'password'})
        if not password_inputs:
            return jsonify({"error": "No password input field found on the page."}), 404

        # For simplicity, take the first password input found.
        password_input_field = password_inputs[0]
        login_form = password_input_field.find_parent('form')

        if not login_form:
            return jsonify({"error": "Password field found, but it's not within a form."}), 404

        # --- Extract Form Details ---
        action_url = login_form.get('action')
        post_url = urljoin(target_url, action_url) # Resolve relative path to absolute
        form_method = login_form.get('method', 'POST').upper() # Default to POST

        # --- Username Field Detection (Basic Heuristic) ---
        username_field_name = None
        common_username_names = ['username', 'email', 'user', 'login', 'log', 'usr', 'id', 'user_id', 'login_id', 'name', 'txtUser', 'txtEmail']

        text_inputs = login_form.find_all('input', {'type': ['text', 'email', 'tel']})

        found_username_input = None
        # 1. Try common names
        for name_attr_val in common_username_names:
            for inp in text_inputs:
                if (inp.get('name') and inp.get('name').lower() == name_attr_val.lower()) or \
                   (inp.get('id') and inp.get('id').lower() == name_attr_val.lower()):
                    found_username_input = inp
                    break
            if found_username_input:
                break

        # 2. Fallback: try to find any text input that appears before the password input
        if not found_username_input:
            for inp in text_inputs:
                if inp != password_input_field and hasattr(inp, 'sourceline') and hasattr(password_input_field, 'sourceline') and inp.sourceline < password_input_field.sourceline:
                    # Basic check: is it "near" the password field (e.g. previous sibling or parent's previous sibling)
                    # This can be complex, for now, first one before password input
                    username_field_name = inp.get('name') or inp.get('id')
                    if username_field_name: # Take the first one that has a name or id
                        found_username_input = inp
                        break

        if found_username_input:
            username_field_name = found_username_input.get('name') or found_username_input.get('id')
        else:
             username_field_name = "Could not auto-detect"


        password_field_name = password_input_field.get('name') or password_input_field.get('id') or "Could not auto-detect"

        # --- CSRF Token Detection (Basic) ---
        csrf_token_name = None
        csrf_token_value = None
        common_csrf_names = ['csrf_token', '_token', 'csrfmiddlewaretoken', 'authenticity_token', '_csrf', 'xsrf_token']

        hidden_inputs = login_form.find_all('input', {'type': 'hidden'})
        for hidden_input in hidden_inputs:
            input_name = hidden_input.get('name')
            if input_name and any(csrf_name.lower() in input_name.lower() for csrf_name in common_csrf_names):
                csrf_token_name = input_name
                csrf_token_value = hidden_input.get('value')
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
        return jsonify(analysis_result), 200

    except requests.exceptions.Timeout as e:
        app.logger.warning(f"Timeout fetching URL {data.get('url', 'N/A')} in /analyze_url: {str(e)}")
        return jsonify({"error": "Request timed out while fetching the URL."}), 504
    except requests.exceptions.RequestException as e:
        app.logger.error(f"RequestException fetching URL {data.get('url', 'N/A')} in /analyze_url: {str(e)}", exc_info=True)
        return jsonify({"error": f"Error fetching or processing URL: {str(e)}"}), 500 # Keep str(e) for client for RequestExceptions if it's not too verbose
    except Exception as e:
        app.logger.error(f"An unexpected error occurred in {request.path}: {str(e)}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred."}), 500

@app.route('/test_credentials', methods=['POST'])
def test_credentials():
    app.logger.info(f"Received request for {request.path} from {request.remote_addr}")
    if request.is_json:
        app.logger.debug(f"Request JSON payload (password_list might be long, showing keys): {list(request.get_json().keys()) if request.get_json() else 'None'}")
    try:
        data = request.get_json()
        required_fields = [
            "target_post_url", "username_field_name", "password_field_name",
            "username_list", "password_list", "form_method" # Changed "username" to "username_list"
        ]
        if not data or not all(field in data for field in required_fields):
            missing = [field for field in required_fields if field not in data]
            app.logger.warning(f"Missing required fields in /test_credentials from {request.remote_addr}: {', '.join(missing)}")
            return jsonify({"error": f"Missing required fields in request payload: {', '.join(missing)}"}), 400

        target_post_url = data['target_post_url']
        username_field_name = data['username_field_name']
        password_field_name = data['password_field_name']
        username_list = data['username_list'] # Changed from username
        password_list = data['password_list']
        form_method = data.get('form_method', 'POST').upper()

        if not isinstance(username_list, list):
            app.logger.warning(f"'username_list' is not a list in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'username_list' must be a list."}), 400
        if not username_list:
            app.logger.warning(f"'username_list' is empty in /test_credentials from {request.remote_addr}")
            return jsonify({"error": "'username_list' cannot be empty."}), 400

        csrf_token_name = data.get('csrf_token_name')
        csrf_token_value = data.get('csrf_token_value')
        initial_cookies = data.get('cookies', {})

        results = []

        with requests.Session() as session:
            if initial_cookies:
                session.cookies.update(initial_cookies)

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': target_post_url.split('/')[0] + '//' + target_post_url.split('/')[2] if target_post_url.startswith('http') else None,
                'Referer': target_post_url
            }
            # Remove Origin if it could not be derived (e.g. relative URL used for post_url, though analyze_url should make it absolute)
            if headers['Origin'] is None:
                del headers['Origin']

            for username_attempt in username_list:
                app.logger.info(f"Starting attempts for username: {username_attempt} against {target_post_url}")
                for password_attempt in password_list:
                    payload = {
                        username_field_name: username_attempt, # Use username_attempt
                        password_field_name: password_attempt,
                    }
                    if csrf_token_name and csrf_token_value:
                        payload[csrf_token_name] = csrf_token_value

                    attempt_result = {
                        "username": username_attempt, # Add username to result
                        "password": password_attempt,
                        "status": "unknown",
                        "response_url": None,
                    "status_code": None,
                    "details": ""
                }

                try:
                    current_cookies = session.cookies.get_dict()

                    if form_method == 'POST':
                        response = session.post(target_post_url, data=payload, headers=headers, timeout=10, allow_redirects=True)
                    elif form_method == 'GET':
                        response = session.get(target_post_url, params=payload, headers=headers, timeout=10, allow_redirects=True)
                    else:
                        attempt_result["status"] = "error"
                        attempt_result["details"] = f"Unsupported form method: {form_method}"
                        results.append(attempt_result)
                        continue

                    attempt_result["status_code"] = response.status_code
                    attempt_result["response_url"] = response.url

                    response_text_lower = response.text.lower()
                    # Expanded error messages
                    common_error_messages = [
                        "incorrect password", "invalid password", "login failed", "login failure",
                        "wrong credentials", "authentication failed", "invalid username or password",
                        "username or password incorrect", "user not found", "account locked",
                        "too many attempts", "session expired", "login error", "access denied",
                        "unauthorized", "kullanıcı adı veya şifre hatalı", "e-posta veya şifre yanlış" # Turkish examples
                    ]
                    # Common success keywords
                    common_success_keywords = [
                        "welcome", "dashboard", "my account", "logout", "sign out",
                        "settings", "profile", "control panel", "logged in as"
                    ]

                    attempt_result["status"] = "failure" # Default to failure

                    # 1. Check for explicit error messages in response body
                    found_error_message = None
                    for err_msg in common_error_messages:
                        if err_msg in response_text_lower:
                            found_error_message = err_msg
                            break

                    if found_error_message:
                        attempt_result["details"] = f"Login failed: Found error message '{found_error_message}' in response."
                    # 2. Check for non-successful/non-redirect status codes
                    # Typical success (200-299), redirect (300-399).
                    # For this specific case, 200 might still be a failure if on the same page with errors.
                    # Redirects (3xx) are often good signs if not immediately showing an error.
                    # Client errors (4xx) or Server errors (5xx) are usually failures.
                    elif response.status_code >= 400:
                        attempt_result["details"] = f"Login attempt failed with HTTP status code: {response.status_code}."
                    # 3. Potential Success Indicators (only if no explicit errors found and status code is plausible e.g. 200 or 302)
                    else:
                        parsed_target_url = urlparse(target_post_url)
                        parsed_response_url = urlparse(response.url)

                        # Significant redirect: different domain or different first path segment
                        is_redirected_significantly = response.history and \
                                                      (parsed_target_url.netloc != parsed_response_url.netloc or
                                                       (parsed_target_url.path.split('/')[1] if parsed_target_url.path else '') !=
                                                       (parsed_response_url.path.split('/')[1] if parsed_response_url.path else ''))

                        has_success_keywords_in_url = any(succ_kw in response.url.lower() for succ_kw in common_success_keywords)
                        has_success_keywords_in_body = any(succ_kw in response_text_lower for succ_kw in common_success_keywords)

                        pre_request_cookies_count = len(current_cookies)
                        post_request_cookies_count = len(session.cookies.get_dict())

                        if is_redirected_significantly:
                            attempt_result["status"] = "success"
                            attempt_result["details"] = f"Success: Redirected to {response.url} (Status: {response.status_code})."
                        elif (has_success_keywords_in_url or has_success_keywords_in_body):
                            attempt_result["status"] = "success"
                            attempt_result["details"] = f"Success: Found success keywords in URL/body (Status: {response.status_code})."
                        elif response.status_code == 200 and post_request_cookies_count > pre_request_cookies_count:
                             attempt_result["status"] = "success" # Tentative
                             attempt_result["details"] = f"Possible success: Status 200, new cookies set. Final URL: {response.url}."
                        elif response.status_code == 200:
                             # Still on same page (or similar), no errors, but no strong success keywords/redirect/cookies.
                             attempt_result["details"] = f"Status 200, but no clear success indicators (e.g. redirect, keywords, new cookies). Final URL: {response.url}. Likely a soft failure."
                        else: # e.g. redirect to same page, or other 3xx codes without clear success
                            attempt_result["details"] = f"Login attempt status unclear. Final URL: {response.url} (Status: {response.status_code})."

                    # Log cookie changes (informational)
                    if session.cookies.get_dict() != current_cookies:
                        app.logger.info(f"Cookies changed during attempt for user {username_attempt} with password {password_attempt[:1]}***. Before: {current_cookies}, After: {session.cookies.get_dict()}")


                except requests.exceptions.Timeout:
                    attempt_result["status"] = "error"
                    attempt_result["details"] = "Request timed out during login attempt."
                    app.logger.warning(f"Timeout during login attempt for user {username_attempt} to {target_post_url} with password {password_attempt[:1]}***")
                except requests.exceptions.RequestException as e:
                    attempt_result["status"] = "error"
                    attempt_result["details"] = f"Request error during login attempt: {str(e)}"
                    app.logger.error(f"RequestException during login attempt for user {username_attempt} to {target_post_url} with password {password_attempt[:1]}***: {str(e)}", exc_info=True)

                results.append(attempt_result)

        app.logger.info(f"Completed all credential tests. Total results: {len(results)}")
        return jsonify(results), 200

    except Exception as e:
        app.logger.error(f"An unexpected error occurred in {request.path}: {str(e)}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
