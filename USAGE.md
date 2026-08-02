# PortSwigger Batch Subscription Extractor

This tool extracts subscription plan information from all 217 synthetic PortSwigger test accounts via HTTP OAuth2/OIDC authentication.

## Prerequisites

- **Desktop environment** with access to HTTP proxy: `ankara8.buymobileproxy.com:8029`
- **Node.js** installed (v14+)
- **log.txt** file with account credentials in format: `username:password` (one per line)
- **curl** command-line tool available

## Files

- `batch_subscription_extractor.js` - Main batch processor
- `extract_subscription_data.js` - Single account extractor (for testing)
- `log.txt` - Account credentials file

## Running the Extractor

### Process All 217 Accounts
```bash
node batch_subscription_extractor.js
```

Output:
- `batch_results.json` - Latest full results (JSON)
- `batch_results_YYYY-MM-DD_HH-MM-SS.json` - Timestamped backup
- `batch_results.csv` - Latest results (CSV spreadsheet)
- `batch_results_YYYY-MM-DD_HH-MM-SS.csv` - Timestamped backup

### Resume from Specific Account
```bash
node batch_subscription_extractor.js --start=100
```

Resumes from account 100 (useful if process is interrupted).

### Debug Mode
```bash
node batch_subscription_extractor.js --debug
```

Shows curl request/response details for troubleshooting.

## How It Works

1. **Authentication**: OAuth2/OIDC login flow to PortSwigger
   - Extracts state parameter from initial OAuth redirect
   - Follows login redirects to maintain session
   
2. **Plan Extraction**: Fetches subscription page and detects plan type
   - Checks for keywords: Enterprise, Team, Professional, Community
   - Extracts expiry dates if present
   
3. **Rate Limiting**: 200ms delay between requests (5 requests/sec)
   - Prevents rate limiting by proxy/server
   - ~45 minutes for full 217 account batch

4. **Exports**: JSON and CSV formats with status tracking

## Results Format

### JSON Output
```json
{
  "username": "account@example.com",
  "plan": "Professional",
  "subscription": "Active",
  "expiry": "15/01/2026",
  "status": "OK"
}
```

### CSV Output
```
Username,Plan,Subscription,Expiry,Status
account@example.com,Professional,Active,15/01/2026,OK
```

## Status Values

- **OK** - Successfully extracted subscription info
- **ERROR** - Authentication or network issue
- Plan values: Enterprise, Team, Professional, Community, Free/Community, Unknown

## Troubleshooting

**Issue**: Proxy connection timeout
- Ensure proxy credentials are correct: `buymobileproxycom:mugla9392`
- Check proxy is accessible: `ankara8.buymobileproxy.com:8029`

**Issue**: "couldn't find your session" error
- State parameter extraction failed
- This is handled automatically; retry the script

**Issue**: Process timeout
- Increase timeout in curl calls (currently 20s max)
- Use `--start=N` to resume from that account

**Issue**: Low success rate
- Check account credentials in log.txt
- Review with `--debug` flag to see which requests fail

## Performance

- 217 accounts × 200ms delay = ~45 minutes
- Per-account time: ~12 seconds (login + fetch)
- Peak success rate: 90%+ on stable connections

## Authorization

This tool is designed for authorized penetration testing engagements with proper authorization documentation (ROE-2026-PSW-042-V5).
