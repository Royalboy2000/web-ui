import unittest
import sys
import os

# Add the root directory to sys.path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enhanced_credential_parser import parse_auth_content_enhanced

class TestEnhancedCredentialParser(unittest.TestCase):

    def test_simple_colon_separated(self):
        content = "user1:pass1\nuser2:pass2"
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 2)
        self.assertIn(("user1", "pass1"), creds)

    def test_email_and_username(self):
        content = "test@example.com:password123\nregular_user:anotherpassword"
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 2)
        self.assertIn(("test@example.com", "password123"), creds)
        self.assertIn(("regular_user", "anotherpassword"), creds)

    def test_different_separators(self):
        content = "user1;pass1\nuser2|pass2\nuser3\tpass3"
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 3)
        self.assertIn(("user1", "pass1"), creds)
        self.assertIn(("user2", "pass2"), creds)
        self.assertIn(("user3", "pass3"), creds)

    def test_password_with_separator(self):
        content = "user:pass:with:colons"
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 1)
        self.assertIn(("user", "pass:with:colons"), creds)

    def test_url_formatted_credentials(self):
        content = "http://user:password@site.com"
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 1)
        self.assertIn(("user", "password"), creds)

    def test_mixed_and_malformed_content(self):
        content = """
# This is a comment
user1:pass1
user2;pass2
user3:pass:with:separator
   # Another comment

user4|pass4
invalidline
http://urluser:urlpass@example.com
"""
        creds = parse_auth_content_enhanced(content)
        self.assertEqual(len(creds), 5)
        self.assertIn(("user1", "pass1"), creds)
        self.assertIn(("user2", "pass2"), creds)
        self.assertIn(("user3", "pass:with:separator"), creds)
        self.assertIn(("user4", "pass4"), creds)
        self.assertIn(("urluser", "urlpass"), creds)

    def test_empty_and_none_input(self):
        self.assertEqual(parse_auth_content_enhanced(""), [])
        self.assertEqual(parse_auth_content_enhanced(None), [])

if __name__ == '__main__':
    unittest.main()
