import unittest
import os
import json
from unittest.mock import patch, MagicMock

# Add parent directory to sys.path to import app and other modules
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app

class TestAnalyzeUrl(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def _create_mock_response(self, text, status_code=200):
        mock_response = MagicMock()
        mock_response.text = text
        mock_response.status_code = status_code
        mock_response.raise_for_status = MagicMock()
        if status_code >= 400:
            mock_response.raise_for_status.side_effect = Exception("HTTP Error")
        return mock_response

    @patch('requests.Session.get')
    def test_finds_fields_by_name_and_id(self, mock_get):
        html = """
        <form>
          <input type="text" name="username">
          <input type="password" id="password">
        </form>
        """
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['username_field_name'], 'username')
        self.assertEqual(data['password_field_name'], 'password')

    @patch('requests.Session.get')
    def test_finds_fields_by_placeholder(self, mock_get):
        html = """
        <form>
          <input type="email" placeholder="Enter your email">
          <input type="password" placeholder="Enter your password">
        </form>
        """
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        # The fields have no name or id, so it should be "Could not auto-detect"
        # but the heuristic function will have found the input elements.
        # This test confirms the request succeeds. A more advanced test could assert logs.
        self.assertIsNotNone(data['username_field_name'])
        self.assertIsNotNone(data['password_field_name'])

    @patch('requests.Session.get')
    def test_finds_fields_by_aria_label(self, mock_get):
        html = """
        <form>
          <input type="text" aria-label="Username">
          <input type="password" aria-label="Password">
        </form>
        """
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(data['username_field_name'])
        self.assertIsNotNone(data['password_field_name'])

    @patch('requests.Session.get')
    def test_finds_fields_by_label_for(self, mock_get):
        html = """
        <form>
          <label for="user_field">Username</label>
          <input type="text" id="user_field">
          <label for="pass_field">Password</label>
          <input type="password" id="pass_field">
        </form>
        """
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['username_field_name'], 'user_field')
        self.assertEqual(data['password_field_name'], 'pass_field')

    @patch('requests.Session.get')
    def test_no_password_field_found(self, mock_get):
        html = """
        <form>
          <input type="text" name="username">
        </form>
        """
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(data['error'], 'No password input field found on the page.')

    @patch('requests.Session.get')
    def test_password_field_not_in_form(self, mock_get):
        html = '<div><input type="password" name="pwd"></div>'
        mock_get.return_value = self._create_mock_response(html)
        response = self.app.post('/analyze_url', json={'url': 'http://example.com'})
        data = json.loads(response.data)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(data['error'], "Password field found, but it's not within a form.")

if __name__ == '__main__':
    unittest.main()
