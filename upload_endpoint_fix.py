# Server-side upload endpoint fix for Stryker Web UI

from flask import request, jsonify
from werkzeug.utils import secure_filename
import os
import tempfile

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
                from enhanced_credential_parser import parse_credentials_enhanced
                credentials = parse_credentials_enhanced(content)
            except ImportError:
                # Fallback to basic parsing if enhanced parser not available
                credentials = parse_credentials_basic(content)

            if not credentials:
                return jsonify({
                    'error': 'No credentials found',
                    'message': 'No valid credentials could be extracted from the file'
                }), 400

            # Create preview (first 5 credentials)
            preview = []
            for i, cred in enumerate(credentials[:5]):
                preview.append({
                    'username': cred.get('username', ''),
                    'password': cred.get('password', '')
                })

            # Save file temporarily for potential reuse
            temp_dir = tempfile.gettempdir()
            safe_filename = secure_filename(file.filename)
            temp_path = os.path.join(temp_dir, f"stryker_upload_{safe_filename}")

            with open(temp_path, 'w', encoding='utf-8') as f:
                f.write(content)

            app.logger.info(f"Successfully uploaded and parsed {len(credentials)} credentials from {file.filename}")

            return jsonify({
                'success': True,
                'message': 'File uploaded and parsed successfully',
                'filename': file.filename,
                'credential_count': len(credentials),
                'file_size': file_size,
                'preview': preview,
                'raw_content': content,  # For populating textarea
                'temp_path': temp_path  # For server-side reference
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

# Additional helper functions for file validation
def validate_credential_file(file_path):
    """
    Validate that a credential file contains valid data
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        credentials = parse_credentials_basic(content)
        return len(credentials) > 0, len(credentials)
    except Exception as e:
        return False, 0

def cleanup_temp_files(app):
    """
    Clean up temporary upload files older than 1 hour
    """
    import time
    import glob

    temp_dir = tempfile.gettempdir()
    pattern = os.path.join(temp_dir, "stryker_upload_*")
    current_time = time.time()

    for file_path in glob.glob(pattern):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 3600:  # 1 hour
                os.remove(file_path)
                app.logger.info(f"Cleaned up old temp file: {file_path}")
        except Exception as e:
            app.logger.warning(f"Failed to clean up temp file {file_path}: {e}")

# Integration instructions for app.py
INTEGRATION_CODE = '''
# Add this to your app.py file:

from upload_endpoint_fix import setup_fixed_upload_endpoint, cleanup_temp_files
import atexit

# After creating the Flask app:
setup_fixed_upload_endpoint(app)

# Add cleanup on exit:
atexit.register(lambda: cleanup_temp_files(app))

# Add CORS headers for upload endpoint:
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response
'''
