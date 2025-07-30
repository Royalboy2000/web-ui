from flask import Flask, jsonify, request, render_template, Response
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs # Added parse_qs
import json
import os
import sys
import re
import random
import difflib
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import threading
from cachetools import TTLCache
import tempfile
from werkzeug.utils import secure_filename
# Removed argparse import

# Add the parent directory of 'server' to sys.path to find common_field_names
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import server-side upload functionality
from server_side_upload import setup_file_upload_routes, extract_credentials_from_file, parse_credentials_enhanced

# Add fixed upload endpoint
from werkzeug.utils import secure_filename
import tempfile
import atexit

def setup_fixed_upload_endpoint(app):
    """
    Add the fixed upload endpoint to the Flask app
    """

    @app.route('/upload_credentials', methods=['POST'])
    def upload_credentials():
        """
        Fixed upload endpoint that properly handles file uploads
        and returns structured response for the frontend
        """
        try:
            # Check if file is present in request
            if 'credential_file' not in request.files:
                return jsonify({
                    'error': 'No file provided',
                    'message': 'Please select a credential file to upload'
                }), 400

            file = request.files['credential_file']

            # Check if file was actually selected
            if file.filename == '':
                return jsonify({
                    'error': 'No file selected',
                    'message': 'Please select a credential file to upload'
                }), 400

            # Validate file extension
            allowed_extensions = {'.txt', '.csv', '.list'}
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in allowed_extensions:
                return jsonify({
                    'error': 'Invalid file type',
                    'message': f'Supported formats: {", ".join(allowed_extensions)}'
                }), 400

            # Check file size (limit to 10MB)
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)  # Reset file pointer

            if file_size > 10 * 1024 * 1024:  # 10MB limit
                return jsonify({
                    'error': 'File too large',
                    'message': 'File size must be less than 10MB'
                }), 400

            # Read file content
            try:
                content = file.read().decode('utf-8')
            except UnicodeDecodeError:
                try:
                    file.seek(0)
                    content = file.read().decode('latin-1')
                except UnicodeDecodeError:
                    return jsonify({
                        'error': 'Encoding error',
                        'message': 'Unable to read file. Please ensure it\'s a text file with UTF-8 or Latin-1 encoding.'
                    }), 400

            # Parse credentials using the enhanced parser
            try:
                credentials = parse_credentials_enhanced(content)
            except Exception as e:
                app.logger.warning(f"Enhanced parser failed, using basic parser: {e}")
                credentials = parse_credentials_basic(content)

            if not credentials:
                return jsonify({
                    'error': 'No credentials found',
                    'message': 'No valid credentials could be extracted from the file'
                }), 400

            # Create preview (first 5 credentials)
            preview = []
            for i, cred in enumerate(credentials[:5]):
                if isinstance(cred, dict):
                    preview.append({
                        'username': cred.get('username', ''),
                        'password': cred.get('password', '')
                    })
                elif isinstance(cred, (list, tuple)) and len(cred) >= 2:
                    preview.append({
                        'username': cred[0],
                        'password': cred[1]
                    })

            app.logger.info(f"Successfully uploaded and parsed {len(credentials)} credentials from {file.filename}")

            return jsonify({
                'success': True,
                'message': 'File uploaded and parsed successfully',
                'filename': file.filename,
                'credential_count': len(credentials),
                'file_size': file_size,
                'preview': preview,
                'raw_content': content,  # For populating textarea
            })

        except Exception as e:
            app.logger.error(f"Upload error: {str(e)}")
            return jsonify({
                'error': 'Upload failed',
                'message': f'An error occurred while processing the file: {str(e)}'
            }), 500

def parse_credentials_basic(content):
    """
    Basic credential parsing fallback
    """
    credentials = []
    lines = content.strip().split('\n')

    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        # Try different separators
        for separator in [':', '|', ';', '\t', ',']:
            if separator in line:
                parts = line.split(separator, 1)
                if len(parts) == 2:
                    username = parts[0].strip()
                    password = parts[1].strip()

                    if username and password:
                        credentials.append({
                            'username': username,
                            'password': password,
                            'line_number': line_num
                        })
                        break

    return credentials

import common_field_names
import config
from improved_response_analysis import analyze_response_improved

# Batch processing configuration
RECOMMENDED_BATCH_SIZE = 50  # Based on systematic testing best practices
MAX_BATCH_SIZE = 100  # Maximum batch size to prevent memory issues

def calculate_optimal_batch_size(total_credentials):
    """Calculate optimal batch size based on total number of credentials."""
    if total_credentials <= 100:
        return total_credentials  # Process all at once for small files
    elif total_credentials <= 1000:
        return 50  # Standard batch size
    elif total_credentials <= 5000:
        return 50  # Keep standard size for medium files
    else:
        return 25  # Smaller batches for very large files

def process_credentials_in_batches(source_usernames, source_passwords, batch_size=50):
    """Process credentials in smaller batches to avoid memory issues."""
    num_pairs = min(len(source_usernames), len(source_passwords))

    for i in range(0, num_pairs, batch_size):
        end_idx = min(i + batch_size, num_pairs)
        batch_usernames = source_usernames[i:end_idx]
        batch_passwords = source_passwords[i:end_idx]
        yield batch_usernames, batch_passwords, i, end_idx, num_pairs

app = Flask(__name__, static_folder='static', template_folder='templates')

# Add CORS support to fix browser security issues
from flask_cors import CORS
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        "supports_credentials": True
    }
})

# Set up the fixed upload endpoint
setup_fixed_upload_endpoint(app)

# In-memory cache with a 5-minute TTL
csrf_cache = TTLCache(maxsize=100, ttl=300)

# Thread-safe request queue for rate limiting
request_queue = []
queue_lock = threading.Lock()
# Removed global variable AUTH_FILE_PATH

def parse_auth_content(file_content_string):
    """
    Enhanced credential parser that handles multiple file formats including:
    - Standard email:password format
    - Username:password format
    - Malformed entries with extra colons
    - Entries with embedded URLs or domains
    - Mixed format files
    """
    import re

    credentials = []
    if not file_content_string:
        app.logger.warning("Auth content string is empty or not provided.")
        return credentials

    # Email regex pattern for better detection
    email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

    lines = file_content_string.splitlines()
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith('#'):  # Skip empty lines and comments
            continue

        try:
            # First, try to parse as URL with credentials
            parsed_url = urlparse(line)
            if parsed_url.username and parsed_url.password:
                credentials.append((parsed_url.username, parsed_url.password))
                continue
        except Exception:
            pass

        # Enhanced parsing for various formats
        username, password = extract_credentials_enhanced(line, email_pattern)

        if username and password:
            credentials.append((username, password))
        else:
            app.logger.warning(f"Auth content, line {i+1}: Could not extract valid credentials from: '{line[:100]}...'")

    app.logger.info(f"Successfully parsed {len(credentials)} credential pairs from provided content string.")
    return credentials

def extract_credentials_enhanced(line, email_pattern):
    """
    Enhanced credential extraction that handles various formats
    """
    import re

    # Method 1: Standard colon separation
    if ':' in line:
        parts = line.split(':')

        # Handle simple case: exactly 2 parts
        if len(parts) == 2:
            username, password = parts[0].strip(), parts[1].strip()
            if is_valid_credential_pair(username, password, email_pattern):
                return username, password

        # Handle complex case: multiple colons
        elif len(parts) > 2:
            # Strategy 1: Last part as password, second-to-last as username
            password = parts[-1].strip()
            username = parts[-2].strip()
            if is_valid_credential_pair(username, password, email_pattern):
                return username, password

            # Strategy 2: Find email in any part, use last part as password
            for part in parts[:-1]:
                if email_pattern.match(part.strip()):
                    username = part.strip()
                    password = parts[-1].strip()
                    if is_valid_credential_pair(username, password, email_pattern):
                        return username, password

            # Strategy 3: First part as username, last as password
            username = parts[0].strip()
            password = parts[-1].strip()
            if is_valid_credential_pair(username, password, email_pattern):
                return username, password

    # Method 2: Extract email and assume rest is password
    email_match = email_pattern.search(line)
    if email_match:
        email = email_match.group()
        # Remove email from line and use remainder as password
        remaining = line.replace(email, '').strip()
        # Remove common separators
        remaining = re.sub(r'^[:\s]+|[:\s]+$', '', remaining)
        if remaining and len(remaining) > 2:  # Reasonable password length
            return email, remaining

    return None, None

def is_valid_credential_pair(username, password, email_pattern):
    """
    Validates if a username/password pair is reasonable
    """
    import re

    if not username or not password:
        return False

    # Username should be reasonable length
    if len(username) < 3 or len(username) > 100:
        return False

    # Password should be reasonable length
    if len(password) < 1 or len(password) > 200:
        return False

    # Username should be email or reasonable username
    if email_pattern.match(username):
        return True

    # Or reasonable username pattern (alphanumeric with some special chars)
    if re.match(r'^[a-zA-Z0-9._@-]+$', username):
        return True

    return False

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


def discover_heuristics(target_url, username_field, password_field, form_method, initial_cookies, final_config):
    # Step 1: Baseline Analysis
    session = requests.Session()
    if initial_cookies:
        session.cookies.update(initial_cookies)

    user_agents = final_config.get("user_agents") or config.DEFAULT_USER_AGENTS
    baseline_response = session.get(target_url, headers={'User-Agent': random.choice(user_agents)}, proxies=final_config.get("proxy"))
    baseline_status = baseline_response.status_code
    baseline_body_size = len(baseline_response.text)
    baseline_text = baseline_response.text

    # Step 2: Failure Analysis
    invalid_password = "a7d8f9a0-c8e6-4b1d-9e9f-5c9a8b0d1c2e"
    payload = {
        username_field: "invaliduser",
        password_field: invalid_password
    }

    if form_method == "POST":
        failure_response = session.post(target_url, data=payload, headers={'User-Agent': random.choice(user_agents)}, proxies=final_config.get("proxy"))
    else:
        failure_response = session.get(target_url, params=payload, headers={'User-Agent': random.choice(user_agents)}, proxies=final_config.get("proxy"))

    # Step 3: Differential Comparison
    failure_status = failure_response.status_code
    failure_body = failure_response.text

    failure_keywords = []
    # Use difflib to find new error messages
    d = difflib.Differ()
    diff = d.compare(baseline_text.splitlines(), failure_body.splitlines())
    for line in diff:
        if line.startswith('+ '):
            # Filter for common error words
            error_keywords = ["error", "invalid", "incorrect", "failed", "wrong"]
            if any(error_keyword in line.lower() for error_keyword in error_keywords):
                failure_keywords.append(line[2:])

    # Step 4: Defining Success
    generated_heuristics = {
        "success_status_codes": [302],
        "success_headers": {"Set-Cookie": "sessionid"},
        "failure_status_codes": [failure_status] if failure_status != baseline_status else [],
        "failure_body_keywords": failure_keywords,
        "failure_headers": {"Location": None} # Check for absence of redirect
    }

    return generated_heuristics

def _make_login_request(session, username, password, target_post_url, username_field_name, password_field_name, form_method, final_config, csrf_token):
    user_agents = final_config.get("user_agents") or config.DEFAULT_USER_AGENTS
    user_agent = random.choice(user_agents)
    headers = {
        'User-Agent': user_agent,
        'Origin': urlparse(target_post_url).scheme + '://' + urlparse(target_post_url).netloc,
        'Referer': target_post_url
    }

    proxies = {"http": final_config["proxy"], "https": final_config["proxy"]} if final_config["proxy"] else None

    payload = {
        username_field_name: username,
        password_field_name: password
    }

    if csrf_token:
        payload[csrf_token['name']] = csrf_token['value']

    if final_config["requests_per_minute"]:
        delay = 60.0 / final_config["requests_per_minute"]
        with queue_lock:
            request_queue.append(time.time())
            while len(request_queue) > 1 and (request_queue[-1] - request_queue[0]) > 60:
                request_queue.pop(0)
            if len(request_queue) > final_config["requests_per_minute"]:
                time.sleep(delay)

    if form_method == 'POST':
        return session.post(target_post_url, data=payload, headers=headers, proxies=proxies, timeout=10, allow_redirects=True)
    else: # GET
        return session.get(target_post_url, params=payload, headers=headers, proxies=proxies, timeout=10, allow_redirects=True)


def _analyze_response(response, heuristics):
    status = "unknown"
    details = []

    if any(keyword in response.text.lower() for keyword in ["2fa", "two-factor", "mfa", "multi-factor"]):
        status = "2fa_required"
        details.append("Landed on 2FA/MFA page.")

    if status == "unknown":
        if response.status_code in heuristics.get("success_status_codes", []):
            status = "success"
            details.append(f"Success status code: {response.status_code}")
        for header, value in heuristics.get("success_headers", {}).items():
            if header in response.headers and value in response.headers[header]:
                status = "success"
                details.append(f"Success header found: {header}: {response.headers[header]}")
        try:
            json_response = response.json()
            for key, value in heuristics.get("success_json", {}).items():
                if json_response.get(key) == value:
                    status = "success"
                    details.append(f"Success JSON response: {key}: {value}")
        except ValueError:
            pass
        if "Location" in response.headers:
            status = "success"
            details.append(f"Redirected to {response.headers['Location']}")
        for keyword in heuristics.get("success_body_keywords", []):
            if keyword in response.text.lower():
                status = "success"
                details.append(f"Found success keyword in response body: {keyword}")

    if status == "unknown":
        if response.status_code in heuristics.get("failure_status_codes", []):
            status = "failure"
            details.append(f"Failure status code: {response.status_code}")
        for keyword in heuristics.get("failure_body_keywords", []):
            if keyword in response.text.lower():
                status = "failure"
                details.append(f"Failure keyword found: {keyword}")
        if heuristics.get("failure_headers", {}).get("Location") is None and "Location" not in response.headers:
            status = "failure"
            details.append("No redirect on failure")

    return status, details

def _generate_analysis_summary(status, details):
    analysis = {
        "score": "N/A",
        "positive_indicators": [],
        "negative_indicators": []
    }

    if status == "success":
        analysis["score"] = "High"
        analysis["positive_indicators"] = details
    elif status == "failure":
        analysis["score"] = "Low"
        analysis["negative_indicators"] = details

    return analysis

def execute_login_attempt(username, password, target_post_url, username_field_name, password_field_name, form_method, initial_cookies, final_config, csrf_token):
    with requests.Session() as session:
        if initial_cookies:
            session.cookies.update(initial_cookies)

        try:
            response = _make_login_request(session, username, password, target_post_url, username_field_name, password_field_name, form_method, final_config, csrf_token)
            # Use improved analysis function with initial URL for comparison
            initial_url = final_config.get("login_page_url", target_post_url)
            status, details = analyze_response_improved(response, final_config["heuristics"], initial_url)
            analysis = _generate_analysis_summary(status, details)

            result = {
                "username": username,
                "password_actual": password,
                "status": status,
                "details": ", ".join(details),
                "response_url": response.url,
                "status_code": response.status_code,
                "content_length": len(response.text),
                "response_body": response.text,
                "analysis": analysis
            }
            app.logger.info(f"Login attempt result: {result}")
            return result

        except requests.exceptions.RequestException as e:
            app.logger.error(f"Request exception during login attempt for user {username}: {e}")
            return {
                "username": username,
                "password_actual": password,
                "status": "error",
                "details": str(e),
                "analysis": {
                    "score": "N/A",
                    "positive_indicators": [],
                    "negative_indicators": [str(e)]
                }
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

        app.logger.info(f"Starting test run with configuration: {data.get('config', {})}")

        # --- Configuration Merging ---
        req_config = data.get('config', {})
        heuristics_config = req_config.get("heuristics", {})

        final_config = {
            "requests_per_minute": req_config.get("requests_per_minute", config.DEFAULT_REQUESTS_PER_MINUTE),
            "user_agents": req_config.get("user_agents", config.DEFAULT_USER_AGENTS),
            "proxy": req_config.get("proxy", config.DEFAULT_PROXY),
            "heuristics": heuristics_config,
            "login_page_url": req_config.get("login_page_url", data['target_post_url']),
            "csrf_token_field_name": req_config.get("csrf_token_field_name") # Can be None
        }

        if final_config["heuristics"] == "auto":
            final_config["heuristics"] = discover_heuristics(
                final_config["login_page_url"],
                data['username_field_name'],
                data['password_field_name'],
                data['form_method'],
                data.get('cookies', {}),
                final_config
            )
        elif isinstance(heuristics_config, dict):
            final_config["heuristics"] = {**config.DEFAULT_HEURISTICS, **heuristics_config}
        else: # manual or other string
            final_config["heuristics"] = config.DEFAULT_HEURISTICS

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
            if not parsed_credentials:
                return jsonify({"error": "No valid credentials found in the provided file."}), 400
            source_usernames = [cred[0] for cred in parsed_credentials]
            source_passwords = [cred[1] for cred in parsed_credentials]
            credential_source_message = f"Using {len(source_usernames)} credential pairs from uploaded content."
        else:
            source_usernames = username_list_payload
            source_passwords = password_list_payload
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
                        user_agents = final_config.get("user_agents") or config.DEFAULT_USER_AGENTS
                        response = session.get(final_config["login_page_url"], headers={'User-Agent': random.choice(user_agents)}, timeout=10)
                        soup = BeautifulSoup(response.text, 'html.parser')
                        token_input = soup.find('input', {'name': final_config["csrf_token_field_name"]})
                        if token_input:
                            csrf_token = {"name": final_config["csrf_token_field_name"], "value": token_input.get('value')}
                            csrf_cache[cache_key] = csrf_token
                    except requests.exceptions.RequestException as e:
                        app.logger.error(f"Error fetching CSRF token: {e}")

            # Calculate optimal batch size for the number of credentials
            batch_size = calculate_optimal_batch_size(num_pairs_to_test)

            initial_info = {
                "type": "info",
                "total_expected_attempts": num_pairs_to_test,
                "message": f"Test run initiated. {credential_source_message} Processing {num_pairs_to_test} credentials in batches of {batch_size}."
            }
            yield f"data: {json.dumps(initial_info)}\n\n"

            processed_count = 0

            # Process credentials in batches to avoid memory issues
            for batch_usernames, batch_passwords, start_idx, end_idx, total in process_credentials_in_batches(
                source_usernames, source_passwords, batch_size):

                batch_info = {
                    "type": "batch_info",
                    "message": f"Processing batch {start_idx+1}-{end_idx} of {total} credentials..."
                }
                yield f"data: {json.dumps(batch_info)}\n\n"

                # Process current batch with ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=10) as executor:
                    futures = []
                    for i in range(len(batch_usernames)):
                        future = executor.submit(
                            execute_login_attempt,
                            batch_usernames[i],
                            batch_passwords[i],
                            target_post_url,
                            username_field_name,
                            password_field_name,
                            form_method,
                            initial_cookies,
                            final_config,
                            csrf_token
                        )
                        futures.append(future)

                    # Collect results from current batch
                    for future in as_completed(futures):
                        try:
                            result = future.result()
                            processed_count += 1

                            # Add progress information
                            result["progress"] = {
                                "processed": processed_count,
                                "total": num_pairs_to_test,
                                "percentage": round((processed_count / num_pairs_to_test) * 100, 1)
                            }

                            yield f"data: {json.dumps(result)}\n\n"
                        except Exception as e:
                            app.logger.error(f"Error processing credential in batch: {str(e)}")
                            error_result = {
                                "username": "unknown",
                                "password_actual": "unknown",
                                "status": "error",
                                "details": f"Batch processing error: {str(e)}",
                                "progress": {
                                    "processed": processed_count,
                                    "total": num_pairs_to_test,
                                    "percentage": round((processed_count / num_pairs_to_test) * 100, 1)
                                }
                            }
                            yield f"data: {json.dumps(error_result)}\n\n"

                # Small delay between batches to prevent overwhelming the target
                time.sleep(0.5)

            completion_event = {
                'status': 'complete',
                'message': f'All {processed_count} credential tests finished.',
                'total_processed': processed_count
            }
            yield f"data: {json.dumps(completion_event)}\n\n"

        return Response(event_stream(), mimetype='text/event-stream')

    except Exception as e:
        app.logger.error(f"Error in /test_credentials_stream before streaming: {str(e)}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred before streaming could start."}), 500

if __name__ == '__main__':
    # Removed argparse logic for --auth-file
    app.run(debug=True, port=5002)
