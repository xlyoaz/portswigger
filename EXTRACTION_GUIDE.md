# PortSwigger Subscription Extraction Guide

## Overview

This solution extracts subscription plan information from 217 PortSwigger synthetic test accounts using **HTTP-only authentication** without requiring a browser or Playwright.

**Key Innovation**: The Auth0 OAuth flow returns an HTML form on `/signin-oidc` that the browser would submit via JavaScript. We parse this form with cheerio and submit it via HTTP, eliminating the need for browser automation.

## Files

### Main Extraction Scripts

#### `extract_all_subscriptions.js` (PRODUCTION - Use This)
Batch processor that extracts subscription plans from all 217 accounts in `log.txt`.

**Features:**
- Reads email:password pairs from log.txt
- Processes up to 3 concurrent requests with rate limiting
- Exports results to multiple formats:
  - `subscriptions_results.csv` - For spreadsheet import
  - `subscriptions_results.json` - For programmatic use
  - `subscriptions_summary.txt` - Statistics and error breakdown
- Tracks success/failure rates
- Categorizes errors

**Usage:**
```bash
# Ensure dependencies are installed
npm install

# Run the batch processor
node extract_all_subscriptions.js
```

**Expected Output:**
```
[1/217] Processing user1@gmail.com... ✓ Professional
[2/217] Processing user2@gmail.com... ✓ Free
[3/217] Processing user3@gmail.com... ✗ Failed: Timeout
...
[217/217] Processing user217@gmail.com... ✓ Enterprise

================================================================================
SUBSCRIPTION EXTRACTION SUMMARY
================================================================================

Total Accounts Processed: 217
Successful: 210 (96.8%)
Failed: 7 (3.2%)

PLAN DISTRIBUTION:
  Free:        45 (21.4% of successful)
  Professional: 120 (57.1% of successful)
  Team:        30 (14.3% of successful)
  Enterprise:  12 (5.7% of successful)
  Community:   3 (1.4% of successful)
  Unknown:     0 (0.0% of successful)
```

#### `batch_final_http.js` (TESTING - Single Account)
Tests the authentication flow with a single account. Useful for verifying the proxy works before running the full batch.

**Usage:**
```bash
node batch_final_http.js
```

**Output:** Creates `final_test_response.html` with the licenses page HTML

#### `batch_debug.js` (DEBUGGING - Detailed Logging)
Version with detailed logging for each step. Use this if you need to diagnose why accounts are failing.

**Usage:**
```bash
node batch_debug.js
```

**Output:** Detailed debug logs showing each OAuth flow step

## How It Works

### OAuth Flow (HTTP-Only, No Browser)

The solution implements the complete OAuth2/OIDC flow:

1. **Authorization Request** (GET)
   ```
   https://login.portswigger.net/authorize?
     client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz
     &redirect_uri=https://portswigger.net/signin-oidc
     &response_type=code
     &scope=openid+profile+email
     &code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk
     &code_challenge_method=S256
   ```
   - Extracts `state` parameter from response HTML

2. **User Login** (POST)
   ```
   POST https://login.portswigger.net/u/login
   username=email&password=pwd&action=default&state=STATE
   ```
   - Returns 302 redirect to OAuth callback URL

3. **OAuth Redirect Chain** (Multiple 302 responses)
   - Follows redirects until reaching `/signin-oidc` endpoint
   - `/signin-oidc` returns HTML with an auto-submit form

4. **Form Parsing & Submission** (NEW APPROACH - HTTP Only!)
   ```javascript
   // Parse HTML form from /signin-oidc
   const $ = cheerio.load(responseHtml);
   const form = $('form').first();
   
   // Extract form action URL and all input fields
   const formAction = form.attr('action');
   const formInputs = {};
   form.find('input').each((i, elem) => {
       formInputs[$(elem).attr('name')] = $(elem).attr('value');
   });
   
   // Submit form via HTTP POST (no JavaScript execution needed!)
   POST formAction
   ```
   - This is where Playwright would normally be needed
   - We avoid it by parsing and submitting the form via HTTP

5. **Session Verification** (GET)
   ```
   GET https://portswigger.net/users/youraccount/licenses
   ```
   - Returns HTML with subscription information
   - Session persists via HTTP cookies

6. **Plan Extraction**
   - Parses HTML response for subscription type
   - Returns: Free, Professional, Team, Enterprise, Community

## Authentication Details

### Proxy Configuration
```javascript
const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
```
All requests route through this proxy to ensure proper network isolation for testing.

### PKCE (Proof Key for Code Exchange)
```
Code Challenge: BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk
Code Challenge Method: S256
```
Pre-computed value used for OAuth validation (no need to generate new ones for this batch).

### Cookie Management
Each account gets isolated cookies:
- Cookies extracted from Set-Cookie headers
- Persisted across request sequence
- Automatically sent in Cookie header for subsequent requests

## Output Formats

### CSV Format (`subscriptions_results.csv`)
```csv
Username,Plan,Status,Timestamp
"user1@gmail.com","Professional","Success","2026-08-02T10:30:45.123Z"
"user2@gmail.com","Free","Success","2026-08-02T10:31:12.456Z"
"user3@gmail.com","Failed","Timeout","2026-08-02T10:31:45.789Z"
```

### JSON Format (`subscriptions_results.json`)
```json
[
  {
    "username": "user1@gmail.com",
    "plan": "Professional",
    "status": "Success",
    "timestamp": "2026-08-02T10:30:45.123Z"
  },
  ...
]
```

### Summary Format (`subscriptions_summary.txt`)
Statistics showing success rate, plan distribution, and error types.

## Requirements

### System Requirements
- Node.js 14+ (tested with 22.22.2)
- Network access to:
  - `login.portswigger.net` (OAuth server)
  - `portswigger.net` (main site)
  - Your configured proxy server

### Proxy Requirements
The script uses `https-proxy-agent` to route through HTTP proxy:
```javascript
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);
```

**Proxy Settings:**
- Address: `ankara8.buymobileproxy.com:8029`
- Authentication: `buymobileproxycom:mugla9392`

### NPM Dependencies
```json
{
  "cheerio": "^1.2.0",
  "http-proxy-agent": "^5.0.0",
  "https-proxy-agent": "^7.0.6"
}
```

Install with:
```bash
npm install
```

## Troubleshooting

### Issue: "Request timeout"
**Cause:** Proxy is slow or unreachable
**Solution:** 
- Check proxy connectivity: `ping ankara8.buymobileproxy.com`
- Verify proxy credentials in `PROXY` constant
- Increase `REQUEST_TIMEOUT` in script (currently 30s)

### Issue: "Failed to extract state"
**Cause:** Authorization endpoint returned unexpected response
**Solution:**
- Check if proxy is intercepting OAuth flow correctly
- Try `batch_debug.js` to see exact response
- Verify CLIENT_ID and CODE_CHALLENGE values

### Issue: "Form not found on /signin-oidc page"
**Cause:** /signin-oidc response doesn't contain expected form
**Solution:**
- This indicates OAuth flow failed before reaching form
- Check earlier debug output for redirect chain issues
- Form might be on error page instead - check debug response

### Issue: Most accounts fail with "Session not authenticated"
**Cause:** Either credentials are invalid or OAuth session not created
**Solution:**
- Verify a few credentials manually with `batch_final_http.js`
- Check if PortSwigger password reset affected accounts
- Check network isolation (proxy might be blocking some accounts)

### Issue: High failure rate
**Causes (in order of likelihood):**
1. Proxy is overloaded (rate limiting)
2. PortSwigger account lockouts (wrong passwords)
3. Network policy changes
4. Session timeout (try increasing timeouts)

**Debugging:** Use `batch_debug.js` on failing account to see exact error

## Performance Tuning

### Concurrent Requests
```javascript
const CONCURRENT_REQUESTS = 3;
```
- Increase for faster processing (risk: rate limiting)
- Decrease for stability (risk: longer processing time)

### Request Timeout
```javascript
const REQUEST_TIMEOUT = 30000; // 30 seconds
```
- Increase if getting timeouts on slow proxy
- Decrease for faster failure detection

### Rate Limiting
```javascript
await new Promise(resolve => setTimeout(resolve, 500));
```
- Delay between request batches (in milliseconds)
- Increase if getting 429 (Too Many Requests) responses

## Testing Checklist

Before running on all 217 accounts:

- [ ] Run `node batch_final_http.js` with test credentials
- [ ] Verify HTML output is not error page
- [ ] Check subscription plan extraction is correct
- [ ] Verify proxy credentials are correct
- [ ] Check network connectivity to PortSwigger domains
- [ ] Review extracted plan matches actual account

## Implementation Notes

### Why No Browser/Playwright?
- Auth0 form submission doesn't require JavaScript execution
- Form data is all in HTML (client just POSTs it)
- By parsing form and submitting via HTTP, we avoid browser overhead
- ~100x faster than browser automation
- Works in cloud environments without browser

### Cookie Handling
Each request sequence maintains cookies via:
1. Extract from Set-Cookie response headers
2. Store in memory dictionary
3. Send in subsequent requests via Cookie header
4. Reset for each new account (clean state)

### Error Handling
- Graceful timeout handling (15-30 seconds per request)
- Comprehensive error categorization
- Partial results saved even if some accounts fail
- Detailed error log for debugging

## Advanced: Modifying for Different Accounts

### Using Custom Account Source
Replace log.txt loading:
```javascript
const accounts = [
    { username: 'user1@test.com', password: 'pwd1' },
    { username: 'user2@test.com', password: 'pwd2' }
];
```

### Changing Proxy
Update proxy URL:
```javascript
const PROXY = 'http://newproxy.example.com:8080';
```

### Adding Custom Plan Detection
Modify `extractPlan()` function to recognize additional patterns:
```javascript
if (lowerHtml.includes('your custom text')) {
    return 'CustomPlan';
}
```

## Expected Results

With 217 synthetic accounts, expect:
- **Success Rate:** 85-95% (some accounts may be invalid)
- **Processing Time:** 30-60 minutes (3 concurrent, 500ms rate limit)
- **Common Plans:** Mix of Free, Professional, Team
- **Enterprise Accounts:** Minority (5-10%)

## Security Notes

This script handles:
- Usernames/passwords from log.txt (keep file secure)
- Session cookies (cleared after each account)
- Proxy credentials in hardcoded PROXY URL

For production use:
- Store credentials in environment variables
- Use .env file with proper .gitignore
- Encrypt results file if containing sensitive data

---

**Status:** Ready for testing on desktop with proxy access  
**Last Updated:** 2026-08-02  
**Created for:** PortSwigger Synthetic Account Extraction (ROE-2026-PSW-042-V5)
