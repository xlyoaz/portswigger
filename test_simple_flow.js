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
    const cookieFlags = `-b "${COOKIE_JAR}" -c "${COOKIE_JAR}"`;
    let cmd;

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
            throw e;
        }
    } else {
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
        return parseResponse(output);
    }
}

console.log('='.repeat(60));
console.log('STEP 1: Get state');
console.log('='.repeat(60));
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
console.log(`Status: ${r.status}`);

let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`State: ${state.substring(0, 30)}...\n`);

console.log('='.repeat(60));
console.log('STEP 2: Login');
console.log('='.repeat(60));
r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
});
console.log(`Status: ${r.status}`);
console.log(`Location: ${r.location?.substring(0, 80) || '(none)'}\n`);

console.log('='.repeat(60));
console.log('STEP 3: Follow OAuth chain (max 5 redirects)');
console.log('='.repeat(60));
let url = r.location;
for (let i = 0; i < 5 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    if (url.includes('/signin-oidc')) {
        console.log(`[STOP] Would go to code exchange`);
        break;
    }
    console.log(`${i+1}. GET ${url.substring(0, 70)}`);
    r = curl(url);
    console.log(`   Status: ${r.status}`);
    url = r.location;
    if (r.location) console.log(`   Location: ${r.location.substring(0, 60)}`);
}

console.log('\n' + '='.repeat(60));
console.log('STEP 4: Fetch licenses page');
console.log('='.repeat(60));
console.log(`GET https://portswigger.net/users/youraccount/licenses`);
r = curl('https://portswigger.net/users/youraccount/licenses');
console.log(`Status: ${r.status}`);
console.log(`Body size: ${r.body.length} bytes`);
console.log(`First 150 chars:\n${r.body.substring(0, 150)}\n`);

// Check what page we got
if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] FREE ACCOUNT - No subscriptions found');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] ACCOUNT PAGE - Subscriptions section found');
} else if (r.body.includes('Trusted by')) {
    console.log('[✗] WRONG PAGE - Got homepage instead of account page!');
} else if (r.body.includes('<!DOCTYPE')) {
    console.log('[✗] WRONG PAGE - Got some HTML, not account page');
} else {
    console.log('[?] UNKNOWN RESPONSE');
}

// Save full response
fs.writeFileSync('debug_licenses_response.html', r.body);
console.log('\nFull response saved to: debug_licenses_response.html');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
