#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

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
    const setCookie = headers.match(/[Ss]et-[Cc]ookie:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location, setCookie, headers };
}

function curl(url, post = null, cookieJar = null) {
    let cmd;
    const cookieFlags = cookieJar ? `-b "${cookieJar}" -c "${cookieJar}"` : '';

    if (post) {
        const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
        const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
        fs.writeFileSync(tempFile, data);
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            fs.unlinkSync(tempFile);
            return parseResponse(output);
        } catch (e) {
            try { fs.unlinkSync(tempFile); } catch {}
            return { status: 0, body: '', location: null, error: `POST ${url}: ${e.message}` };
        }
    } else {
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        } catch (e) {
            return { status: 0, body: '', location: null, error: `GET ${url}: ${e.message}` };
        }
    }
}

console.log('='.repeat(70));
console.log('DEBUG: Testing login flow');
console.log('='.repeat(70));

const cookieJar = path.join(os.tmpdir(), `debug_${Date.now()}.txt`);

try {

// STEP 1: Get state
console.log('\n[1] Getting state from authorize endpoint...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query', null, cookieJar);

console.log(`Status: ${r.status}`);
console.log(`Set-Cookie: ${r.setCookie ? r.setCookie.substring(0, 60) : '(none)'}`);

let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`State extracted: ${state.substring(0, 30)}...`);

if (!state) {
    console.log('[ERROR] No state found!');
    process.exit(1);
}

// STEP 2: Login with credentials
console.log('\n[2] Posting credentials to login endpoint...');
console.log(`Username: ${username}`);
console.log(`Password: ${password.substring(0, 5)}...`);
console.log(`State: ${state.substring(0, 30)}...`);

r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
}, cookieJar);

console.log(`\nResponse Status: ${r.status}`);
console.log(`Set-Cookie: ${r.setCookie ? r.setCookie.substring(0, 60) : '(none)'}`);
console.log(`Location: ${r.location || '(none)'}`);

// Show response body preview
console.log('\nResponse body (first 500 chars):');
console.log(JSON.stringify(r.body.substring(0, 500)));

// Check for errors in response
if (r.body.includes('Invalid username or password')) {
    console.log('\n[ERROR] Server says: Invalid username or password');
}

if (r.body.includes('too many login attempts')) {
    console.log('\n[ERROR] Server says: Too many login attempts');
}

if (r.body.includes('Cloudflare') || r.body.includes('403')) {
    console.log('\n[ERROR] Got Cloudflare or 403 response');
}

// Show full headers if status is unexpected
if (r.status !== 302) {
    console.log('\n[!] Unexpected status (expected 302)!');
    console.log('\nResponse headers:');
    console.log(r.headers.split('\r\n').slice(0, 20).join('\n'));
}

// Save full response for inspection
fs.writeFileSync('debug_login_response.html', r.body);
console.log('\nFull response saved to: debug_login_response.html');

// STEP 3: Follow OAuth redirects
console.log('\n[3] Following OAuth redirect chain...');
let url = r.location;
let redirectCount = 0;

while (url && redirectCount < 10) {
    redirectCount++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    console.log(`\n   ${redirectCount}. GET ${url.substring(0, 70)}`);
    console.log(`      [Sending request...]`);
    r = curl(url, null, cookieJar);

    console.log(`      Status: ${r.status}`);
    console.log(`      Location: ${r.location?.substring(0, 60) || '(none)'}`);
    console.log(`      Set-Cookie: ${r.setCookie ? r.setCookie.substring(0, 50) : '(none)'}`);

    if (r.status === 0) {
        console.log(`      [ERROR] ${r.error}`);
        break;
    }

    // Stop when we reach portswigger.net (non-login)
    if (r.location && r.location.includes('portswigger.net') && !r.location.includes('login')) {
        console.log('      [✓] Reached portswigger.net');
        break;
    }

    url = r.location;
}

// STEP 4: Try licenses page
console.log('\n[4] Fetching licenses page...');
r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);

console.log(`Status: ${r.status}`);
console.log(`Location: ${r.location || '(none)'}`);
console.log(`Set-Cookie: ${r.setCookie ? r.setCookie.substring(0, 50) : '(none)'}`);
console.log(`Body length: ${r.body.length} bytes`);

if (r.status === 0) {
    console.log(`[ERROR] Request failed: ${r.error}`);
} else if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] Got free account page');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] Got subscriptions page');
} else {
    console.log('[?] Got different page');
    console.log('First 300 chars:', JSON.stringify(r.body.substring(0, 300)));
}

fs.writeFileSync('debug_licenses_response.html', r.body);
console.log('\nFull licenses response saved to: debug_licenses_response.html');

} catch (e) {
    console.error('\n' + '='.repeat(70));
    console.error('[FATAL ERROR]');
    console.error('='.repeat(70));
    console.error(e.message);
    console.error('\nStack:');
    console.error(e.stack);
}

try { fs.unlinkSync(cookieJar); } catch {}
