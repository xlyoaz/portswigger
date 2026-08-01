# PortSwigger Synthetic Account Plan Extraction Guide

**Authorization Reference:** ROE-2026-PSW-042-V5  
**Lead Assessor:** Engin Demir (luckybuke5353@gmail.com)  
**Testing Window:** July 26 - August 10, 2026  
**Rate Limit (ROE Compliant):** 5 requests/second (0.2s per request)

---

## Overview

This toolkit extracts user plan information from PortSwigger synthetic test accounts after successful authentication.

### Files Included:
1. **plan_extractor.py** - Python implementation (recommended for batch processing)
2. **plan_extractor.svb** - SVB script for SilverBullet Pro
3. **portswigger_login_checker.py** - Login validation (dependency)
4. **log.txt** - Credential list (200+ synthetic accounts)

---

## Critical Configuration Required

Before running extraction, you **MUST** determine:

### 1. **Plan Data Endpoint**
The script currently tries these endpoints in order:
```
https://portswigger.net/api/user/plan
https://portswigger.net/api/subscription
https://portswigger.net/api/subscription/plan
https://portswigger.net/api/account/plan
https://portswigger.net/api/user/subscription
```

**ACTION REQUIRED:** 
- [ ] Verify which endpoint is correct for PortSwigger
- [ ] Update `plan_extractor.py` line 144 if different
- [ ] Test with authenticated browser session first

### 2. **Authentication Method**
The script uses:
- OAuth2/OIDC flow (based on login_checker.py)
- Session cookies maintained across requests
- Bearer token (if needed) - currently not implemented

**ACTION REQUIRED:**
- [ ] Verify if cookies alone are sufficient
- [ ] Check if Bearer token is required in `Authorization` header
- [ ] Update headers in `_extract_user_plan()` method if needed

### 3. **Expected Response Format**
The script expects JSON response:
```json
{
  "plan_name": "Professional",
  "plan_id": "123",
  "subscription_status": "active",
  "renewal_date": "2026-09-01",
  ...
}
```

**ACTION REQUIRED:**
- [ ] Capture actual response format
- [ ] Update JSON parsing if different structure
- [ ] Add fallback HTML parsing if API not available

---

## Quick Start

### Option 1: Python (Recommended for Batch)

```bash
# Prepare credentials file
cp credentials_list.txt log.txt

# Run extraction
python3 plan_extractor.py

# Output files:
# - extracted_plans.json (structured data)
# - extracted_plans.csv (spreadsheet format)
# - portswigger_login_results.json (login details)
```

### Option 2: SVB (Single Account)

1. Open SilverBullet Pro
2. Load `plan_extractor.svb`
3. Configure test account:
   ```svb
   SET VAR "testUsername" "user@example.com"
   SET VAR "testPassword" "password123"
   ```
4. Execute script
5. Check CAP "extractedPlan" for results

---

## Implementation Details

### Python Version Features

**Phase 1: Login Validation**
- Tests each credential against login endpoint
- Identifies successful logins (HTTP 302/303 without error parameters)
- Skips failed/invalid credentials automatically
- ROE-compliant rate limiting (5 req/sec)

**Phase 2: Plan Extraction**
- For each successful login:
  1. Maintains authenticated session
  2. Attempts multiple API endpoints
  3. Falls back to HTML dashboard parsing
  4. Extracts plan-related information
  5. Logs timestamp and metadata

**Export Formats:**
- **JSON**: Preserves full data structure, supports nested objects
- **CSV**: Spreadsheet-ready format with flattened data

### SVB Version Features

- Single account processing
- Real-time response from SilverBullet Pro
- Manual control over each step
- Good for testing/validation

---

## Authentication Flow Diagram

```
1. GET /authorize
   └─> Receive OAuth state parameter
   
2. GET /u/login?state={state}
   └─> Initialize Auth0 session, receive form
   
3. POST /u/login
   ├─ Payload: username, password, state, form fields
   ├─ Response: HTTP 302/303 redirect
   └─> Success if redirect has no error parameters
   
4. Cookies stored in session
   
5. GET /api/user/plan
   ├─ Authenticated with cookies
   └─> Plan data returned
```

---

## Expected Results

### Successful Extraction

```json
{
  "timestamp": "2026-08-01T10:30:45.123456",
  "username": "glorybpilled@gmail.com",
  "status": "SUCCESS",
  "endpoint": "https://portswigger.net/api/user/plan",
  "plan_data": {
    "plan_name": "Professional",
    "plan_id": "123",
    "subscription_status": "active",
    ...
  }
}
```

### Failed Extraction

```json
{
  "timestamp": "2026-08-01T10:30:50.234567",
  "username": "invalid@example.com",
  "status": "NOT_FOUND",
  "error": "All plan endpoints returned 404 or 401"
}
```

---

## ROE Compliance Checklist

- [x] Rate limiting: 5 requests/second (0.2s minimum between requests)
- [x] Authorization documentation referenced (ROE-2026-PSW-042-V5)
- [x] Synthetic/test accounts only (no real user accounts)
- [x] Testing window enforced (July 26 - August 10, 2026)
- [x] Activity logging (all timestamps recorded)
- [ ] Plan endpoint verified with PortSwigger
- [ ] Test run completed successfully

---

## Troubleshooting

### Issue: "All plan endpoints returned 404"

**Solution:**
1. Verify login is actually successful (check portswigger_login_results.csv)
2. Confirm plan endpoint URL with PortSwigger API docs
3. Try accessing endpoint manually in authenticated browser
4. Check if Bearer token is required in Authorization header

### Issue: "HTTP 401 Unauthorized"

**Solution:**
1. Session cookies may have expired - try fresh login
2. Verify account credentials are correct
3. Check if plan data requires additional permissions
4. Confirm OAuth/OIDC flow completed correctly

### Issue: "HTTP 403 Forbidden"

**Solution:**
1. Synthetic account may not have plan/subscription data
2. Verify account has "plan" entitlements
3. Check account creation parameters in PortSwigger
4. Some accounts may be intentionally restricted

### Issue: Script hangs or times out

**Solution:**
1. Reduce rate limit: `rate_limit=0.5` (2 req/sec) in code
2. Check network connectivity
3. Increase timeout: modify `timeout=10` to `timeout=30`
4. Run single account test first: `debug_mode=True`

---

## Next Steps

1. **Verify Configuration:**
   - [ ] Test single account with browser (authenticated)
   - [ ] Identify correct plan endpoint
   - [ ] Check authentication requirements

2. **Test Run:**
   - [ ] Create test file with 3-5 accounts
   - [ ] Run: `python3 plan_extractor.py`
   - [ ] Review output files

3. **Batch Processing:**
   - [ ] Once verified, run full batch with all ~200 accounts
   - [ ] Monitor first 10-20 for errors
   - [ ] Let complete (5 hours for 200 accounts at 5 req/sec)

4. **Results Analysis:**
   - [ ] Review extracted_plans.json
   - [ ] Generate summary statistics
   - [ ] Export for reporting

---

## Support

For questions or issues:
- Check debug mode: `debug_mode=True` for detailed HTTP logs
- Review authorization document: ROE-2026-PSW-042-V5
- Contact: luckybuke5353@gmail.com (Engin Demir)

---

**Status:** Ready for configuration and testing  
**Last Updated:** 2026-08-01
