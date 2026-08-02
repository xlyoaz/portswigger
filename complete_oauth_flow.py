#!/usr/bin/env python3
"""Complete OAuth flow and access /users/youraccount endpoint"""

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

print("[1] Complete OAuth Flow:")
print("=" * 80)

try:
    # Step 1: Get auth endpoint
    print("[Step 1] Initiating OAuth authorization...")
    auth_url = "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

    resp = session.get(auth_url, allow_redirects=False, timeout=10)
    print(f"  Status: {resp.status_code}")

    state = ""
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        print(f"  Redirect to: {redirect_url[:60]}...")

        if 'state=' in redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            parsed = parse_qs(urlparse(redirect_url).query)
            if 'state' in parsed:
                state = parsed['state'][0]

        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"  Followed redirect: {resp.status_code}")

    # Step 2: Submit login
    print(f"\n[Step 2] Submitting login credentials...")
    login_url = f"https://login.portswigger.net/u/login"
    if state:
        login_url = f"{login_url}?state={state}"

    login_data = {
        "username": username,
        "password": password,
        "action": "default"
    }

    resp = session.post(login_url, data=login_data, allow_redirects=False, timeout=10)
    print(f"  Status: {resp.status_code}")

    redirect_chain = []
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        print(f"  Redirect to: {redirect_url[:60]}...")
        redirect_chain.append(redirect_url)

        if not redirect_url.startswith('http'):
            redirect_url = urljoin("https://login.portswigger.net/", redirect_url)

        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"  Status: {resp.status_code}")

    # Step 3: Follow redirect chain
    print(f"\n[Step 3] Following OAuth redirect chain...")
    max_redirects = 15
    redirect_count = 0

    while resp.status_code in [301, 302, 303, 307, 308] and redirect_count < max_redirects:
        redirect_url = resp.headers.get('Location', '')
        if not redirect_url:
            break

        if not redirect_url.startswith('http'):
            redirect_url = urljoin("https://login.portswigger.net/", redirect_url)

        print(f"  Redirect {redirect_count + 1}: {redirect_url[:70]}...")
        redirect_chain.append(redirect_url)

        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"    Status: {resp.status_code}")

        # Stop if we reach portswigger.net (not login.portswigger.net)
        if "portswigger.net/signin-oidc" in resp.url or "portswigger.net" in resp.url and "login.portswigger.net" not in resp.url:
            print(f"    ✓ Reached portswigger.net")
            break

        redirect_count += 1

    final_url = resp.url
    print(f"\n  Final URL: {final_url}")
    print(f"  Total redirects: {len(redirect_chain)}")
    print(f"  Cookies stored: {len(session.cookies)}")

    # Check if we got an error
    if "error" in final_url.lower() or resp.status_code >= 400:
        print(f"  ⚠ WARNING: OAuth flow ended with error or redirect issue")
        print(f"  Status: {resp.status_code}")

    # Try to get to portswigger.net main page to ensure authenticated
    print(f"\n[Step 4] Navigating to PortSwigger...")
    resp = session.get("https://portswigger.net/", allow_redirects=True, timeout=10)
    print(f"  Status: {resp.status_code}")
    print(f"  URL: {resp.url}")

    print(f"\n[✓] OAuth flow completed")
    print(f"[*] Session ready with {len(session.cookies)} cookies\n")

except Exception as e:
    print(f"[✗] OAuth error: {e}\n")
    exit(1)

# Now try to access /users/youraccount
print("[2] Accessing /users/youraccount:")
print("=" * 80)

try:
    url = "https://portswigger.net/users/youraccount"
    resp = session.get(url, allow_redirects=True, timeout=10)

    print(f"Status: {resp.status_code}")
    print(f"Final URL: {resp.url}")
    print(f"Content length: {len(resp.text)} bytes")

    # Check for subscription data
    content = resp.text

    keywords_found = []
    if "subscription" in content.lower():
        keywords_found.append("subscription")
    if "plan" in content.lower():
        keywords_found.append("plan")
    if "license" in content.lower():
        keywords_found.append("license")
    if "You do not have" in content:
        keywords_found.append("'You do not have'")

    if keywords_found:
        print(f"\n✓ Keywords found: {', '.join(keywords_found)}")

    # Check for OAuth redirect
    if "authorize" in content.lower() or "signin-oidc" in content.lower():
        print(f"  ⚠ WARNING: Contains OAuth redirect (NOT authenticated)")
    else:
        print(f"  ✓ No OAuth redirect (likely authenticated)")

    # Extract text content
    import re
    text_only = re.sub(r'<[^>]*>', '', content)
    text_only = re.sub(r'\s+', ' ', text_only).strip()

    print(f"\nPage content (first 500 chars):")
    print(f"  {text_only[:500]}\n")

    # Save response
    with open("users_youraccount.html", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved: users_youraccount.html")

    # Try to find subscription info
    print(f"\nSearching for subscription details...")
    for keyword in ["You do not have", "subscription", "plan", "license", "email"]:
        pattern = f'.{{0,100}}{re.escape(keyword)}.{{0,100}}'
        matches = re.findall(pattern, text_only, re.IGNORECASE)
        if matches:
            print(f"\n  ✓ {keyword}:")
            for match in matches[:2]:
                print(f"    {match.strip()[:120]}")

except Exception as e:
    print(f"Error accessing endpoint: {e}")

print("\n" + "=" * 80)
print("[*] Test completed")
