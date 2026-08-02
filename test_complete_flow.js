#!/usr/bin/env node

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

    // Handle proxy wrapping: actual HTTP response in body
    if (body && body.startsWith('HTTP/')) {
        const bodyParts = body.split('\r\n\r\n');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
    }

    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location };
}

function curl(url) {
    const cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
    const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
    return parseResponse(output);
}

// STEP 1: Get state
console.log('[1] Getting state...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`State: ${state.substring(0, 30)}...`);
console.log(`Status: ${r.status}\n`);

// STEP 2: Login
console.log('[2] Logging in...');
const tempFile = path.join(os.tmpdir(), `login_${Date.now()}.txt`);
fs.writeFileSync(tempFile, `username=${username}&password=${password}&action=default&state=${state}`);
const loginCmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "https://login.portswigger.net/u/login"`;
const loginOutput = execSync(loginCmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
fs.unlinkSync(tempFile);
r = parseResponse(loginOutput);

console.log(`Status: ${r.status}`);
console.log(`Redirect: ${r.location?.substring(0, 60) || '(none)'}\n`);

// STEP 3: Follow redirects including /signin-oidc (complete OAuth flow)
console.log('[3] Following OAuth redirects (INCLUDING code exchange)...');
let url = r.location;
let redirectCount = 0;

while (url && redirectCount < 10) {
    redirectCount++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    console.log(`${redirectCount}. GET ${url.substring(0, 70)}`);
    r = curl(url);

    console.log(`   Status: ${r.status}, Next: ${r.location?.substring(0, 50) || '(end)'}`);

    // Stop when we reach portswigger.net (non-login)
    if (r.location && r.location.includes('portswigger.net') && !r.location.includes('login')) {
        console.log('   [✓] Reached portswigger.net - OAuth flow complete\n');
        break;
    }

    url = r.location;
}

// STEP 4: NOW try licenses page
console.log('[4] Fetching licenses page (AFTER complete OAuth)...');
r = curl('https://portswigger.net/users/youraccount/licenses');

console.log(`Status: ${r.status}`);
console.log(`Redirect to: ${r.location || '(none)'}\n`);

// If we got redirected to /users, follow it
if (r.status === 302 && r.location?.includes('/users?returnurl')) {
    console.log('[5] Following redirect to /users...');
    let usersUrl = r.location;
    if (!usersUrl.startsWith('http')) usersUrl = 'https://portswigger.net' + usersUrl;
    r = curl(usersUrl);

    console.log(`Status: ${r.status}`);
    console.log(`Redirect to: ${r.location || '(none)'}\n`);
}

// Check response
if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] SUCCESS - Got account page: FREE ACCOUNT');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] SUCCESS - Got subscriptions page');
} else if (r.status === 200) {
    console.log('[✓] Got 200 OK response');
    console.log('First 300 chars:');
    console.log(r.body.substring(0, 300));
} else if (r.status === 302) {
    console.log('[✗] FAILED - Still redirecting (not following further)');
    console.log(`Location: ${r.location}`);
} else {
    console.log(`[?] Status ${r.status}`);
    console.log('First 300 chars:');
    console.log(r.body.substring(0, 300));
}

fs.writeFileSync('debug_complete_flow.html', r.body);
console.log('\nFull response saved to: debug_complete_flow.html');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
