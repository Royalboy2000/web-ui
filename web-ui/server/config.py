# Global Configuration

# Default rate limit (requests per minute)
# Set to 0 or None to disable.
DEFAULT_REQUESTS_PER_MINUTE = 0

# Default User-Agent list. The system will rotate through these.
DEFAULT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
]

# Default proxy settings.
# Example: "http://user:pass@host:port"
DEFAULT_PROXY = None

# Default heuristics for success/failure detection.
DEFAULT_HEURISTICS = {
    "success_status_codes": [302],
    "success_headers": {
        "Set-Cookie": "sessionid"
    },
    "success_json": {
        "status": "success"
    },
    "success_body_keywords": [
        "dashboard", "logout", "profile", "welcome back", "logged in successfully",
        "authentication successful", "login successful"
    ],
    "failure_status_codes": [401, 403, 429],
    "failure_body_keywords": [
        "incorrect password", "invalid password", "login failed",
        "wrong credentials", "authentication failed", "access denied",
        "wrong user name", "wrong username", "invalid username",
        "account not activated", "user not found", "bad credentials",
        "sign in error", "login error", "invalid login",
        "wrong user name/password or account not activated"
    ]
}
