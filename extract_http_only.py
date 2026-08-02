#!/usr/bin/env python3
"""Extract subscription data from HTTP responses - NO JAVASCRIPT EXECUTION"""

import re
import json
import base64
import gzip
from io import BytesIO

def try_decode_base64(text):
    """Try to decode base64 strings"""
    try:
        if len(text) % 4 == 0 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in text):
            decoded = base64.b64decode(text)
            return decoded.decode('utf-8', errors='ignore')
    except:
        pass
    return None

def extract_from_file(filename):
    """Extract subscription data from HTML file"""
    print(f"\n[{filename}]")
    print("=" * 80)

    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        html = f.read()

    print(f"File size: {len(html)} bytes")

    # Method 1: Search for any string containing subscription-related keywords
    print("\n[1] Searching for all lines with subscription keywords...")

    keywords = ['subscription', 'plan', 'license', 'product', 'account', 'user', 'email']
    lines_with_keywords = {}

    for keyword in keywords:
        pattern = f'.{{0,200}}{re.escape(keyword)}.{{0,200}}'
        matches = re.findall(pattern, html, re.IGNORECASE)

        if matches:
            lines_with_keywords[keyword] = matches[:5]  # First 5 matches
            print(f"  ✓ {keyword}: {len(matches)} matches found")

            for i, match in enumerate(matches[:2]):
                # Clean up for display
                match_clean = match.replace('\n', ' ').replace('\t', ' ')
                match_clean = re.sub(r'\s+', ' ', match_clean).strip()
                print(f"      {i+1}. {match_clean[:150]}")

    # Method 2: Extract all data attributes
    print("\n[2] Extracting all data attributes...")
    data_attrs = re.findall(r'data-[^=]*="([^"]*)"', html)
    if data_attrs:
        print(f"  Found {len(data_attrs)} data attributes")
        for attr in data_attrs[:10]:
            if len(attr) > 20:
                print(f"    - {attr[:100]}")

    # Method 3: Extract all script tags and search for JSON
    print("\n[3] Extracting data from script tags...")
    scripts = re.findall(r'<script[^>]*(?:type="[^"]*")?[^>]*>(.*?)</script>', html, re.DOTALL)
    print(f"  Found {len(scripts)} script tags")

    json_found = False
    for i, script in enumerate(scripts):
        # Look for JSON patterns
        if '{' in script and '}' in script:
            # Try to find JSON objects
            json_objects = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', script)

            for j, json_str in enumerate(json_objects):
                # Check if it looks like it might contain data
                if any(keyword in json_str.lower() for keyword in keywords):
                    print(f"\n  [Script {i+1}, JSON {j+1}]")
                    try:
                        data = json.loads(json_str)
                        print(f"    Valid JSON!")
                        print(json.dumps(data, indent=2)[:300])
                        json_found = True
                    except:
                        # Even if not valid JSON, show the content
                        if len(json_str) > 30:
                            print(f"    Potential data: {json_str[:200]}")

    # Method 4: Search for email/username patterns
    print("\n[4] Searching for user/email patterns...")
    emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', html)
    if emails:
        print(f"  Found {len(emails)} email addresses:")
        for email in set(emails[:10]):
            print(f"    - {email}")

    # Method 5: Extract all hidden input values
    print("\n[5] Extracting hidden inputs and form data...")
    hidden_inputs = re.findall(r'<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"', html)
    if hidden_inputs:
        print(f"  Found {len(hidden_inputs)} hidden inputs:")
        for name, value in hidden_inputs[:10]:
            if len(value) < 200:
                print(f"    - {name}: {value[:100]}")

    # Method 6: Look for any JSON arrays or objects in the HTML
    print("\n[6] Extracting all JSON-like data...")
    # Find larger JSON structures
    large_json = re.findall(r'\[\s*\{[^}]*\{[^}]*\}[^}]*\}\s*\]', html)
    if large_json:
        print(f"  Found {len(large_json)} large JSON structures")
        for j_str in large_json[:2]:
            print(f"    {j_str[:200]}")

    # Method 7: Extract window variables
    print("\n[7] Looking for window variables...")
    window_vars = re.findall(r'window\.(\w+)\s*=\s*(["\']?[^;]+["\']?);', html)
    if window_vars:
        print(f"  Found {len(window_vars)} window variables:")
        for var_name, var_value in window_vars[:5]:
            print(f"    - {var_name}: {var_value[:100]}")

    # Method 8: Search for base64 encoded data
    print("\n[8] Searching for base64 encoded data...")
    # Look for long base64 strings
    base64_strings = re.findall(r'[A-Za-z0-9+/]{100,}={0,2}', html)
    if base64_strings:
        print(f"  Found {len(base64_strings)} potential base64 strings")
        for b64_str in base64_strings[:5]:
            decoded = try_decode_base64(b64_str)
            if decoded and any(keyword in decoded.lower() for keyword in keywords):
                print(f"\n  Decoded base64:")
                print(f"    {decoded[:200]}")

    # Method 9: Extract visible text only (no HTML tags)
    print("\n[9] Extracting clean text content...")
    text_only = re.sub(r'<[^>]*>', '', html)
    text_only = re.sub(r'\s+', ' ', text_only).strip()

    # Look for paragraphs with subscription keywords
    paragraphs = text_only.split('.')
    relevant_paragraphs = []
    for para in paragraphs:
        if any(keyword in para.lower() for keyword in keywords):
            para_clean = para.strip()
            if len(para_clean) > 20:
                relevant_paragraphs.append(para_clean)

    if relevant_paragraphs:
        print(f"  Found {len(relevant_paragraphs)} relevant sentences:")
        for para in relevant_paragraphs[:10]:
            print(f"    - {para[:120]}")

    # Save full extracted text for manual review
    print(f"\n[10] Saving extracted content to files...")
    with open(f"{filename[:-5]}_text_only.txt", "w", encoding="utf-8") as f:
        f.write(text_only)
    print(f"  Saved: {filename[:-5]}_text_only.txt")

# Process the saved files
files = [
    "test_spa_my_account.html",
    "test_spa_subscriptions.html",
]

print("=" * 80)
print("SUBSCRIPTION DATA EXTRACTION - HTTP ONLY")
print("=" * 80)

for filename in files:
    try:
        extract_from_file(filename)
    except FileNotFoundError:
        print(f"\n[E] File not found: {filename}")
    except Exception as e:
        print(f"\n[E] Error processing {filename}: {e}")

print("\n" + "=" * 80)
print("[*] Extraction completed - Check text files for details")
print("=" * 80)
