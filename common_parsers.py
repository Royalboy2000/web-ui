import re
from urllib.parse import urlparse

import logging

def parse_auth_content(file_content_string):
    """
    Enhanced credential parser that handles multiple file formats including:
    - Standard email:password format
    - Username:password format
    - Malformed entries with extra colons
    - Entries with embedded URLs or domains
    - Mixed format files

    Improvements:
    - Better email detection using regex
    - Handles malformed entries more gracefully
    - Extracts valid credentials from complex strings
    - Supports various separator patterns
    """
    credentials = []
    if not file_content_string:
        logging.warning("Auth content string is empty or not provided.")
        return credentials

    # Email regex pattern for better detection
    email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

    lines = file_content_string.splitlines()
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith('#'):  # Skip empty lines and comments
            continue

        username, password = extract_credentials_enhanced(line, email_pattern)

        if username and password:
            credentials.append((username, password))
        else:
            logging.warning(f"Auth content, line {i+1}: Could not extract valid credentials from: '{line[:100]}...'")

    logging.info(f"Successfully parsed {len(credentials)} credential pairs from provided content string.")
    return credentials

def extract_credentials_enhanced(line, email_pattern):
    """
    Enhanced credential extraction that handles various formats:
    - email:password
    - username:password
    - complex strings with embedded credentials
    - malformed entries with multiple colons
    """
    try:
        # First, try to parse as URL with credentials
        parsed_url = urlparse(line)
        if parsed_url.username and parsed_url.password:
            return parsed_url.username, parsed_url.password
    except Exception:
        pass

    # Try to find an email
    email_match = email_pattern.search(line)
    if email_match:
        username = email_match.group()

        # Try to find password after the email
        password_part = line[email_match.end():]
        password = re.sub(r'^[:\s|]+', '', password_part).strip()
        if is_valid_credential_pair(username, password, email_pattern):
            return username, password

        # Try to find password before the email
        password_part = line[:email_match.start()]
        password = re.sub(r'[:\s|]+$', '', password_part).strip()
        if is_valid_credential_pair(username, password, email_pattern):
             return username, password

    # Fallback for non-email usernames
    parts = re.split(r'[:|\s]', line)
    parts = [p for p in parts if p] # remove empty strings
    if len(parts) >= 2:
        # Assume last part is password
        password = parts[-1]
        # Assume part before password is username
        username = parts[-2]
        if is_valid_credential_pair(username, password, email_pattern):
            return username, password

    return None, None


def is_valid_credential_pair(username, password, email_pattern):
    """
    Validates if a username/password pair is reasonable
    """
    if not username or not password:
        return False
    if ' ' in username or ' ' in password:
        return False
    if len(username) < 3 or len(username) > 200:
        return False
    if len(password) < 3 or len(password) > 500:
        return False
    if urlparse(username).scheme or urlparse(password).scheme:
        return False
    if not email_pattern.match(username):
        if '@' in username:
            return False # not a valid email, but has @
        if len(username.split('.')) > 2: # probably a domain name
            return False
    return True
