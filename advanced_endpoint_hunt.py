#!/usr/bin/env python3
"""Advanced endpoint discovery for PortSwigger subscriptions"""

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

# Advanced endpoint testing
print("[2] Advanced Endpoint Discovery:")
print("=" * 80)

# 1. GraphQL endpoint
print("\n[A] GraphQL Endpoint Test:")
graphql_endpoints = [
    "https://portswigger.net/graphql",
    "https://portswigger.net/api/graphql",
    "https://api.portswigger.net/graphql",
]

for url in graphql_endpoints:
    try:
        query = {"query": "{ subscriptions { id plan } }"}
        resp = session.post(url, json=query, timeout=10)
        print(f"  {url}: {resp.status_code}")
        if resp.status_code in [200, 400]:
            print(f"    Response: {resp.text[:200]}")
    except Exception as e:
        print(f"  {url}: Error")

# 2. Common API Patterns
print("\n[B] Common API Patterns:")
common_patterns = [
    "https://portswigger.net/api/me",
    "https://portswigger.net/api/me/subscriptions",
    "https://portswigger.net/api/me/licenses",
    "https://portswigger.net/api/me/plan",
    "https://portswigger.net/api/accounts/me",
    "https://portswigger.net/api/current-user",
    "https://portswigger.net/api/current-user/subscriptions",
    "https://portswigger.net/rest/api/1/user",
    "https://portswigger.net/rest/api/2/user",
]

for url in common_patterns:
    try:
        resp = session.get(url, headers={"Accept": "application/json"}, timeout=10)
        if resp.status_code in [200, 201]:
            print(f"  [✓] {url}: {resp.status_code}")
            try:
                data = resp.json()
                print(f"      {json.dumps(data)[:250]}")
            except:
                print(f"      {resp.text[:150]}")
        elif resp.status_code != 404:
            print(f"  [?] {url}: {resp.status_code}")
    except:
        pass

# 3. Direct page access and search for subscription keyword
print("\n[C] Page HTML Analysis (searching for 'subscription' keyword):")
test_pages = [
    "https://portswigger.net/",
]

for url in test_pages:
    try:
        resp = session.get(url, allow_redirects=True, timeout=10)
        print(f"  {url}: {resp.status_code}")

        # Search for subscription-related info
        if "subscription" in resp.text.lower():
            print(f"    [✓] Found 'subscription' in page!")
            # Find all links that might lead to subscriptions
            import re
            links = re.findall(r'href=["\']([^"\']+)["\']', resp.text)
            for link in links:
                if 'subscr' in link.lower() or 'plan' in link.lower() or 'license' in link.lower() or 'billing' in link.lower():
                    print(f"      Found link: {link}")
    except:
        pass

# 4. Check common SPA routes
print("\n[D] Single Page Application (SPA) Routes:")
spa_routes = [
    "https://portswigger.net/#/account",
    "https://portswigger.net/#/account/subscriptions",
    "https://portswigger.net/#/subscriptions",
    "https://portswigger.net/#/billing",
]

for url in spa_routes:
    try:
        resp = session.get(url, allow_redirects=True, timeout=10)
        print(f"  {url}: {resp.status_code}")
    except:
        pass

print("\n" + "=" * 80)
print("[*] Test completed")
