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
            cmd = `curl -s -i ${redirect} ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
                fs.unlinkSync(tempFile);
                return parseResponse(output);
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i ${redirect} ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
            return parseResponse(output);
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

let url = r.location;
let redirectCount = 0;

while (url && redirectCount < 10) {
    redirectCount++;
    console.log(`\n[3.${redirectCount}] Follow redirect`);

    if (!url.startsWith('http')) {
        url = 'https://login.portswigger.net' + url;
    }

    console.log(`URL: ${url.substring(0, 80)}`);
    r = curl(url);
    console.log(`Status: ${r.status}`);
    console.log(`Body size: ${r.body.length}`);

    if (r.location) {
        console.log(`Location: ${r.location.substring(0, 80)}`);
    }

    url = r.location;

    // Check if we got subscription data
    if (r.body.toLowerCase().includes('professional') ||
        r.body.toLowerCase().includes('team') ||
        r.body.toLowerCase().includes('enterprise')) {
        console.log('\n[✓] Plan keywords found!');
        break;
    }

    if (r.body.includes('You do not have any subscriptions')) {
        console.log('\n[✓] Free account found!');
        break;
    }
}

console.log(`\n[*] Final response size: ${r.body.length} bytes`);

if (r.body.toLowerCase().includes('professional')) console.log('[✓] Professional');
else if (r.body.toLowerCase().includes('team')) console.log('[✓] Team');
else if (r.body.toLowerCase().includes('enterprise')) console.log('[✓] Enterprise');
else if (r.body.toLowerCase().includes('community')) console.log('[✓] Community');
else if (r.body.includes('You do not have any subscriptions')) console.log('[✓] Free');
else console.log('[?] Plan not found');

fs.writeFileSync('debug_final.html', r.body);
console.log('\nSaved final response to: debug_final.html');

fs.unlinkSync(COOKIE_JAR);
