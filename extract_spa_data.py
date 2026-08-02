#!/usr/bin/env python3
"""Extract subscription data from SPA HTML files"""

import re
import json

def extract_from_html(filename):
    """Extract subscription data from HTML file"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            html = f.read()
    except Exception as e:
        print(f"[E] Could not read {filename}: {e}")
        return

    print(f"\n[{filename}]")
    print("=" * 80)

    # Method 1: Look for specific keywords
    print("[1] Searching for keywords...")
    keywords = ['subscription', 'plan', 'license', 'product']
    found = set()

    for keyword in keywords:
        if keyword in html.lower():
            found.add(keyword)

            # Extract context around keyword (100 chars before and after)
            pattern = f'.{{0,100}}{re.escape(keyword)}.{{0,100}}'
            matches = re.findall(pattern, html, re.IGNORECASE)
            if matches:
                print(f"\n  ✓ Found '{keyword}':")
                for match in matches[:2]:  # Show first 2 matches
                    # Clean up
                    match = match.replace('\n', ' ').replace('\t', ' ')
                    match = re.sub(r'\s+', ' ', match)
                    print(f"    ...{match}...")

    # Method 2: Extract JSON objects
    print(f"\n[2] Looking for JSON data...")

    # Find all JSON-like structures
    json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    json_matches = re.findall(json_pattern, html)

    subscription_jsons = []
    for match in json_matches:
        if any(keyword in match.lower() for keyword in ['subscription', 'plan', 'license', 'product', 'account']):
            try:
                data = json.loads(match)
                subscription_jsons.append(data)
            except:
                pass

    if subscription_jsons:
        print(f"  ✓ Found {len(subscription_jsons)} JSON objects with subscription data")
        for i, data in enumerate(subscription_jsons[:3]):  # Show first 3
            print(f"\n  [JSON {i+1}]")
            print(json.dumps(data, indent=2)[:500])
    else:
        print("  [-] No JSON objects with subscription keywords")

    # Method 3: Extract text content (remove HTML tags)
    print(f"\n[3] Extracting visible text...")
    text = re.sub(r'<[^>]*>', '', html)
    text = re.sub(r'\s+', ' ', text).strip()

    # Look for text containing subscription info
    for keyword in ['subscription', 'plan', 'You do not have']:
        pattern = f'.{{0,150}}{re.escape(keyword)}.{{0,150}}'
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            print(f"\n  ✓ Text with '{keyword}':")
            for match in matches[:1]:  # Show first match
                match = re.sub(r'\s+', ' ', match)
                print(f"    {match}")

    # Method 4: Look for data attributes
    print(f"\n[4] Looking for data attributes...")
    data_attrs = re.findall(r'data-[^=]*="([^"]*(?:[^"]*subscription[^"]*|[^"]*plan[^"]*|[^"]*license[^"]*)[^"]*)"', html, re.IGNORECASE)
    if data_attrs:
        print(f"  ✓ Found {len(data_attrs)} data attributes")
        for attr in data_attrs[:3]:
            print(f"    {attr[:100]}")

    # Method 5: Extract from script tags
    print(f"\n[5] Checking script tags...")
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    script_count = 0

    for script in scripts:
        if any(keyword in script.lower() for keyword in ['subscription', 'plan', 'license']):
            script_count += 1
            # Try to extract JSON from script
            json_in_script = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', script)
            if json_in_script:
                print(f"  ✓ Script tag {script_count} contains subscription data")
                for json_str in json_in_script[:2]:
                    try:
                        data = json.loads(json_str)
                        if any(k in str(data).lower() for k in ['subscription', 'plan', 'license']):
                            print(f"    {json.dumps(data, indent=2)[:300]}")
                    except:
                        pass

# Process the saved files
files = [
    "test_spa_my_account.html",
    "test_spa_subscriptions.html",
]

for filename in files:
    try:
        extract_from_html(filename)
    except Exception as e:
        print(f"[E] Error processing {filename}: {e}")

print("\n" + "=" * 80)
print("[*] Extraction completed")
