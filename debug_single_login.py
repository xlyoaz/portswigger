#!/usr/bin/env python3
"""Debug script to test single login and see what's happening"""

import requests
import re
from urllib.parse import urlparse, parse_qs

# Use first credential from log.txt
email = "01.02shivamsingh@gmail.com"
password = "o8LnJe#2,46&Z5t5(,_LW^x!4^zxH8b9"

LOGIN_URL = "https://portswigger.net/users"
LOGIN_POST_URL = "https://login.portswigger.net/u/login"
LICENSES_URL = "https://portswigger.net/users/youraccount/licenses"

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
})

print(f"Testing login for: {email}")
print("=" * 60)

# Step 1: Get login page
print("\n[1] Getting login page...")
resp1 = session.get(LOGIN_URL, timeout=30)
print(f"Status: {resp1.status_code}")
print(f"URL: {resp1.url}")

# Extract all form fields
form_fields = {}
pattern = r'<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"'
for match in re.finditer(pattern, resp1.text):
    form_fields[match.group(1)] = match.group(2)

print(f"\nForm fields found: {list(form_fields.keys())}")
for key, val in form_fields.items():
    print(f"  {key} = {val[:50]}")

# Step 2: Try to POST login
print("\n[2] Posting credentials...")
form_fields['username'] = email
form_fields['password'] = password

print(f"Sending form fields: {list(form_fields.keys())}")
resp2 = session.post(LOGIN_POST_URL, data=form_fields, timeout=30, allow_redirects=True)

print(f"Status: {resp2.status_code}")
print(f"URL: {resp2.url}")
print(f"Content length: {len(resp2.text)}")

# Check response content
if resp2.status_code >= 400:
    print(f"\nERROR Response (first 500 chars):")
    print(resp2.text[:500])
else:
    # Check for error messages in response
    if "Wrong email or password" in resp2.text:
        print("\n✗ Wrong email or password")
    elif "Invalid email or password" in resp2.text:
        print("\n✗ Invalid email or password")
    elif "name=\"state\"" in resp2.text:
        print("\n✗ Still on login form (login failed)")
    else:
        print("\n✓ Appears to have logged in successfully")

# Step 3: Try to access licenses page
print("\n[3] Accessing licenses page...")
resp3 = session.get(LICENSES_URL, timeout=30)
print(f"Status: {resp3.status_code}")
print(f"URL: {resp3.url}")

if resp3.status_code == 200:
    if "You do not have any subscriptions" in resp3.text:
        print("✓ Free account (no subscriptions)")
    else:
        print("✓ Licenses page accessible")
        # Check for plan types
        if "Professional" in resp3.text:
            print("  Plan: Professional")
        elif "Enterprise" in resp3.text:
            print("  Plan: Enterprise")
        elif "Community" in resp3.text:
            print("  Plan: Community")
else:
    print(f"✗ Cannot access licenses page: {resp3.status_code}")

print("\n" + "=" * 60)
