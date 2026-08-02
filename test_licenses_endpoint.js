#!/usr/bin/env node

/**
 * Extract subscription from the dedicated licenses endpoint
 * GET /users/youraccount/licenses after login
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

function parseResponse(output) {
    const parts = output.split('\r\n\r\n');
    let headers = parts[0];
    let body = parts.slice(1).join('\r\n\r\n');

    if (body && body.startsWith('HTTP/')) {
        const bodyParts = body.split('\r\n\r\n');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
    }

    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location };
}

function curl(url, post = null) {
    try {
        let cmd;
        const cookies = `-b "${COOKIE_JAR}" -c "${COOKIE_JAR}"`;

        if (post) {
            const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            cmd = `curl -s -i ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
                fs.unlinkSync(tempFile);
                return parseResponse(output);
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
            return parseResponse(output);
        }
    } catch (e) {
        console.error(`Error: ${e.message.substring(0, 80)}`);
        return { status: 0, body: '', location: null };
    }
}

console.log(`[*] Testing: ${username}\n`);

// Step 1: Get state
console.log('[1] Getting OAuth state');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';

if (!state) {
    console.error('[!] Failed to get state');
    process.exit(1);
}

// Step 2: Login with credentials
console.log('[2] Logging in with credentials');
r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
});

if (r.status !== 302) {
    console.error('[!] Login failed - no redirect');
    fs.writeFileSync('debug_login.html', r.body);
    process.exit(1);
}

// Step 3: Follow redirects to establish session
console.log('[3] Following OAuth redirects');
let url = r.location;
for (let i = 0; i < 5 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    if (url.includes('/signin-oidc')) break; // Stop before code exchange
    r = curl(url);
    url = r.location;
}

// Step 4: Fetch licenses endpoint
console.log('[4] Fetching licenses endpoint');
r = curl('https://portswigger.net/users/youraccount/licenses');
console.log(`    Status: ${r.status}`);
console.log(`    Body size: ${r.body.length} bytes`);

// Save response for inspection
fs.writeFileSync('debug_licenses.json', r.body);

// Step 5: Parse licenses response
console.log('[5] Parsing subscription data');

let plan = 'Unknown';
let subscription = 'None';
let expiry = null;

try {
    // Try parsing as JSON
    if (r.body.trim().startsWith('{') || r.body.trim().startsWith('[')) {
        const data = JSON.parse(r.body);
        console.log(`    [DEBUG] JSON response:`, JSON.stringify(data).substring(0, 200));

        if (data && typeof data === 'object') {
            // Check if it's an array or object
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    subscription = 'None';
                    plan = 'Free/Community';
                    console.log('    [✓] Empty licenses array - Free account');
                } else {
                    subscription = 'Active';
                    const license = data[0];
                    console.log(`    [DEBUG] First license:`, JSON.stringify(license).substring(0, 200));

                    // Extract plan type
                    if (license.type) plan = license.type;
                    if (license.productionType) plan = license.productionType;
                    if (license.tier) plan = license.tier;
                    if (license.plan) plan = license.plan;

                    // Extract expiry
                    if (license.expiryDate) expiry = license.expiryDate;
                    if (license.expiry) expiry = license.expiry;
                }
            } else if (data.licenses) {
                // Object with licenses property
                if (Array.isArray(data.licenses)) {
                    if (data.licenses.length === 0) {
                        subscription = 'None';
                        plan = 'Free/Community';
                    } else {
                        subscription = 'Active';
                        const license = data.licenses[0];
                        if (license.type) plan = license.type;
                        if (license.productionType) plan = license.productionType;
                        if (license.tier) plan = license.tier;
                        if (license.expiry) expiry = license.expiry;
                    }
                }
            }
        }
    } else {
        // Try parsing as HTML
        console.log('    [*] Response appears to be HTML, checking for text patterns');

        if (r.body.includes('You do not have any subscriptions')) {
            subscription = 'None';
            plan = 'Free/Community';
            console.log('    [✓] Found: "You do not have any subscriptions"');
        } else if (r.body.toLowerCase().includes('professional')) {
            plan = 'Professional';
            subscription = 'Active';
            console.log('    [✓] Found: Professional');
        } else if (r.body.toLowerCase().includes('enterprise')) {
            plan = 'Enterprise';
            subscription = 'Active';
            console.log('    [✓] Found: Enterprise');
        } else if (r.body.toLowerCase().includes('team')) {
            plan = 'Team';
            subscription = 'Active';
            console.log('    [✓] Found: Team');
        }
    }
} catch (e) {
    console.log(`    [!] Parse error: ${e.message}`);
}

console.log('\n' + '='.repeat(60));
console.log(`ACCOUNT: ${username}`);
console.log(`PLAN: ${plan}`);
console.log(`SUBSCRIPTION: ${subscription}`);
if (expiry) console.log(`EXPIRY: ${expiry}`);
console.log('='.repeat(60));

console.log('\nSaved licenses response to: debug_licenses.json\n');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
