#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

// PKCE pair from generate_pkce.js
const CODE_VERIFIER = 'sL9O3e1wCQbOGC178C6Qg5TT9kIfGKZGE2FVXhF6x0A';
const CODE_CHALLENGE = 'tmpm7Wa4cQaQQIc9QHLkoXvIAqIORs-HfB2vEL8cwhE';

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
        let data;
        if (typeof post === 'string') {
            data = post; // Already formatted
        } else {
            data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
        }
        fs.writeFileSync(tempFile, data);
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            fs.unlinkSync(tempFile);
            return parseResponse(output);
        } catch (e) {
            try { fs.unlinkSync(tempFile); } catch {}
            return { status: 0, body: '', location: null, error: e.message };
        }
    } else {
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        } catch (e) {
            return { status: 0, body: '', location: null, error: e.message };
        }
    }
}

console.log('='.repeat(70));
console.log('PKCE-ENABLED OAUTH FLOW TEST');
console.log('='.repeat(70));
console.log(`Code Verifier: ${CODE_VERIFIER}`);
console.log(`Code Challenge: ${CODE_CHALLENGE}`);

const cookieJar = path.join(os.tmpdir(), `pkce_${Date.now()}.txt`);

// STEP 1: Get authorize state (with NEW code_challenge)
console.log('\n[1] Authorize endpoint (with PKCE)');
const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
let r = curl(authorizeUrl, null, cookieJar);
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`   State: ${state.substring(0, 30)}...`);

// STEP 2: Login
console.log('\n[2] Login with credentials');
r = curl('https://login.portswigger.net/u/login', { username, password, action: 'default', state }, cookieJar);
console.log(`   Status: ${r.status}, Redirect: ${r.location?.substring(0, 50) || 'none'}`);

// STEP 3: Follow redirects to get authorization code
console.log('\n[3] Follow OAuth chain to get code');
let url = r.location;
let authCode = null;
let step = 0;
while (url && step < 10) {
    step++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    console.log(`   [3.${step}] ${url.substring(0, 65)}`);
    r = curl(url, null, cookieJar);
    console.log(`          Status: ${r.status}`);

    // Extract code from redirect if available
    if (r.location?.includes('code=')) {
        authCode = r.location.match(/code=([^&]+)/)?.[1];
        console.log(`          Found code: ${authCode?.substring(0, 20)}...`);
    }

    if (r.status !== 302 || !r.location) break;
    url = r.location;
}

// STEP 4: Exchange code at /signin-oidc with code_verifier
if (authCode) {
    console.log('\n[4] Exchange code at /signin-oidc (with code_verifier)');

    // Try as URL parameter first
    console.log('   [4a] Try: GET /signin-oidc?code=...&code_verifier=...');
    const signinUrl = `https://portswigger.net/signin-oidc?code=${authCode}&code_verifier=${CODE_VERIFIER}`;
    r = curl(signinUrl, null, cookieJar);
    console.log(`        Status: ${r.status}, Redirect: ${r.location?.substring(0, 50) || 'none'}`);

    if (r.status !== 200) {
        // Try as POST
        console.log('   [4b] Try: POST /signin-oidc with code and code_verifier');
        const postData = `code=${authCode}&code_verifier=${CODE_VERIFIER}`;
        r = curl('https://portswigger.net/signin-oidc', postData, cookieJar);
        console.log(`        Status: ${r.status}, Redirect: ${r.location?.substring(0, 50) || 'none'}`);
    }
}

// STEP 5: Try licenses page
console.log('\n[5] Fetch /users/youraccount/licenses');
r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);
console.log(`   Status: ${r.status}`);
console.log(`   Redirect: ${r.location || 'none'}`);
console.log(`   Body: ${r.body.length} bytes`);

console.log('\n' + '='.repeat(70));
if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] SUCCESS - Got free account page');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] SUCCESS - Got subscriptions page');
} else if (r.status === 200) {
    console.log('[?] Got 200 response');
    console.log('First 200 chars:', JSON.stringify(r.body.substring(0, 200)));
} else {
    console.log('[✗] Still not authenticated');
}

fs.writeFileSync('pkce_test_response.html', r.body);
console.log('\nResponse saved to: pkce_test_response.html');

try { fs.unlinkSync(cookieJar); } catch {}
