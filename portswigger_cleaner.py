#!/usr/bin/env python3
"""
Clean portswigger.net ULP file - Extract email:password pairs only
"""

import re
import sys

INPUT_FILE = "/root/.claude/uploads/604798e0-f63e-5e79-8bbe-0ec0c535673c/9c4f0f65-portswigger_net_ulp.txt"
OUTPUT_FILE = "portswigger_credentials.txt"

def extract_credentials(line):
    """
    Extract email:password from various formats:
    - domain:email@domain:password
    - https://domain email@domain:password
    - domain.com email@domain:password
    """
    line = line.strip()

    # Skip empty lines and comments
    if not line or line.startswith('#'):
        return None

    # Look for email:password pattern (email contains @ and password after :)
    # Pattern: something email@domain:password
    match = re.search(r'([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}):([^\s]+)', line)

    if match:
        email = match.group(1)
        password = match.group(2)
        # Clean password from trailing quotes or special chars
        password = password.rstrip('\'"').strip()
        return f"{email}:{password}"

    return None

def main():
    print("[*] PortSwigger Credentials Cleaner")
    print(f"[*] Input: {INPUT_FILE}")
    print(f"[*] Output: {OUTPUT_FILE}")
    print("")

    try:
        with open(INPUT_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"ERROR: File not found: {INPUT_FILE}")
        sys.exit(1)

    print(f"Step 1: Reading file... {len(lines)} lines")
    print("")

    print("Step 2: Extracting credentials...")
    credentials = []
    duplicates = set()

    for line in lines:
        cred = extract_credentials(line)
        if cred and cred not in duplicates:
            credentials.append(cred)
            duplicates.add(cred)

    print(f"✓ Found {len(credentials)} unique credentials")
    print("")

    # Write output
    print("Step 3: Writing output file...")
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# PortSwigger.net Credentials (email:password)\n")
        f.write(f"# Total: {len(credentials)} unique credentials\n")
        f.write(f"#\n")
        for cred in credentials:
            f.write(f"{cred}\n")

    print(f"✓ Saved to: {OUTPUT_FILE}")
    print("")

    # Summary
    print("============================================================")
    print("CLEANING COMPLETE")
    print("============================================================")
    print(f"Total lines processed: {len(lines)}")
    print(f"Unique credentials found: {len(credentials)}")
    print(f"Output: {OUTPUT_FILE}")
    print("============================================================")

if __name__ == "__main__":
    main()
