#!/usr/bin/env python3
"""Test SPA endpoints for subscription data"""

from playwright.sync_api import sync_playwright
import sys
import json

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

        # Wait for OAuth callback
        page.wait_for_url("https://portswigger.net/**", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        print(f"[✓] Login successful - Current URL: {page.url}\n")

        # Test SPA endpoints
        print("[4] Testing SPA endpoints:")
        print("=" * 80)

        spa_urls = [
            "https://portswigger.net/#/my-account",
            "https://portswigger.net/#/subscriptions",
        ]

        for url in spa_urls:
            print(f"\n[Testing] {url}")

            try:
                page.goto(url, wait_until="networkidle", timeout=15000)
                print(f"  ✓ Navigated")
                print(f"  Final URL: {page.url}")

                # Get page content
                content = page.content()
                print(f"  Content length: {len(content)} bytes")

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
                    print(f"  ✓ Found keywords: {', '.join(keywords_found)}")

                # Extract visible text
                text = page.inner_text("body")
                print(f"  Page text (first 300 chars):\n  {text[:300]}\n")

                # Save HTML
                filename = f"page_spa_{spa_urls.index(url)}.html"
                with open(filename, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  Saved to: {filename}")

                # Try to get JSON data from page
                print(f"\n  [*] Attempting to extract JSON data from page...")

                # Look for data in script tags
                script_tags = page.query_selector_all("script")
                for i, script in enumerate(script_tags[:5]):
                    script_content = script.inner_text()
                    if any(keyword in script_content.lower() for keyword in ['subscription', 'plan', 'license', 'product']):
                        print(f"    Found relevant data in script tag {i}")
                        print(f"    Content (first 200 chars): {script_content[:200]}")

            except Exception as e:
                print(f"  [E] Error: {str(e)[:150]}")

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
