# Server-side file upload and credential extraction
import os
import tempfile
from werkzeug.utils import secure_filename
from flask import request, jsonify
import re

def setup_file_upload_routes(app):
    """Add file upload routes to the Flask app"""

    @app.route('/upload_credentials', methods=['POST'])
    def upload_credentials():
        """Handle credential file upload and extraction"""
        try:
            if 'credential_file' not in request.files:
                return jsonify({'error': 'No file uploaded'}), 400

            file = request.files['credential_file']
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400

            # Save uploaded file temporarily
            filename = secure_filename(file.filename)
            temp_dir = tempfile.mkdtemp()
            file_path = os.path.join(temp_dir, filename)
            file.save(file_path)

            # Extract credentials using enhanced parser
            credentials = extract_credentials_from_file(file_path)

            # Clean up temporary file
            os.remove(file_path)
            os.rmdir(temp_dir)

            return jsonify({
                'success': True,
                'credentials_count': len(credentials),
                'credentials': credentials[:10],  # Return first 10 for preview
                'all_credentials': credentials,
                'filename': filename
            })

        except Exception as e:
            return jsonify({'error': f'File processing failed: {str(e)}'}), 500

def extract_credentials_from_file(file_path):
    """Extract credentials from uploaded file using enhanced parsing"""
    credentials = []

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Use the enhanced credential parser
        credentials = parse_credentials_enhanced(content)

    except Exception as e:
        print(f"Error reading file: {e}")

    return credentials

def parse_credentials_enhanced(content):
    """Enhanced credential parsing that handles multiple formats"""
    credentials = []
    lines = content.strip().split('\n')

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        try:
            # Handle multiple colon separators by finding the last one
            if ':' in line:
                # Split on last colon to handle complex formats
                parts = line.rsplit(':', 1)
                if len(parts) == 2:
                    username_part, password = parts

                    # Extract email from complex username part
                    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', username_part)
                    if email_match:
                        username = email_match.group()
                    else:
                        # If no email found, use the whole username part
                        username = username_part.strip()

                    # Clean up username and password
                    username = username.strip()
                    password = password.strip()

                    if username and password:
                        credentials.append({
                            'username': username,
                            'password': password
                        })

        except Exception as e:
            print(f"Error parsing line '{line}': {e}")
            continue

    return credentials

def get_credentials_summary(credentials):
    """Get summary statistics for credentials"""
    if not credentials:
        return {'total': 0, 'preview': []}

    return {
        'total': len(credentials),
        'preview': credentials[:5],  # First 5 for preview
        'has_emails': sum(1 for c in credentials if '@' in c['username']),
        'unique_domains': len(set(c['username'].split('@')[1] for c in credentials if '@' in c['username']))
    }
