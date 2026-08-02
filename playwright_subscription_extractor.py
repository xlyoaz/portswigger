#!/usr/bin/env python3
"""Extract subscription data using browser automation (Playwright)"""

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
        page.goto("https://login.portswigger.net/u/login")

        # Fill login form
        page.fill('input[name="username"]', username)
        page.fill('input[name="password"]', password)

        # Click login button
        print("[3] Submitting login...")
        page.click('button[type="submit"]')

        # Wait for navigation
        page.wait_for_url("https://portswigger.net/**", timeout=30000)
        print(f"[✓] Login successful - Redirected to: {page.url}\n")

        # Navigate to subscriptions page
        print("[4] Navigating to subscriptions page...")
        page.goto("https://portswigger.net/#/subscriptions")
        page.wait_for_load_state("networkidle", timeout=10000)

        print("[5] Extracting subscription data...")

        # Method 1: Look for "You do not have any subscriptions" message
        try:
            no_sub_text = page.locator('text="You do not have any subscriptions"').inner_text()
            print(f"[✓] Found message: {no_sub_text}")
        except:
            print("[-] No 'You do not have any subscriptions' message found")

        # Method 2: Extract all text from subscriptions section
        try:
            page_content = page.content()
            if "subscription" in page_content.lower():
                print("[✓] 'subscription' keyword found in page")

            # Look for any plan/license data
            if "plan" in page_content.lower():
                print("[✓] 'plan' keyword found in page")

            if "license" in page_content.lower():
                print("[✓] 'license' keyword found in page")
        except:
            pass

        # Method 3: Try to extract structured data
        print("\n[6] Extracting all page data...")

        # Get all text content
        all_text = page.inner_text("body")
        print(f"Page text (first 500 chars):\n{all_text[:500]}\n")

        # Get all visible elements
        elements = page.query_selector_all("[class*='subscription'], [class*='plan'], [class*='license'], [id*='subscription'], [id*='plan']")
        if elements:
            print(f"[✓] Found {len(elements)} subscription-related elements")
            for elem in elements[:5]:
                try:
                    text = elem.inner_text()
                    if text:
                        print(f"    - {text[:100]}")
                except:
                    pass

        # Method 4: Check Network tab (captured requests)
        print("\n[7] Checking captured network requests...")

        # Re-navigate with recording
        context.clear_cookies()
        page2 = context.new_page()

        requests_made = []

        def log_request(request):
            if "subscription" in request.url.lower() or "plan" in request.url.lower() or "license" in request.url.lower():
                requests_made.append({
                    "url": request.url,
                    "method": request.method,
                })

        page2.on("request", log_request)

        # Login again
        page2.goto("https://login.portswigger.net/u/login")
        page2.fill('input[name="username"]', username)
        page2.fill('input[name="password"]', password)
        page2.click('button[type="submit"]')
        page2.wait_for_url("https://portswigger.net/**", timeout=30000)

        # Go to subscriptions
        page2.goto("https://portswigger.net/#/subscriptions")
        page2.wait_for_load_state("networkidle", timeout=10000)

        if requests_made:
            print(f"[✓] Captured {len(requests_made)} subscription-related requests:")
            for req in requests_made:
                print(f"    - {req['method']} {req['url']}")
        else:
            print("[-] No subscription-related requests found")

        browser.close()
        print("\n[*] Extraction completed")

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
