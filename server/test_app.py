import unittest
import os
import json
from unittest.mock import patch, mock_open

# Add parent directory to sys.path to import app and common_field_names
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, parse_auth_content # Import the renamed function
import common_field_names

class TestAuthContentParsing(unittest.TestCase): # Renamed class

    # No setUp or tearDown needed as we are not mocking global AUTH_FILE_PATH anymore

    def test_parse_valid_auth_content_simple(self): # Renamed test, removed file ops
        content_string = "user1:pass1\nuser2:pass2\nemail@example.com:Password123\n"
        creds = parse_auth_content(content_string)
        self.assertEqual(len(creds), 3)
        self.assertIn(("user1", "pass1"), creds)
        self.assertIn(("user2", "pass2"), creds)
        self.assertIn(("email@example.com", "Password123"), creds)

    def test_parse_auth_content_with_url_and_port(self):
        """Test parsing of a URL with a port number."""
        content_string = "http://user:password@example.com:8080"
        creds = parse_auth_content(content_string)
        self.assertEqual(len(creds), 1)
        self.assertIn(("user", "password"), creds)

    def test_parse_valid_auth_content_multiple_colons(self): # Renamed test
        content_string = "http://site.com:user1:pass1\nignorethis:user2:pass2\nfield1:field2:email@example.com:Password123\n"
        creds = parse_auth_content(content_string)
        self.assertEqual(len(creds), 3)
        self.assertIn(("user1", "pass1"), creds)
        self.assertIn(("user2", "pass2"), creds)
        self.assertIn(("email@example.com", "Password123"), creds)

    def test_parse_auth_content_with_empty_lines_and_comments(self): # Renamed test
        content_string = "# This is a comment\nuser1:pass1\n\nuser2:pass2\n  # Another comment\nuser3:pass3"
        creds = parse_auth_content(content_string)
        self.assertEqual(len(creds), 3)
        self.assertIn(("user1", "pass1"), creds)
        self.assertIn(("user2", "pass2"), creds)
        self.assertIn(("user3", "pass3"), creds)

    def test_parse_auth_content_malformed_lines(self): # Renamed test
        content_string = "user1:\n:pass2\njusttext\nuser3:pass3\n: \n :pass4\nuser5:"
        # Suppress warnings during this test for cleaner output
        with patch('common_parsers.logging') as mock_logging:
            creds = parse_auth_content(content_string)
            self.assertEqual(len(creds), 1)
            self.assertIn(("user3", "pass3"), creds)
            # Check that warnings were logged for malformed lines
            self.assertGreaterEqual(mock_logging.warning.call_count, 6)


    def test_parse_auth_content_empty_string(self): # Renamed test
        content_string = ""
        creds = parse_auth_content(content_string)
        self.assertEqual(len(creds), 0)

    def test_parse_auth_content_none_input(self): # New test for None input
        creds = parse_auth_content(None)
        self.assertEqual(len(creds), 0)
        # Optionally, check for a specific log warning if you added one for None input
        # with patch.object(app.logger, 'warning') as mock_logger_warning:
        #     parse_auth_content(None)
        #     mock_logger_warning.assert_any_call("Auth content string is empty or not provided.")


class TestCredentialsEndpointSourceLogic(unittest.TestCase):

    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        # No need to manage APP_AUTH_FILE_PATH global anymore

    def tearDown(self):
        pass # No specific teardown needed for this class regarding AUTH_FILE_PATH

    def _make_test_credentials_request_data(self, auth_file_content=None): # Added auth_file_content param
        data = {
            "target_post_url": "http://example.com/login",
            "username_field_name": "user",
            "password_field_name": "pass",
            "username_list": ["payload_user1", "payload_user2"],
            "password_list": ["payload_pass1", "payload_pass2"],
            "form_method": "POST",
            "csrf_token_name": "csrf",
            "csrf_token_value": "token123",
            "cookies": {"session": "initialsession"},
            "auth_file_content": auth_file_content # Add the new field
        }
        return data

    @patch('server.app.requests.Session.post')
    @patch('server.app.requests.Session.get')
    def test_creds_from_auth_content_if_provided_and_valid(self, mock_get, mock_post): # Renamed test
        mock_response = mock_post.return_value # Shared mock setup
        mock_response.status_code = 200
        mock_response.url = "http://example.com/dashboard"
        mock_response.text = "Welcome"
        mock_response.history = []
        mock_response.cookies = {}
        mock_response.headers = {}

        auth_content_data = "file_user1:file_pass1\nfile_user2:file_pass2"
        # Request data now includes auth_file_content
        request_data = self._make_test_credentials_request_data(auth_file_content=auth_content_data)

        # Patch parse_auth_content, not parse_auth_file
        # No need to patch AUTH_FILE_PATH as it's removed
        with patch('app.parse_auth_content', return_value=[("file_user1", "file_pass1"), ("file_user2", "file_pass2")]) as mock_parse_content:
            response = self.app.post('/test_credentials_stream', json=request_data)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.is_streamed)

            stream_content = b"".join(response.response).decode('utf-8')

            # Verify parse_auth_content was called with the string content
            mock_parse_content.assert_called_once_with(auth_content_data)

            self.assertIn("Using 2 credential pairs from uploaded content.", stream_content)
            self.assertIn('"total_expected_attempts": 2', stream_content)
            self.assertIn('"username": "file_user1"', stream_content)
            self.assertIn('"password_actual": "file_pass1"', stream_content)
            self.assertNotIn("payload_user1", stream_content)


    @patch('server.app.requests.Session.post')
    @patch('server.app.requests.Session.get')
    def test_creds_from_payload_if_no_auth_content(self, mock_get, mock_post): # Renamed test
        mock_response = mock_post.return_value
        mock_response.status_code = 200
        mock_response.url = "http://example.com/dashboard"
        mock_response.text = "Welcome"
        mock_response.history = []
        mock_response.cookies = {}
        mock_response.headers = {}

        # Pass auth_file_content=None (or omit it, _make_test_credentials_request_data handles default None)
        request_data = self._make_test_credentials_request_data(auth_file_content=None)

        with patch('server.app.parse_auth_content') as mock_parse_content: # Ensure it's not called
            response = self.app.post('/test_credentials_stream', json=request_data)
            self.assertEqual(response.status_code, 200)

            stream_content = b"".join(response.response).decode('utf-8')

            mock_parse_content.assert_not_called()
            self.assertIn("Using 2 credential pairs from individual lists.", stream_content)
            self.assertIn('"total_expected_attempts": 2', stream_content)
            self.assertIn('"username": "payload_user1"', stream_content)
            self.assertIn('"password_actual": "payload_pass1"', stream_content)
            self.assertNotIn("file_user1", stream_content)

    @patch('server.app.requests.Session.post')
    @patch('server.app.requests.Session.get')
    def test_creds_fallback_to_payload_if_auth_content_invalid_or_empty(self, mock_get, mock_post): # Renamed
        mock_response = mock_post.return_value
        mock_response.status_code = 200
        mock_response.url = "http://example.com/dashboard"
        mock_response.text = "Welcome"
        mock_response.history = []
        mock_response.cookies = {}
        mock_response.headers = {}

        # Provide empty string for auth_file_content
        request_data = self._make_test_credentials_request_data(auth_file_content="")

        # If auth_file_content is an empty string, the `if auth_file_content:` check in app.py fails,
        # so parse_auth_content is NOT called. The system falls back to payload lists.
        with patch('server.app.parse_auth_content') as mock_parse_content:
            response = self.app.post('/test_credentials_stream', json=request_data)
            self.assertEqual(response.status_code, 200)

            stream_content = b"".join(response.response).decode('utf-8')

            mock_parse_content.assert_not_called() # Should NOT be called for an empty string auth_file_content
            # The message should reflect that no *valid* auth content was found, leading to fallback.
            # Based on current app.py logic, an empty string auth_file_content will trigger the 'else' branch of 'if auth_file_content:'
            self.assertIn("Using 2 credential pairs from individual lists.", stream_content)
            self.assertIn('"total_expected_attempts": 2', stream_content)
            self.assertIn('"username": "payload_user1"', stream_content)
            self.assertIn('"password_actual": "payload_pass1"', stream_content)
            self.assertNotIn("file_user1", stream_content)

    @patch('server.app.requests.Session.post')
    @patch('server.app.requests.Session.get')
    def test_no_creds_if_auth_content_unparsable_and_payload_lists_empty(self, mock_get, mock_post):
        mock_response = mock_post.return_value # or mock_get, doesn't matter as no requests should be made
        mock_response.status_code = 200
        mock_response.url = "http://example.com/login" # dummy
        mock_response.text = "Welcome"
        mock_response.history = []
        mock_response.cookies = {}
        mock_response.headers = {}

        request_data = self._make_test_credentials_request_data(auth_file_content="malformed:content")
        # Override username_list and password_list from the helper to be empty for this specific test
        request_data["username_list"] = []
        request_data["password_list"] = []

        # parse_auth_content will be called with "malformed:content" and return []
        with patch('app.parse_auth_content', return_value=[]) as mock_parse_content:
            response = self.app.post('/test_credentials_stream', json=request_data)
            self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
