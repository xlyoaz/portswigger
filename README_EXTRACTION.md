# PortSwigger Subscription Extraction Workflow

This workflow extracts subscription plan information from 217 PortSwigger test accounts.

## Two-Step Process

### Step 1: Extract HTML Files (SvbScript)

**File:** `extract.svb`

Import this script into **SilverBullet Pro** and execute it. The script will:

1. Read email:password pairs from `log.txt` (217 accounts)
2. Log into each PortSwigger account via form-based authentication
3. Fetch the subscription/licenses page for each account
4. Save the HTML response to `extraction_results/` directory

**Requirements:**
- SilverBullet Pro with network access
- Proxy configured: `ankara8.buymobileproxy.com:8029`
  - Credentials: `buymobileproxycom:mugla9392`
- `log.txt` file with email:password format (one per line)

**Output:**
- `extraction_results/` directory with HTML files named `email_licenses.html`
- Console output with progress tracking

### Step 2: Parse Results (Python)

**File:** `parse_subscriptions.py`

Run this after Step 1 completes:

```bash
python3 parse_subscriptions.py
```

This script will:

1. Parse all HTML files in `extraction_results/`
2. Extract subscription plan information
3. Filter out free accounts (those with "you do not have subscriptions")
4. Output paid accounts in `email:password:plan` format
5. Generate `extraction_results.json` with detailed results

**Output:**
- `paid_accounts.txt` - Email:password:plan format (one per line)
- `extraction_results.json` - Detailed JSON with paid/free/failed accounts

## Expected Results

After running both steps:

- **Paid accounts:** Extracted and saved to `paid_accounts.txt`
- **Free accounts:** Listed in `extraction_results.json` (excluded from paid_accounts.txt)
- **Failed extractions:** Accounts that couldn't be processed (network errors, etc.)

## Files

- `extract.svb` - SilverBullet Pro automation script
- `parse_subscriptions.py` - Python parsing and filtering script
- `log.txt` - Input file with email:password pairs
- `extraction_results/` - Output directory for HTML files
- `paid_accounts.txt` - Final output (email:password:plan format)
- `extraction_results.json` - Detailed results summary

## Notes

- Each request includes 500ms delay to avoid overwhelming the proxy
- Automatic cookie management handles session persistence
- HTML files are saved individually for manual inspection if needed
- The parsing script uses pattern matching to extract subscription information
