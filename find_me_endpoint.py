#!/usr/bin/env python3
"""Find the /api/me or similar endpoint that SPA calls"""

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

# Test /me endpoints extensively
print("[A] Testing /api/me variations:")
print("=" * 80)

me_endpoints = [
    "https://portswigger.net/api/me",
    "https://portswigger.net/api/user/me",
    "https://portswigger.net/api/account/me",
    "https://portswigger.net/api/v1/me",
    "https://portswigger.net/api/v2/me",
    "https://portswigger.net/api/users/me",
    "https://portswigger.net/me",
    "https://portswigger.net/user/me",
]

for url in me_endpoints:
    try:
        resp = session.get(url, headers={"Accept": "application/json"}, timeout=10)
        if resp.status_code != 404:
            print(f"\n[!] {url}: {resp.status_code}")
            try:
                data = resp.json()
                print(f"    JSON Response:\n{json.dumps(data, indent=2)}")
            except:
                print(f"    Text Response:\n{resp.text[:500]}")
        else:
            print(f"[-] {url}: 404")
    except Exception as e:
        print(f"[E] {url}: {str(e)[:50]}")

# Test user endpoint with email
print("\n\n[B] Testing user-specific endpoints:")
print("=" * 80)

user_endpoints = [
    f"https://portswigger.net/api/user/{username}",
    f"https://portswigger.net/api/users/{username}",
]

for url in user_endpoints:
    try:
        resp = session.get(url, headers={"Accept": "application/json"}, timeout=10)
        if resp.status_code != 404:
            print(f"\n[!] {url}: {resp.status_code}")
            try:
                data = resp.json()
                print(f"    JSON Response:\n{json.dumps(data, indent=2)}")
            except:
                print(f"    Text Response:\n{resp.text[:500]}")
        else:
            print(f"[-] {url}: 404")
    except Exception as e:
        print(f"[E] {url}: {str(e)[:50]}")

# Test profile/account endpoints
print("\n\n[C] Testing profile/account endpoints:")
print("=" * 80)

profile_endpoints = [
    "https://portswigger.net/api/profile",
    "https://portswigger.net/api/account",
    "https://portswigger.net/api/profile/me",
    "https://portswigger.net/api/account/profile",
]

for url in profile_endpoints:
    try:
        resp = session.get(url, headers={"Accept": "application/json"}, timeout=10)
        if resp.status_code != 404:
            print(f"\n[!] {url}: {resp.status_code}")
            try:
                data = resp.json()
                print(f"    JSON Response:\n{json.dumps(data, indent=2)}")
            except:
                print(f"    Text Response:\n{resp.text[:500]}")
        else:
            print(f"[-] {url}: 404")
    except Exception as e:
        print(f"[E] {url}: {str(e)[:50]}")

print("\n" + "=" * 80)
print("[*] Scan completed")
