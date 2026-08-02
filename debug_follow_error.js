#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

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
    return { status, body, location };
}

function curl(url, post = null, cookieJar = null) {
    let cmd;
    const cookieFlags = cookieJar ? `-b "${cookieJar}" -c "${cookieJar}"` : '';
    if (post) {
        const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
        const data = typeof post === 'string' ? post : Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
        fs.writeFileSync(tempFile, data);
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            fs.unlinkSync(tempFile);
            return parseResponse(output);
        } catch (e) {
            try { fs.unlinkSync(tempFile); } catch {}
            return { status: 0, body: '', error: e.message };
        }
    } else {
        cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        } catch (e) {
            return { status: 0, body: '', error: e.message };
        }
    }
}

const cookieJar = path.join(os.tmpdir(), `err_${Date.now()}.txt`);

// Get auth code
const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
let r = curl(authorizeUrl, null, cookieJar);
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';

r = curl('https://login.portswigger.net/u/login', { username, password, action: 'default', state }, cookieJar);

let url = r.location;
let authCode = null;
for (let i = 0; i < 5; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    r = curl(url, null, cookieJar);
    if (r.location?.includes('code=')) {
        authCode = r.location.match(/code=([^&\s]+)/)?.[1];
        break;
    }
    url = r.location;
    if (!url) break;
}

console.log(`Auth Code: ${authCode}\n`);

// Follow /error redirect
console.log('[1] GET /signin-oidc with code_verifier');
const signinUrl = `https://portswigger.net/signin-oidc?code=${authCode}&code_verifier=${CODE_VERIFIER}`;
r = curl(signinUrl, null, cookieJar);
console.log(`Status: ${r.status}`);
console.log(`Redirect to: ${r.location}\n`);

console.log('[2] Follow redirect to /error');
let errorUrl = r.location;
if (!errorUrl.startsWith('http')) errorUrl = 'https://portswigger.net' + errorUrl;
r = curl(errorUrl, null, cookieJar);
console.log(`Status: ${r.status}`);
console.log(`Body length: ${r.body.length} bytes\n`);

console.log('Error page content (first 1500 chars):');
console.log('='.repeat(70));
console.log(r.body.substring(0, 1500));
console.log('='.repeat(70));

fs.writeFileSync('error_page_full.html', r.body);
console.log('\nFull error page saved to: error_page_full.html');

try { fs.unlinkSync(cookieJar); } catch {}
