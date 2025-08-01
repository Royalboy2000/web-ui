import unittest
from common_parsers import parse_auth_content

class TestDomainParsing(unittest.TestCase):

    def test_domain_with_colon(self):
        content = "www.crowd2fund.com 7709087924:Sexkitten"
        creds = parse_auth_content(content)
        self.assertEqual(len(creds), 1)
        self.assertEqual(creds[0], ("7709087924", "Sexkitten"))

    def test_domain_with_email(self):
        content = "www.crowd2fund.com r_h_price@yahoo.com:Sexkitten"
        creds = parse_auth_content(content)
        self.assertEqual(len(creds), 1)
        self.assertEqual(creds[0], ("r_h_price@yahoo.com", "Sexkitten"))

if __name__ == '__main__':
    unittest.main()
