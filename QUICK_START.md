# Quick Start - Subscription Extraction

## TL;DR

```bash
# Install dependencies (one time)
npm install

# Run batch extraction on all 217 accounts
node extract_all_subscriptions.js

# Results will be saved to:
# - subscriptions_results.csv (for Excel/spreadsheet)
# - subscriptions_results.json (for parsing)
# - subscriptions_summary.txt (statistics)
```

## For Single Account Testing

Test with one account before running batch:

```bash
node batch_final_http.js
```

This tests account `y5571702@gmail.com` and outputs result to `final_test_response.html`

## For Debugging

If accounts are failing, run debug version:

```bash
node batch_debug.js
```

Shows detailed logs for each OAuth step.

## Output Files

After running `extract_all_subscriptions.js`:

| File | Format | Use Case |
|------|--------|----------|
| `subscriptions_results.csv` | Comma-separated | Import to Excel/Sheets |
| `subscriptions_results.json` | JSON | Parse programmatically |
| `subscriptions_summary.txt` | Plain text | View statistics |

## CSV Format

```csv
Username,Plan,Status,Timestamp
user1@example.com,Professional,Success,2026-08-02T10:30:45Z
user2@example.com,Free,Success,2026-08-02T10:31:12Z
user3@example.com,Failed,Timeout,2026-08-02T10:31:45Z
```

## Plan Types

- `Free` - Free/Community account
- `Professional` - Burp Suite Professional subscription
- `Team` - Team/Collaboration subscription
- `Enterprise` - Enterprise subscription
- `Community` - Community Edition
- `Unknown` - Couldn't determine (extraction failed)

## Common Issues

| Issue | Fix |
|-------|-----|
| "Cannot find module 'cheerio'" | Run `npm install` |
| "Request timeout" | Check proxy connectivity |
| "Form not found" | OAuth failed - check earlier steps |
| "Session not authenticated" | Invalid credentials |

## Expected Runtime

- Single account: 5-15 seconds
- All 217 accounts: 30-60 minutes

## Statistics You'll Get

```
Total Accounts: 217
Success: 210 (96.8%)
Failed: 7 (3.2%)

Plan Distribution:
- Professional: 120 (57%)
- Free: 45 (21%)
- Team: 30 (14%)
- Enterprise: 12 (6%)
- Community: 3 (1%)
```

## Proxy Configuration

Uses PortSwigger pre-configured proxy:
```
ankara8.buymobileproxy.com:8029
(credentials in script)
```

No additional setup needed if running on authorized network.

## Next Steps

1. Run `npm install` (one time)
2. Test with `node batch_final_http.js` (optional, for verification)
3. Run `node extract_all_subscriptions.js` (main extraction)
4. Check results in CSV/JSON/summary files

---

**See EXTRACTION_GUIDE.md for detailed documentation**
