import os
from common_parsers import parse_auth_content

def test_new_parser_with_sample_files():
    """
    Tests the new parser with all the sample files.
    """
    sample_files_dir = "sample-files"
    files_to_test = [f for f in os.listdir(sample_files_dir) if os.path.isfile(os.path.join(sample_files_dir, f))]

    for filename in files_to_test:
        filepath = os.path.join(sample_files_dir, filename)
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            credentials = parse_auth_content(content)
            print(f"Found {len(credentials)} credentials in {filename}")
            if filename == "test.txt":
                assert len(credentials) == 0
            else:
                assert len(credentials) > 0

if __name__ == "__main__":
    test_new_parser_with_sample_files()
