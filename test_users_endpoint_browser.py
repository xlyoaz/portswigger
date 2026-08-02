#!/usr/bin/env python3
"""Test /users/ endpoints using browser automation (Playwright)"""

from playwright.sync_api import sync_playwright
import sys

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

# Proxy settings
proxy = {
    "server": "http://ankara8.buymobileproxy.com:8029",
    "username": "buymobileproxycom",
    "password": "mugla9392"
}

try:
    with sync_playwright() as p:
        print("[1] Launching browser...")
        browser = p.chromium.launch(proxy=proxy)
        context = browser.new_context()
        page = context.new_page()

        print("[2] Logging in...")
        page.goto("https://login.portswigger.net/u/login", wait_until="networkidle")

        # Fill login form
        page.fill('input[name="username"]', username)
        page.fill('input[name="password"]', password)

        # Click login button
        print("[3] Submitting login...")
        page.click('button[type="submit"]')

        # Wait for redirect after login
        page.wait_for_url("https://portswigger.net/**", timeout=30000)
        print(f"[✓] Login successful - Redirected to: {page.url}\n")

        # Test /users/ endpoints
        print("[4] Testing /users/ endpoints:")
        print("=" * 80)

        urls = [
            "https://portswigger.net/users/youraccount",
            f"https://portswigger.net/users/{username}",
            f"https://portswigger.net/users/{username.split('@')[0]}",
        ]

        for i, url in enumerate(urls):
            try:
                print(f"\n[{i}] Testing: {url}")
                page.goto(url, wait_until="networkidle", timeout=15000)

                content = page.content()
                print(f"    Status: 200 (navigated successfully)")
                print(f"    Content length: {len(content)} bytes")
                print(f"    Final URL: {page.url}")

                # Check for keywords
                keywords_found = []
                if "subscription" in content.lower():
                    keywords_found.append("subscription")
                if "plan" in content.lower():
                    keywords_found.append("plan")
                if "license" in content.lower():
                    keywords_found.append("license")
                if "You do not have" in content:
                    keywords_found.append("'You do not have' message")

                if keywords_found:
                    print(f"    ✓ Found: {', '.join(keywords_found)}")
                else:
                    print("    [-] No subscription keywords found")

                # Check if it's an error/redirect
                if "signin-oidc" in content or "authorize" in content:
                    print("    ⚠ WARNING: Page contains OAuth redirect")
                if "404" in content.lower():
                    print("    ⚠ WARNING: Page contains 404 error")

                # Save HTML
                filename = f"page_{i}_browser.html"
                with open(filename, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"    Saved to: {filename}")

            except Exception as e:
                print(f"    [E] Error: {str(e)[:100]}")

        browser.close()
        print("\n" + "=" * 80)
        print("[*] Test completed")

except ImportError:
    print("[!] Playwright not installed")
    print("Install with: pip install playwright")
    print("Then run: playwright install chromium")
    sys.exit(1)

except Exception as e:
    print(f"[✗] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
