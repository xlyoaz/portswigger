#!/usr/bin/env python3
"""Test endpoints using HTTP requests only"""

import requests
import json
import re
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

# Step 1: OAuth authorize endpoint
print("[1] OAuth Login Flow:")
print("=" * 80)

auth_url = "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

try:
    # Get initial auth page
    resp = session.get(auth_url, allow_redirects=False, timeout=10)
    print(f"[A] GET authorize: {resp.status_code}")

    state = ""
    redirect_url = ""

    # Follow redirect if needed
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        print(f"[A] Redirect: {redirect_url[:80]}...")

        if 'state=' in redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            parsed = parse_qs(urlparse(redirect_url).query)
            if 'state' in parsed:
                state = parsed['state'][0]
                print(f"[A] Extracted state: {state[:50]}...")

        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"[A] Followed redirect: {resp.status_code}")

    # Step 2: Login POST
    print(f"\n[B] Submitting login credentials...")
    login_url = f"https://login.portswigger.net/u/login"
    if state:
        login_url = f"{login_url}?state={state}"

    login_data = {
        "username": username,
        "password": password,
        "action": "default"
    }

    resp = session.post(login_url, data=login_data, allow_redirects=False, timeout=10)
    print(f"[B] POST login: {resp.status_code}")

    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        print(f"[B] Redirect: {redirect_url[:100]}...")

        if not redirect_url.startswith('http'):
            redirect_url = urljoin("https://login.portswigger.net/", redirect_url)

        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"[B] Followed redirect: {resp.status_code}")

    # Step 3: Continue following redirects until we reach portswigger.net
    max_redirects = 10
    while resp.status_code in [301, 302, 303, 307, 308] and max_redirects > 0:
        redirect_url = resp.headers.get('Location', '')
        if not redirect_url.startswith('http'):
            redirect_url = urljoin("https://login.portswigger.net/", redirect_url)

        print(f"[B] Following redirect: {redirect_url[:80]}...")
        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"[B] Status: {resp.status_code}")
        max_redirects -= 1

    print(f"[B] Final URL: {resp.url}")
    print(f"\n[✓] Login flow completed")
    print(f"[*] Cookies stored: {len(session.cookies)}")
    print()

except Exception as e:
    print(f"[✗] Login error: {e}\n")
    exit(1)

# Step 3: Test endpoints
print("[2] Testing Endpoints:")
print("=" * 80)

endpoints = [
    ("SPA My Account", "https://portswigger.net/#/my-account"),
    ("SPA Subscriptions", "https://portswigger.net/#/subscriptions"),
    ("Users YouAccount", "https://portswigger.net/users/youraccount"),
    ("Users Email", f"https://portswigger.net/users/{username}"),
]

for name, url in endpoints:
    try:
        print(f"\n[{name}]")
        resp = session.get(url, allow_redirects=True, timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Final URL: {resp.url}")
        print(f"  Content length: {len(resp.text)} bytes")

        # Check for keywords
        keywords = []
        if "subscription" in resp.text.lower():
            keywords.append("subscription")
        if "plan" in resp.text.lower():
            keywords.append("plan")
        if "license" in resp.text.lower():
            keywords.append("license")
        if "You do not have" in resp.text:
            keywords.append("'You do not have'")

        if keywords:
            print(f"  ✓ Keywords: {', '.join(keywords)}")

        # Check for OAuth redirect
        if "authorize" in resp.text or "signin-oidc" in resp.text:
            print(f"  ⚠ WARNING: Contains OAuth redirect")

        # Save HTML
        safe_name = name.lower().replace(" ", "_")
        filename = f"test_{safe_name}.html"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(resp.text)
        print(f"  Saved: {filename}")

    except Exception as e:
        print(f"  [E] Error: {str(e)[:100]}")

print("\n" + "=" * 80)
print("[*] Test completed")
