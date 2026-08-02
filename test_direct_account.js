#!/usr/bin/env node

/**
 * Test direct account page fetch after login
 * Skips OAuth code exchange, uses session cookies instead
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

    // Handle proxy wrapping
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
console.log('[1] Getting state from authorize endpoint');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`    State: ${state.substring(0, 30)}...`);

if (!state) {
    console.error('[!] Failed to get state');
    process.exit(1);
}

// Step 2: Login
console.log('\n[2] Logging in');
r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
});
console.log(`    Status: ${r.status}`);
console.log(`    Location: ${r.location?.substring(0, 60) || '(none)'}`);

// Step 3: Follow OAuth redirects but don't go to signin-oidc
console.log('\n[3] Following OAuth redirects');
let url = r.location;
let redirectCount = 0;
while (url && redirectCount < 15) {
    redirectCount++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    // Stop before signin-oidc since that requires code exchange
    if (url.includes('/signin-oidc')) {
        console.log(`    [*] Would redirect to code exchange (${redirectCount}): ${url.substring(0, 60)}`);
        break;
    }

    console.log(`    Redirect ${redirectCount}: ${url.substring(0, 60)}`);
    r = curl(url);
    console.log(`        Status: ${r.status}`);
    url = r.location;
}

console.log('\n[4] Fetching account page directly (using login session cookies)');
r = curl('https://portswigger.net/#/my-account');
console.log(`    Page size: ${r.body.length} bytes`);

if (r.body.length > 500) {
    console.log('    [✓] Got full page response');
} else {
    console.log('    [!] Small response, might be error');
}

// Check for plan keywords
let plan = 'Unknown';
if (r.body.includes('You do not have any subscriptions')) {
    plan = 'Free/Community';
    console.log('    [✓] Found: "You do not have any subscriptions"');
} else {
    if (r.body.toLowerCase().includes('enterprise')) {
        plan = 'Enterprise';
        console.log('    [✓] Found: Enterprise');
    } else if (r.body.toLowerCase().includes('team')) {
        plan = 'Team';
        console.log('    [✓] Found: Team');
    } else if (r.body.toLowerCase().includes('professional')) {
        plan = 'Professional';
        console.log('    [✓] Found: Professional');
    } else if (r.body.toLowerCase().includes('community')) {
        plan = 'Community';
        console.log('    [✓] Found: Community');
    } else {
        console.log('    [?] Plan keywords not found');
    }
}

console.log('\n' + '='.repeat(60));
console.log(`RESULT: ${username} = ${plan}`);
console.log('='.repeat(60));

// Save response
fs.writeFileSync('debug_account.html', r.body);
console.log('\nSaved response to: debug_account.html\n');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
