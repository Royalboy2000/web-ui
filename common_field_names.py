COMMON_USERNAME_FIELDS = [
    # Standard & Common
    "username", "email", "user", "userid", "user_id", "login", "log", "login_id",
    "user_name", "email_address", "user_email", "emailaddress", "e-mail",
    "txt_username", "txt_email", "txt_user", "inputEmail", "inputUsername",
    "username_or_email", "user_login", "login_username", "login_email",
    "j_username", # Java EE
    "session[username_or_email]", # Devise-like (Ruby on Rails)
    "user[email]", # Devise-like
    "user[login]", # Devise-like
    "vb_login_username", # vBulletin
    "auth[login]",
    "handle", # Common for social media/forums
    "alias",
    "account_name",
    "member_name",
    "customer_id",
    "principal" # More generic term
]

COMMON_PASSWORD_FIELDS = [
    # Standard & Common
    "password", "pass", "passwd", "pwd", "secret", "passcode", "user_password",
    "login_password", "txt_password", "inputPassword", "password_field",
    "j_password", # Java EE
    "session[password]", # Devise-like
    "user[password]", # Devise-like
    "vb_login_password", # vBulletin
    "auth[password]",
    "pin", # Often for numeric, but sometimes used
    "secretkey",
    "pass_phrase", "passphrase",
    "password_confirmation", # Often paired, but the main one is still "password"
    "current_password", # For password change forms
    "new_password",
    "confirm_password",
    "userpass",
    "passwordText",
    "password_input",
    "Password", # Case-sensitive variations
    "Pass",
    "PASSWORD"
]

COMMON_CSRF_TOKEN_FIELDS = [
    # General
    "csrf_token", "_csrf", "csrf", "CSRFToken", "xsrf_token", "_xsrf",
    "csrfmiddlewaretoken", # Django
    "authenticity_token", # Ruby on Rails
    "__RequestVerificationToken", # ASP.NET MVC
    "_token", # Laravel / Symfony
    "nonce", "csrf_nonce", "security_token", "request_token",
    "YII_CSRF_TOKEN", # Yii framework
    "OWASP_CSRFTOKEN",
    "csrfKey",
    "anticsrf",
    "token", # Sometimes used generically
    "form_token",
    "protect_code",
    "csrf_param", # Name of the meta tag often, value in another field
    "csrf-token" # Common in meta tags, sometimes reflected in form names
]

if __name__ == '__main__':
    print(f"Found {len(COMMON_USERNAME_FIELDS)} common username fields.")
    for field in COMMON_USERNAME_FIELDS:
        print(f"- {field}")

    print(f"\nFound {len(COMMON_PASSWORD_FIELDS)} common password fields.")
    for field in COMMON_PASSWORD_FIELDS:
        print(f"- {field}")

    print(f"\nFound {len(COMMON_CSRF_TOKEN_FIELDS)} common CSRF token fields.")
    for field in COMMON_CSRF_TOKEN_FIELDS:
        print(f"- {field}")

    # Example of how these might be used in app.py (conceptual)
    # class FormAnalyzer:
    #     def __init__(self, soup):
    #         self.soup = soup
    #         self.username_field_names = COMMON_USERNAME_FIELDS
    #         self.password_field_names = COMMON_PASSWORD_FIELDS
    #         self.csrf_field_names = COMMON_CSRF_TOKEN_FIELDS

    #     def find_username_field(self, form):
    #         # Logic to iterate through self.username_field_names and check form inputs
    #         pass
    #     # ... etc.
