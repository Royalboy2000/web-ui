import re
import logging
from urllib.parse import urlparse

def parse_auth_content_enhanced(file_content_string):
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
            # Try different combinations

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

    # Method 2: Space separation (fallback)
    if ' ' in line:
        parts = line.split()
        if len(parts) >= 2:
            # Look for email pattern
            for i, part in enumerate(parts):
                if email_pattern.match(part) and i + 1 < len(parts):
                    username = part
                    password = parts[i + 1]
                    if is_valid_credential_pair(username, password, email_pattern):
                        return username, password

    # Method 3: Extract email and assume rest is password
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

def test_enhanced_parser():
    """
    Test function to validate the enhanced parser
    """
    test_data = """01lilopad02@gmail.com:Lilo0102padD
041980@wp.pl:8h/ssJ-*R*BXtQv
0535494768:Hassan113
09Pomidor09:app.fakturownia.pl/signupciupakwiktor@o2.pl
1070747@gmail.com:WIka2mark
123takis123iga@gmail.com:H@PLW74WghZwd%s
527BWkQY@y.uaFx:arkadiusz2000@gmail.com
661slaw@gmail.com:Fr4WW+@cKtA5SZL"""

    credentials = parse_auth_content_enhanced(test_data)
    print(f"Parsed {len(credentials)} credentials:")
    for username, password in credentials:
        print(f"  {username} : {password}")

    return credentials

if __name__ == "__main__":
    test_enhanced_parser()
