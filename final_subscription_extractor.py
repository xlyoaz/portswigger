#!/usr/bin/env python3
"""Final subscription extractor using Playwright (JavaScript execution)"""

from playwright.sync_api import sync_playwright
import json
import sys
import time

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
        page.goto("https://login.portswigger.net/u/login", wait_until="networkidle", timeout=30000)

        # Fill login form
        page.fill('input[name="username"]', username)
        page.fill('input[name="password"]', password)

        # Click login button
        print("[3] Submitting login...")
        page.click('button[type="submit"]')

        # Wait for OAuth redirect
        page.wait_for_url("https://portswigger.net/**", timeout=30000)
        print(f"[✓] Login successful")
        print(f"    Current URL: {page.url}")

        # Wait for page to fully load
        page.wait_for_load_state("networkidle", timeout=10000)
        print(f"[✓] Page loaded\n")

        # Navigate to my-account SPA
        print("[4] Navigating to MY ACCOUNT page...")
        page.goto("https://portswigger.net/#/my-account", wait_until="networkidle", timeout=15000)

        # Wait for JavaScript to render content
        time.sleep(2)  # Extra wait for React/Angular rendering
        page.wait_for_load_state("domcontentloaded", timeout=5000)

        print(f"[✓] Page loaded: {page.url}\n")

        # Extract all visible text
        print("[5] Extracting page content via JavaScript...")
        print("=" * 80)

        all_text = page.inner_text("body")
        print(f"Full page text ({len(all_text)} chars):\n")
        print(all_text[:2000])
        print("\n...\n")

        # Extract specific subscription information
        print("\n[6] Searching for subscription information...")
        print("=" * 80)

        # Look for specific elements
        result = page.evaluate("""() => {
            let data = {};

            // Get all text from body
            data.full_text = document.body.innerText;

            // Look for subscription-related elements
            data.elements = {};

            // Search for elements containing keywords
            const keywords = ['subscription', 'plan', 'license', 'product', 'account'];
            keywords.forEach(keyword => {
                const selector = `*`;
                const elements = document.querySelectorAll(selector);
                const found = [];

                elements.forEach(el => {
                    if (el.innerText && el.innerText.toLowerCase().includes(keyword)) {
                        if (el.innerText.length > 10 && el.innerText.length < 500) {
                            found.push({
                                tag: el.tagName,
                                class: el.className,
                                text: el.innerText.substring(0, 200)
                            });
                        }
                    }
                });

                if (found.length > 0) {
                    data.elements[keyword] = found.slice(0, 3);
                }
            });

            // Get all data attributes
            data.dataAttrs = [];
            document.querySelectorAll('[data-*]').forEach(el => {
                const attrs = el.attributes;
                for (let attr of attrs) {
                    if (attr.name.startsWith('data-')) {
                        data.dataAttrs.push({
                            name: attr.name,
                            value: attr.value.substring(0, 100)
                        });
                    }
                }
            });

            // Try to get window variables that might contain data
            data.window = {};
            const windowKeys = Object.keys(window).filter(k =>
                k.includes('data') || k.includes('state') || k.includes('app') || k.includes('user')
            ).slice(0, 20);

            windowKeys.forEach(key => {
                try {
                    const val = window[key];
                    if (typeof val === 'object' && val !== null) {
                        data.window[key] = JSON.stringify(val).substring(0, 200);
                    }
                } catch (e) {}
            });

            return data;
        }""")

        # Process and display results
        if result.get('elements'):
            for keyword, elements in result['elements'].items():
                print(f"\n[✓] Elements with '{keyword}':")
                for i, elem in enumerate(elements):
                    print(f"    {i+1}. [{elem['tag']}] {elem['text'][:100]}")

        # Display subscription-specific text
        print("\n[7] Subscription Details:")
        print("=" * 80)

        full_text = result['full_text']

        # Look for specific patterns
        import re

        patterns = [
            (r'(?i)You do not have.*?subscription', "No subscription message"),
            (r'(?i)you do not have any subscriptions', "Full no subscriptions message"),
            (r'(?i)subscription:?\s*([^\n]+)', "Subscription info"),
            (r'(?i)plan:?\s*([^\n]+)', "Plan info"),
            (r'(?i)license:?\s*([^\n]+)', "License info"),
            (r'(?i)status:?\s*([^\n]+)', "Status info"),
            (r'(?i)(professional|team|enterprise|community|free|standard)', "Product type"),
        ]

        found_any = False
        for pattern, label in patterns:
            matches = re.findall(pattern, full_text, re.MULTILINE | re.DOTALL)
            if matches:
                print(f"\n✓ {label}:")
                for match in matches[:3]:
                    match_clean = match.strip() if isinstance(match, str) else str(match)
                    print(f"  - {match_clean[:120]}")
                found_any = True

        if not found_any:
            print("\n[-] No specific subscription patterns found")
            print("[*] Full page content saved - check files for details")

        # Save all results
        print("\n[8] Saving results...")
        print("=" * 80)

        with open("subscription_data.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print("✓ Saved: subscription_data.json")

        with open("subscription_full_text.txt", "w", encoding="utf-8") as f:
            f.write(full_text)
        print("✓ Saved: subscription_full_text.txt")

        with open("subscription_page_final.html", "w", encoding="utf-8") as f:
            f.write(page.content())
        print("✓ Saved: subscription_page_final.html")

        browser.close()

        print("\n" + "=" * 80)
        print("[✓] Extraction completed successfully!")
        print("[*] Check these files:")
        print("    - subscription_data.json (structured data)")
        print("    - subscription_full_text.txt (all text)")
        print("    - subscription_page_final.html (rendered HTML)")

except ImportError:
    print("[!] Playwright not installed")
    print("\nInstall with:")
    print("  pip install playwright")
    print("\nThen run:")
    print("  playwright install chromium")
    sys.exit(1)

except Exception as e:
    print(f"[✗] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
