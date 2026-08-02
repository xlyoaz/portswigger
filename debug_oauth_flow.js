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

    if (body && body.startsWith('HTTP/')) {
        const bodyParts = body.split('\r\n\r\n');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
    }

    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    const setCookie = headers.match(/[Ss]et-[Cc]ookie:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location, setCookie };
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
console.log('FULL OAUTH FLOW TEST');
console.log('='.repeat(70));

const cookieJar = path.join(os.tmpdir(), `oauth_${Date.now()}.txt`);

// STEP 1
console.log('\n[STEP 1] Get authorize state');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query', null, cookieJar);
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`  Status: ${r.status}, State: ${state.substring(0, 25)}...`);

// STEP 2
console.log('\n[STEP 2] Login with credentials');
r = curl('https://login.portswigger.net/u/login', { username, password, action: 'default', state }, cookieJar);
console.log(`  Status: ${r.status}, Redirect: ${r.location?.substring(0, 60) || 'none'}`);

// STEP 3: Follow all redirects
console.log('\n[STEP 3] Follow OAuth redirect chain');
let url = r.location;
let step = 0;
while (url && step < 10) {
    step++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    r = curl(url, null, cookieJar);
    console.log(`  [3.${step}] GET ${url.substring(0, 65)}`);
    console.log(`        Status: ${r.status}, Redirect: ${r.location?.substring(0, 50) || 'none'}`);

    if (r.status !== 302 || !r.location) break;
    url = r.location;
}

// STEP 4
console.log('\n[STEP 4] Fetch /users/youraccount/licenses');
r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);
console.log(`  Status: ${r.status}`);
console.log(`  Location: ${r.location || 'none'}`);
console.log(`  Body length: ${r.body.length} bytes`);

if (r.status === 302 && r.location?.includes('/users?returnurl')) {
    console.log('\n[STEP 5] Follow /users redirect');
    let usersUrl = r.location;
    if (!usersUrl.startsWith('http')) usersUrl = 'https://portswigger.net' + usersUrl;

    r = curl(usersUrl, null, cookieJar);
    console.log(`  Status: ${r.status}`);
    console.log(`  Location: ${r.location || 'none'}`);
    console.log(`  Body length: ${r.body.length} bytes`);
}

// Check result
console.log('\n' + '='.repeat(70));
console.log('RESULT');
console.log('='.repeat(70));
if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] Got account page - FREE ACCOUNT');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] Got subscriptions page');
} else if (r.status === 200) {
    console.log('[?] Got 200 response but not recognized');
    console.log('First 200 chars:', JSON.stringify(r.body.substring(0, 200)));
} else {
    console.log(`[✗] Status ${r.status}, got ${r.body.length} bytes`);
}

fs.writeFileSync('oauth_response.html', r.body);
console.log('\nFull response saved to: oauth_response.html');

try { fs.unlinkSync(cookieJar); } catch {}
