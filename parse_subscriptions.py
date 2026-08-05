#!/usr/bin/env python3

import re
import json
from pathlib import Path

CONFIGS_DIR = Path(r'C:\Users\Administrator\Desktop\silverbullet\Configs')
EXTRACTION_DIR = CONFIGS_DIR / 'extraction_results'
OUTPUT_FILE = CONFIGS_DIR / 'paid_accounts.txt'

def extract_subscription_from_html(html_content):
    """Extract subscription plan from HTML response"""

    # Check if account has no subscription
    if 'you do not have subscriptions' in html_content.lower():
        return None

    # Look for subscription plan information
    # Common patterns in PortSwigger licenses page
    patterns = [
        r'(?:Professional|Enterprise|Community|Free)[^<]*?(?:license|subscription|plan)',
        r'subscription["\'>]*>([^<]+)<',
        r'plan["\'>]*>([^<]+)<',
        r'<td[^>]*>([^<]*(?:Professional|Enterprise|Community|Standard|Burp Suite)[^<]*)<',
    ]

    for pattern in patterns:
        match = re.search(pattern, html_content, re.IGNORECASE)
        if match:
            plan = match.group(1) if match.lastindex else match.group(0)
            plan = plan.strip().replace('\n', ' ')
            if plan and len(plan) < 100:  # Sanity check
                return plan

    # If we found subscription page but couldn't extract plan name
    if 'subscription' in html_content.lower() or 'license' in html_content.lower():
        return 'Active'

    return None

def main():
    if not EXTRACTION_DIR.exists():
        print(f"Error: {EXTRACTION_DIR} directory not found")
        print("Run extract.svb in SilverBullet first to generate HTML files")
        return

    # Read original log.txt to map emails to passwords
    accounts = {}
    log_file = CONFIGS_DIR / 'log.txt'
    if log_file.exists():
        with open(log_file, 'r') as f:
            for line in f:
                line = line.strip()
                if ':' in line:
                    email, password = line.split(':', 1)
                    accounts[email] = password

    paid_accounts = []
    free_accounts = []
    failed_accounts = []

    # Process HTML files
    html_files = sorted(EXTRACTION_DIR.glob('*_licenses.html'))
    total = len(html_files)

    print(f"\nParsing {total} extracted HTML files...\n")

    for i, html_file in enumerate(html_files, 1):
        # Extract email from filename
        email = html_file.stem.replace('_licenses', '')
        # Reverse the filename encoding (replace _ with @ and .)
        email_reconstructed = email.replace('_', '.').replace('..', '@')
        # Find original email in accounts
        original_email = None
        for acc_email in accounts.keys():
            if acc_email.replace('@', '_').replace('.', '_') == email:
                original_email = acc_email
                break

        if not original_email:
            # Try direct match
            original_email = email

        print(f'[{i}/{total}] {original_email}... ', end='', flush=True)

        if original_email not in accounts:
            print('⚠ (email not found in log.txt)')
            failed_accounts.append(original_email)
            continue

        try:
            with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
                html_content = f.read()

            plan = extract_subscription_from_html(html_content)

            if plan:
                paid_accounts.append({
                    'email': original_email,
                    'password': accounts[original_email],
                    'plan': plan
                })
                print(f'✓ {plan}')
            else:
                free_accounts.append({
                    'email': original_email,
                    'password': accounts[original_email]
                })
                print('✗ (Free/No subscription)')

        except Exception as e:
            print(f'✗ Error: {e}')
            failed_accounts.append(original_email)

    # Save results
    print(f'\n{"="*60}')
    print(f'Results:')
    print(f'  Paid accounts: {len(paid_accounts)}')
    print(f'  Free accounts: {len(free_accounts)}')
    print(f'  Failed: {len(failed_accounts)}')
    print(f'{"="*60}\n')

    # Write paid accounts in email:password:plan format
    if paid_accounts:
        with open(OUTPUT_FILE, 'w') as f:
            for acc in paid_accounts:
                f.write(f"{acc['email']}:{acc['password']}:{acc['plan']}\n")
        print(f'✓ Paid accounts saved to: {OUTPUT_FILE}')
    else:
        print('✗ No paid accounts found')

    # Save detailed JSON results
    results_json = {
        'paid': paid_accounts,
        'free': free_accounts,
        'failed': failed_accounts,
        'summary': {
            'total_processed': total,
            'paid_count': len(paid_accounts),
            'free_count': len(free_accounts),
            'failed_count': len(failed_accounts)
        }
    }

    results_json_file = CONFIGS_DIR / 'extraction_results.json'
    with open(results_json_file, 'w') as f:
        json.dump(results_json, f, indent=2)
    print(f'✓ Detailed results saved to: {results_json_file}')

if __name__ == '__main__':
    main()
