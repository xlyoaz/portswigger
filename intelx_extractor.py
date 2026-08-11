#!/usr/bin/env python3
"""
Intelx DID Extractor - Extract portswigger.net entries
Read DIDs from file, query Intelx API, extract portswigger.net lines
Authorization: ROE-2026-PSW-042-V5
"""

import requests
import sys
from datetime import datetime

# Configuration
DIDS_FILE = "intelx_dids.txt"
OUTPUT_FILE = "portswigger_net_ulp.txt"
API_BASE = "http://31.210.36.109/intelx.php"
TIMEOUT = 30
SEARCH_TERM = "portswigger.net"

def read_dids(filename):
    """Read DIDs from file"""
    try:
        with open(filename, 'r') as f:
            dids = [line.strip() for line in f if line.strip()]
        return dids
    except FileNotFoundError:
        print(f"ERROR: File not found: {filename}")
        sys.exit(1)

def fetch_did_data(did, session):
    """Fetch data for a single DID"""
    try:
        url = f"{API_BASE}?id={did}"
        response = session.get(url, timeout=TIMEOUT)
        if response.status_code == 200:
            return response.text
        else:
            return None
    except Exception as e:
        print(f"  ERROR fetching {did}: {str(e)}")
        return None

def extract_portswigger_lines(text):
    """Extract lines containing portswigger.net"""
    lines = []
    if not text:
        return lines

    for line in text.split('\n'):
        if SEARCH_TERM in line:
            lines.append(line.strip())

    return lines

def main():
    print("[*] Intelx DID Extractor - portswigger.net Lines")
    print(f"[*] Input: {DIDS_FILE}")
    print(f"[*] Output: {OUTPUT_FILE}")
    print(f"[*] Search term: {SEARCH_TERM}")
    print("")

    # Read DIDs
    print("Step 1: Reading DIDs...")
    dids = read_dids(DIDS_FILE)
    print(f"✓ Loaded {len(dids)} DIDs")
    print("")

    # Initialize output file
    print("Step 2: Initializing output file...")
    with open(OUTPUT_FILE, 'w') as f:
        f.write(f"# Extracted portswigger.net entries from Intelx\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total DIDs processed: {len(dids)}\n")
        f.write(f"#\n")
    print(f"✓ Output file initialized: {OUTPUT_FILE}")
    print("")

    # Process DIDs
    print("Step 3: Processing DIDs...")
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    total_processed = 0
    total_found = 0
    failed = 0

    for idx, did in enumerate(dids, 1):
        sys.stdout.write(f"\r[{idx}/{len(dids)}] Processing DIDs... Found: {total_found}")
        sys.stdout.flush()

        # Fetch data
        data = fetch_did_data(did, session)

        if data is None:
            failed += 1
            continue

        total_processed += 1

        # Extract lines
        matching_lines = extract_portswigger_lines(data)

        if matching_lines:
            total_found += len(matching_lines)

            # Append to output file
            with open(OUTPUT_FILE, 'a') as f:
                f.write(f"\n# DID: {did}\n")
                for line in matching_lines:
                    f.write(f"{line}\n")

    print(f"\r[{len(dids)}/{len(dids)}] Processing DIDs... Found: {total_found}    ")
    print("")

    # Summary
    print("============================================================")
    print("EXTRACTION COMPLETE")
    print("============================================================")
    print(f"Total DIDs: {len(dids)}")
    print(f"Processed: {total_processed}")
    print(f"Failed: {failed}")
    print(f"Lines found with '{SEARCH_TERM}': {total_found}")
    print(f"Output: {OUTPUT_FILE}")
    print("============================================================")

if __name__ == "__main__":
    main()
