COMMON_USERNAME_FIELDS = [
    # Standard & Common (English)
    "username", "email", "user", "userid", "user_id", "login", "log", "login_id",
    "user_name", "email_address", "user_email", "emailaddress", "e-mail",
    "txt_username", "txt_email", "txt_user", "inputEmail", "inputUsername",
    "username_or_email", "user_login", "login_username", "login_email", "logon",
    "auth_key", "login_name", "field-login-login",

    # International (Spanish, French, German, Dutch, Italian, Portuguese, Russian)
    "usuario", "nombre_de_usuario", "correo", # Spanish
    "identifiant", "nom_d_utilisateur", "courriel", # French
    "benutzername", "kennung", "benutzer", # German
    "gebruikersnaam", # Dutch
    "nome_utente", # Italian
    "usuário", # Portuguese
    "логин", "имя_пользователя", # Russian

    # Framework & Application Specific
    "j_username", # Java EE
    "session[username_or_email]", # Devise-like (Ruby on Rails)
    "user[email]", # Devise-like
    "user[login]", # Devise-like
    "signin[username]", "login[username]", "login[email]",
    "_username", # Symfony
    "vb_login_username", # vBulletin
    "auth[login]",

    # Other common terms
    "handle", "alias", "account_name", "member_name", "customer_id", "principal"
]

COMMON_PASSWORD_FIELDS = [
    # Standard & Common (English)
    "password", "pass", "passwd", "pwd", "secret", "passcode", "user_password",
    "login_password", "txt_password", "inputPassword", "password_field", "pass_word",
    "pin", "secretkey", "pass_phrase", "passphrase", "secret_word", "pin_code",
    "userpass", "passwordText", "password_input",
    "Password", "Pass", "PASSWORD", # Case-sensitive variations

    # International (Spanish, French, German, Dutch, Italian, Portuguese, Russian)
    "contraseña", "clave", # Spanish
    "mot_de_passe", # French
    "passwort", "kennwort", # German
    "wachtwoord", # Dutch
    "senha", # Portuguese
    "пароль", # Russian

    # Framework & Application Specific
    "j_password", # Java EE
    "session[password]", # Devise-like
    "user[password]", # Devise-like
    "signin[password]", "login[password]",
    "_password", # Symfony
    "vb_login_password", # vBulletin
    "auth[password]",
    "field-login-password",

    # Password confirmation/change forms (less likely for login, but good to have)
    "password_confirmation", "current_password", "new_password", "confirm_password"
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
