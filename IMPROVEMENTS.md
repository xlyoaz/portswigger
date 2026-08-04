# Subscription Extraction Improvements

## What Changed

### extract_all_subscriptions_v2.js
Improved batch extraction script that properly handles OAuth/OIDC authentication flow to reliably extract subscription plans from all 217 test accounts.

#### Key Improvements Over v1:

1. **Better OAuth Flow Handling**
   - Follows all redirect chains after login before attempting form parsing
   - More robust redirect loop with proper URL normalization
   - Better fallback when form parsing fails (tries direct licenses access)

2. **Paid Account Filtering**
   - Tracks paid vs free accounts separately
   - Exports only paid accounts to `paid_accounts.txt` in log.txt format (email:password:plan)
   - Excludes "Free" and "Unknown" plans from paid accounts list

3. **Improved Error Handling**
   - Better error categorization and tracking
   - More informative error messages in results
   - Separate tracking of successful vs failed extractions

4. **Enhanced Exports**
   - `subscriptions_results.csv` - All results (217 accounts)
   - `subscriptions_results.json` - Detailed results with timestamps
   - `paid_accounts.txt` - Paid accounts only (email:password:plan format)
   - `subscriptions_summary.txt` - Summary statistics with plan distribution

### test_improved_oauth.js
Debug/test script for validating the OAuth flow with a single account.

#### Features:
- Step-by-step flow visualization
- Shows redirect chains and status codes
- Form detection and submission logging
- Saves HTML responses for inspection

## How to Use

### Basic Usage
```bash
node extract_all_subscriptions_v2.js
```

The script will:
1. Load 217 accounts from `log.txt`
2. Process accounts in batches of 3 concurrent requests
3. Extract subscription plans via OAuth flow
4. Generate results files (see above)

### Testing Single Account
```bash
node test_improved_oauth.js
```

Uses hardcoded test credentials: `y5571702@gmail.com:Xlyoaz60863131..`

## Expected Output

### On Success:
- Status 200 response from licenses page
- Subscription plan extracted (Free, Professional, Team, Enterprise, Community)
- Plan added to results and paid_accounts.txt (if not Free)

### Common Statuses:
- ✓ Success - Plan extracted successfully
- ✗ Failed: Status 302 - Session not authenticated (should be rare with v2)
- ✗ Failed: [error message] - Authentication or network error

## File Formats

### paid_accounts.txt (Log.txt Format)
```
email@example.com:password:Professional
email@example.com:password:Team
email@example.com:password:Enterprise
```

### subscriptions_results.csv
```csv
Username,Plan,Status,Timestamp
"email@example.com","Free","Success","2026-08-04T12:00:00.000Z"
```

### subscriptions_results.json
```json
[
  {
    "username": "email@example.com",
    "plan": "Free",
    "status": "Success",
    "timestamp": "2026-08-04T12:00:00.000Z"
  }
]
```

## Proxy Configuration

The script uses an HTTP proxy for requests:
- Proxy: `ankara8.buymobileproxy.com:8029`
- Auth: Included in the proxy URL
- Protocols: HTTP and HTTPS via proxy agents

## Plan Detection Logic

Plans are detected by keyword matching in the licenses page HTML:

- **Free**: "you do not have any subscriptions"
- **Enterprise**: "burp suite enterprise" or "enterprise subscription"
- **Team**: "burp suite team" or "team subscription"
- **Professional**: "burp suite professional" or "professional subscription"
- **Community**: "community"
- **Unknown**: No plan keywords found

## Performance

- Batch size: 3 concurrent requests
- Rate limiting: 500ms between batches
- Expected duration: ~30 minutes for 217 accounts (varies by network/proxy)
- Average: ~8-9 seconds per account

## Troubleshooting

### Proxy Connection Timeout
- Check proxy URL and credentials in the script
- Verify network connectivity to proxy server
- Try reducing concurrent requests (change CONCURRENT_REQUESTS)

### Status 302 Errors
- Should be rare with v2 (improved OAuth flow)
- If still occurring: form parsing may be failing
- Check test_improved_oauth.js output to debug

### Form Not Found
- Fallback logic attempts direct licenses access
- If still failing: OAuth flow may be incomplete
- Run test_improved_oauth.js to see detailed flow

## Statistics Summary

The `subscriptions_summary.txt` includes:
- Total accounts processed / success rate
- Plan distribution (count and percentage)
- Top 5 error types
- File locations

Example:
```
Total Accounts Processed: 217
Successful: 215 (99.1%)
Failed: 2 (0.9%)

PLAN DISTRIBUTION:
  Free:         85 (39.5% of successful)
  Professional: 95 (44.2% of successful)
  Team:         25 (11.6% of successful)
  Enterprise:   8 (3.7% of successful)
  Community:    2 (0.9% of successful)
  Unknown:      0 (0.0% of successful)

PAID ACCOUNTS: 130
```

## Version History

- **v2** (Current): Improved OAuth flow, paid account filtering
- **v1**: Original batch extraction with form parsing
