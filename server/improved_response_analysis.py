"""
Improved Response Analysis Logic for Stryker Tool
This module provides more accurate detection of authentication responses
"""

import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup


def analyze_response_improved(response, heuristics, initial_url=None):
    """
    Improved response analysis that considers multiple factors for accurate detection

    Args:
        response: HTTP response object
        heuristics: Configuration for detection heuristics
        initial_url: Original login page URL for comparison

    Returns:
        tuple: (status, details) where status is one of:
               'success', 'failure', '2fa_required', 'error', 'unknown'
    """
    status = "unknown"
    details = []

    # Parse response content with BeautifulSoup for better analysis
    try:
        soup = BeautifulSoup(response.text, 'html.parser')
    except:
        soup = None

    # 1. Check for actual 2FA indicators (more specific than keyword matching)
    if _is_genuine_2fa_page(response, soup, initial_url):
        status = "2fa_required"
        details.append("Genuine 2FA/MFA page detected with verification form.")
        return status, details

    # 2. Check for explicit error messages (most reliable indicator)
    error_indicators = _check_error_messages(response, soup)
    if error_indicators:
        status = "failure"
        details.extend(error_indicators)
        return status, details

    # 3. Check for success indicators
    success_indicators = _check_success_indicators(response, heuristics, initial_url)
    if success_indicators:
        status = "success"
        details.extend(success_indicators)
        return status, details

    # 4. Analyze URL changes and redirects
    url_analysis = _analyze_url_changes(response, initial_url)
    if url_analysis:
        status, url_details = url_analysis
        details.extend(url_details)
        return status, details

    # 5. Check HTTP status codes
    if response.status_code >= 400:
        status = "error"
        details.append(f"HTTP error status: {response.status_code}")
        return status, details

    # 6. Default analysis based on heuristics
    return _fallback_analysis(response, heuristics)


def _is_genuine_2fa_page(response, soup, initial_url):
    """Check if this is a genuine 2FA page with actual verification elements"""
    if not soup:
        return False

    # Check for URL changes indicating progression in auth flow
    if initial_url and response.url != initial_url:
        parsed_url = urlparse(response.url.lower())
        path = parsed_url.path + parsed_url.query

        # Look for 2FA-specific URL patterns
        if any(pattern in path for pattern in ['/mfa', '/2fa', '/verify', '/otp', '/token', '/authenticate']):
            # Verify there are actual verification form elements
            if _has_verification_form_elements(soup):
                return True

    # Check for verification form elements on the same page
    if _has_verification_form_elements(soup):
        # Make sure it's not just the original login form
        if _has_different_form_structure(soup):
            return True

    return False


def _has_verification_form_elements(soup):
    """Check for actual verification form elements"""
    if not soup:
        return False

    # Look for OTP/verification code input fields
    verification_inputs = soup.find_all('input', {
        'type': ['text', 'number', 'tel'],
        'name': re.compile(r'(otp|code|token|verify|mfa|2fa)', re.I)
    })

    if verification_inputs:
        return True

    # Look for input fields with verification-related placeholders
    placeholder_inputs = soup.find_all('input', {
        'placeholder': re.compile(r'(verification|code|token|otp)', re.I)
    })

    if placeholder_inputs:
        return True

    # Look for "resend code" or similar buttons/links
    resend_elements = soup.find_all(['button', 'a'],
        string=re.compile(r'(resend|send.*code|get.*code)', re.I))

    if resend_elements:
        return True

    return False


def _has_different_form_structure(soup):
    """Check if form structure is different from typical login form"""
    if not soup:
        return False

    # Count password fields - 2FA pages typically don't have password fields
    password_fields = soup.find_all('input', {'type': 'password'})

    # If there are still password fields, it's likely still the login form
    if password_fields:
        return False

    return True


def _check_error_messages(response, soup):
    """Check for explicit error messages indicating failed authentication"""
    error_indicators = []

    # Common error message patterns
    error_patterns = [
        r'wrong\s+(user\s*name|password|credentials)',
        r'invalid\s+(user\s*name|password|credentials|login)',
        r'incorrect\s+(user\s*name|password|credentials)',
        r'authentication\s+failed',
        r'login\s+failed',
        r'access\s+denied',
        r'account\s+(not\s+found|disabled|locked|suspended)',
        r'user\s+not\s+found',
        r'bad\s+credentials',
        r'sign\s*in\s+error',
        r'login\s+error'
    ]

    response_text = response.text.lower()

    for pattern in error_patterns:
        if re.search(pattern, response_text):
            error_indicators.append(f"Error message detected: {pattern}")

    # Check for error elements in HTML
    if soup:
        # Look for elements with error-related classes or IDs
        error_elements = soup.find_all(['div', 'span', 'p'],
            class_=re.compile(r'(error|alert|warning|danger)', re.I))

        for element in error_elements:
            text = element.get_text().strip().lower()
            if any(word in text for word in ['wrong', 'invalid', 'incorrect', 'failed', 'error']):
                error_indicators.append(f"Error element found: {text[:100]}")

    return error_indicators


def _check_success_indicators(response, heuristics, initial_url):
    """Check for success indicators"""
    success_indicators = []

    # Check configured success indicators from heuristics
    if response.status_code in heuristics.get("success_status_codes", []):
        success_indicators.append(f"Success status code: {response.status_code}")

    # Check for success headers
    for header, value in heuristics.get("success_headers", {}).items():
        if header in response.headers and value in response.headers[header]:
            success_indicators.append(f"Success header: {header}: {response.headers[header]}")

    # Check for redirect to different domain/path (common success pattern)
    if initial_url and response.url != initial_url:
        parsed_initial = urlparse(initial_url)
        parsed_current = urlparse(response.url)

        if parsed_current.path != parsed_initial.path:
            # Check if it's a redirect to dashboard, home, or profile
            success_paths = ['/dashboard', '/home', '/profile', '/welcome', '/main']
            if any(path in parsed_current.path.lower() for path in success_paths):
                success_indicators.append(f"Redirected to success page: {response.url}")

    # Check for success keywords in body
    for keyword in heuristics.get("success_body_keywords", []):
        if keyword.lower() in response.text.lower():
            success_indicators.append(f"Success keyword found: {keyword}")

    return success_indicators


def _analyze_url_changes(response, initial_url):
    """Analyze URL changes to determine authentication status"""
    if not initial_url or response.url == initial_url:
        return None

    parsed_initial = urlparse(initial_url.lower())
    parsed_current = urlparse(response.url.lower())

    # Check for 2FA-specific URL patterns
    current_path = parsed_current.path + parsed_current.query
    if any(pattern in current_path for pattern in ['/mfa', '/2fa', '/verify', '/otp', '/token']):
        return "2fa_required", [f"Redirected to 2FA page: {response.url}"]

    # Check for error page redirects
    if any(pattern in current_path for pattern in ['/error', '/login', '/signin', '/auth']):
        return "failure", [f"Redirected to error/login page: {response.url}"]

    # Check for success page redirects
    if any(pattern in current_path for pattern in ['/dashboard', '/home', '/profile', '/welcome']):
        return "success", [f"Redirected to success page: {response.url}"]

    return None


def _fallback_analysis(response, heuristics):
    """Fallback analysis using original heuristics"""
    status = "unknown"
    details = []

    # Check failure indicators
    if response.status_code in heuristics.get("failure_status_codes", []):
        status = "failure"
        details.append(f"Failure status code: {response.status_code}")

    for keyword in heuristics.get("failure_body_keywords", []):
        if keyword.lower() in response.text.lower():
            status = "failure"
            details.append(f"Failure keyword found: {keyword}")
            break

    # If still unknown, assume failure for login attempts that return to same page
    if status == "unknown" and response.status_code == 200:
        status = "failure"
        details.append("No success indicators found, likely authentication failure")

    return status, details
