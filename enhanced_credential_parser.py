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
    More robust credential extraction that handles various formats and separators.
    - Handles email:password, username:password
    - Supports multiple separators: ':', ';', '|', '\\t'
    - Handles multiple occurrences of a separator correctly (e.g., "user:name:p:assword")
    """
    # List of common separators
    separators = [':', ';', '|', '\t']

    for sep in separators:
        if sep in line:
            parts = line.split(sep)

            # Strategy: First part is username, the rest is the password
            # This is a robust way to handle passwords that contain the separator
            if len(parts) > 1:
                username = parts[0].strip()
                password = sep.join(parts[1:]).strip()

                if is_valid_credential_pair(username, password, email_pattern, sep):
                    return username, password

    # Fallback for space as a separator, but be more strict
    if ' ' in line:
        parts = line.split()
        if len(parts) == 2: # Only if there are exactly two parts
            username, password = parts[0].strip(), parts[1].strip()
            if is_valid_credential_pair(username, password, email_pattern, ' '):
                return username, password

    # Fallback to find email and treat the rest as password
    email_match = email_pattern.search(line)
    if email_match:
        email = email_match.group(0)
        # The rest of the line is the password
        password = line.replace(email, '').strip()
        # Clean up leading/trailing separators from the password
        password = re.sub(r'^[;:\s|]+|[:;\s|]+$', '', password)

        if is_valid_credential_pair(email, password, email_pattern):
            return email, password

    return None, None

def is_valid_credential_pair(username, password, email_pattern, separator_used=None):
    """
    Validates if a username/password pair is reasonable.
    """
    # Basic checks for emptiness
    if not username or not password:
        return False

    # Check if username or password is just the separator
    if separator_used and (username == separator_used or password == separator_used):
        return False

    # Check for unreasonable lengths
    if not (1 <= len(username) <= 100) or not (1 <= len(password) <= 200):
        return False

    # Username should not be a common web protocol
    if username.lower() in ['http', 'https', 'ftp', 'sftp']:
        return False

    # If username is an email, it's likely valid
    if '@' in username and email_pattern.match(username):
        return True

    # Check for a reasonable username pattern (alphanumeric with common special chars)
    # Avoids things that are clearly not usernames like "::" or " "
    if re.match(r'^[a-zA-Z0-9_.\-@]+$', username):
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
