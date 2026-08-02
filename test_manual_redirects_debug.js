#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

console.log(`Testing: ${username}\n`);

function curl(url, post = null, followRedirect = false) {
    try {
        let cmd;
        const cookies = `-b "${COOKIE_JAR}" -c "${COOKIE_JAR}"`;
        const redirect = followRedirect ? '-L' : '';

        if (post) {
            const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            console.log(`[DEBUG] POST data: ${data.substring(0, 100)}...`);
            cmd = `curl -s -i ${redirect} ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
                fs.unlinkSync(tempFile);
                const result = parseResponse(output);
                console.log(`[DEBUG] Response status: ${result.status}`);
                if (result.location) console.log(`[DEBUG] Location: ${result.location}`);
                console.log(`[DEBUG] Body preview: ${result.body.substring(0, 200)}...`);
                return result;
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i ${redirect} ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
            const result = parseResponse(output);
            console.log(`[DEBUG] Response status: ${result.status}`);
            if (result.location) console.log(`[DEBUG] Location: ${result.location}`);
            return result;
        }
    } catch (e) {
        console.error(`Error: ${e.message.substring(0, 80)}`);
        return { status: 0, body: '', location: null };
    }
}

function parseResponse(output) {
    const parts = output.split('\r\n\r\n');
    const headers = parts[0];
    const body = parts.slice(1).join('\r\n\r\n');
    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location };
}

console.log('[1] Authorize');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`Status: ${r.status}, State: ${state.substring(0, 30)}...\n`);

if (!state) {
    console.error('State not found!');
    fs.writeFileSync('debug_auth.html', r.body);
    console.log('Saved to: debug_auth.html');
    process.exit(1);
}

console.log('[2] Login');
r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
});
console.log(`Status: ${r.status}`);
console.log(`Location: ${r.location?.substring(0, 80) || '(none)'}`);
console.log(`Body size: ${r.body.length}`);

// Save full response for inspection
fs.writeFileSync('debug_login_response.html', r.body);
console.log('\nFull login response saved to: debug_login_response.html');

// Check for common error patterns
if (r.body.toLowerCase().includes('error')) {
    console.log('[!] Response contains "error"');
}
if (r.body.toLowerCase().includes('invalid')) {
    console.log('[!] Response contains "invalid"');
}
if (r.body.toLowerCase().includes('incorrect')) {
    console.log('[!] Response contains "incorrect"');
}
if (r.body.toLowerCase().includes('wrong')) {
    console.log('[!] Response contains "wrong"');
}

// If no location, try to find any redirect info
if (!r.location) {
    console.log('\n[!] No Location header found. Checking for redirect info in body...');
    const redirectMatch = r.body.match(/location\.href\s*=\s*["']([^"']+)["']/i);
    if (redirectMatch) {
        console.log(`[*] Found JavaScript redirect: ${redirectMatch[1]}`);
    }
}

fs.unlinkSync(COOKIE_JAR);
