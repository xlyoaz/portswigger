#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

function curl(url) {
    const cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
    return execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
}

// STEP 1: Get state
console.log('[1] Getting state...');
let output = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = output.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`State: ${state.substring(0, 30)}...\n`);

// STEP 2: Login
console.log('[2] Logging in...');
const tempFile = path.join(os.tmpdir(), `login_${Date.now()}.txt`);
fs.writeFileSync(tempFile, `username=${username}&password=${password}&action=default&state=${state}`);
const loginCmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "https://login.portswigger.net/u/login"`;
output = execSync(loginCmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
fs.unlinkSync(tempFile);

let loginLocation = output.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
console.log(`Redirect: ${loginLocation?.substring(0, 60) || '(none)'}\n`);

// STEP 3: Follow redirects including /signin-oidc (complete OAuth flow)
console.log('[3] Following OAuth redirects (INCLUDING code exchange)...');
let url = loginLocation;
let redirectCount = 0;

while (url && redirectCount < 10) {
    redirectCount++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    console.log(`${redirectCount}. GET ${url.substring(0, 70)}`);
    output = curl(url);

    const status = output.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 'unknown';
    const location = output.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    console.log(`   Status: ${status}, Next: ${location?.substring(0, 50) || '(end)'}`);

    // Stop when we reach portswigger.net (non-login)
    if (location && location.includes('portswigger.net') && !location.includes('login')) {
        console.log('   [✓] Reached portswigger.net - OAuth flow complete\n');
        break;
    }

    url = location;
}

// STEP 4: NOW try licenses page
console.log('[4] Fetching licenses page (AFTER complete OAuth)...');
output = curl('https://portswigger.net/users/youraccount/licenses');

const licStatus = output.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 'unknown';
const licLocation = output.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();

console.log(`Status: ${licStatus}`);
console.log(`Redirect to: ${licLocation || '(none)'}\n`);

// Check response
const firstLine = output.substring(0, 500);
if (firstLine.includes('You do not have any subscriptions')) {
    console.log('[✓] SUCCESS - Got account page: FREE ACCOUNT');
} else if (firstLine.includes('Your Subscriptions')) {
    console.log('[✓] SUCCESS - Got subscriptions page');
} else if (licStatus === '200') {
    console.log('[✓] Got 200 OK response');
    console.log('First 300 chars:');
    console.log(firstLine.substring(0, 300));
} else if (licStatus === '302' && licLocation?.includes('/users?returnurl')) {
    console.log('[✗] FAILED - Still redirecting to login');
    console.log(`Location: ${licLocation}`);
} else {
    console.log(`[?] Status ${licStatus}`);
    console.log('First 300 chars:');
    console.log(firstLine.substring(0, 300));
}

fs.writeFileSync('debug_complete_flow.html', output);
console.log('\nFull response saved to: debug_complete_flow.html');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
