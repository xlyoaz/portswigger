#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

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
        cmd = `curl -s -i -L ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            fs.unlinkSync(tempFile);
            return parseResponse(output);
        } catch (e) {
            try { fs.unlinkSync(tempFile); } catch {}
            return { status: 0, body: '', error: e.message };
        }
    } else {
        cmd = `curl -s -i -L ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        try {
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        } catch (e) {
            return { status: 0, body: '', error: e.message };
        }
    }
}

console.log('Test: /users redirect\'ini takip et\n');

const cookieJar = path.join(os.tmpdir(), `follow_${Date.now()}.txt`);

// 1-3: Login ve OAuth
const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
let r = curl(authorizeUrl, null, cookieJar);
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';

r = curl('https://login.portswigger.net/u/login', { username, password, action: 'default', state }, cookieJar);

let url = r.location || '';
if (url && !url.startsWith('http')) url = 'https://login.portswigger.net' + url;
if (url) {
    r = curl(url, null, cookieJar);
}

// 4: Licenses sayfası
console.log('[1] GET /users/youraccount/licenses');
r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);
console.log(`    Status: ${r.status}`);
console.log(`    Location: ${r.location}`);
console.log(`    Body: ${r.body.length} bytes\n`);

// 5: /users redirect'ini takip et
if (r.location && r.location.includes('/users?returnurl')) {
    console.log('[2] /users redirect\'ini takip et');
    let usersUrl = r.location;
    if (!usersUrl.startsWith('http')) {
        usersUrl = 'https://portswigger.net' + usersUrl;
    }

    console.log(`    GET ${usersUrl.substring(0, 80)}`);
    r = curl(usersUrl, null, cookieJar);
    console.log(`    Status: ${r.status}`);
    console.log(`    Location: ${r.location || 'none'}`);
    console.log(`    Body: ${r.body.length} bytes\n`);
}

// 6: Sonuç kontrol et
console.log('[3] Sonuç:');
if (r.body.includes('You do not have any subscriptions')) {
    console.log('    ✓ Serbest hesap');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('    ✓ Abonelikler sayfası');
} else if (r.body.includes('Trusted by')) {
    console.log('    ✗ Ana sayfa (login başarısız)');
} else if (r.status === 200) {
    console.log('    ✓ 200 OK');
    console.log(`    İlk 300 char: ${r.body.substring(0, 300)}`);
} else {
    console.log(`    Status: ${r.status}`);
}

fs.writeFileSync('follow_users_response.html', r.body);

try { fs.unlinkSync(cookieJar); } catch {}
