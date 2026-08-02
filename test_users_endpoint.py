#!/usr/bin/env python3
"""Test /users/ endpoints"""

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

    print(f"[✓] Login successful")
    print(f"[*] Session cookies: {len(session.cookies)} cookies stored")
    print(f"[*] Current URL: {resp.url}\n")
except Exception as e:
    print(f"[✗] Login error: {e}\n")
    exit(1)

# Test /users/ endpoints
print("[2] Testing /users/ endpoints:")
print("=" * 80)

urls = [
    "https://portswigger.net/users/youraccount",
    f"https://portswigger.net/users/{username}",
    f"https://portswigger.net/users/{username.split('@')[0]}",
]

for url in urls:
    try:
        resp = session.get(url, allow_redirects=True, timeout=10)
        print(f"\n[{resp.status_code}] {url}")
        print(f"  Final URL: {resp.url}")
        print(f"  Content length: {len(resp.text)} bytes")

        if resp.status_code == 200:
            print(f"  ✓ Success!")

            # Check for keywords
            if "subscription" in resp.text.lower():
                print("  ✓ Found 'subscription'")
            if "plan" in resp.text.lower():
                print("  ✓ Found 'plan'")
            if "license" in resp.text.lower():
                print("  ✓ Found 'license'")
            if "You do not have" in resp.text:
                print("  ✓ Found 'You do not have' message")

            # Check if it's just OAuth redirect
            if "signin-oidc" in resp.text:
                print("  ⚠ WARNING: Page contains OAuth redirect - not authenticated!")

            # Save HTML
            filename = f"page_{urls.index(url)}.html"
            with open(filename, "w", encoding="utf-8") as f:
                f.write(resp.text)
            print(f"  Saved to: {filename}")
    except Exception as e:
        print(f"\n[E] {url}: {str(e)[:50]}")

print("\n" + "=" * 80)
print("[*] Test completed")
