#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

// Orijinal challenge kullan - PKCE gerekli olmayabilir
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

console.log('='.repeat(70));
console.log('BASIT OAUTH TESTI (code_verifier GÖNDERME)');
console.log('='.repeat(70));

const cookieJar = path.join(os.tmpdir(), `simple_${Date.now()}.txt`);

// Adım 1: Authorize
console.log('\n[1] Authorize endpoint...');
const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
let r = curl(authorizeUrl, null, cookieJar);
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`State: ${state.substring(0, 30)}...`);

// Adım 2: Login
console.log('\n[2] Login POST...');
r = curl('https://login.portswigger.net/u/login', { username, password, action: 'default', state }, cookieJar);
console.log(`Status: ${r.status}`);

// Adım 3: OAuth chain'i takip et - redirect'leri TakipEt (curl -L kullanıyoruz)
console.log('\n[3] OAuth chain (curl -L ile redirects otomatik takip)...');
let url = r.location || '';
if (url && !url.startsWith('http')) url = 'https://login.portswigger.net' + url;

// curl -L flagı redirect'leri otomatik takip ediyor, bu yüzden sadece bir kez curl çalıştırıyoruz
if (url) {
    r = curl(url, null, cookieJar);
    console.log(`Final status: ${r.status}`);
    console.log(`Body size: ${r.body.length} bytes`);
}

// Adım 4: Licenses sayfası
console.log('\n[4] Licenses page...');
r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);
console.log(`Status: ${r.status}`);
console.log(`Redirect: ${r.location || 'none'}`);
console.log(`Body: ${r.body.length} bytes`);

// Sonuç kontrol
console.log('\n' + '='.repeat(70));
if (r.body.includes('You do not have any subscriptions')) {
    console.log('[✓] BAŞARILI - Serbest hesap bulundu');
} else if (r.body.includes('Your Subscriptions')) {
    console.log('[✓] BAŞARILI - Abonelikler sayfası');
} else if (r.status === 200) {
    console.log('[✓] 200 OK - Sayfa yüklendi');
    console.log('İlk 200 char:', JSON.stringify(r.body.substring(0, 200)));
} else if (r.status === 302) {
    console.log('[✗] Hala login sayfasına yönlendiriliyor');
    console.log(`Yönlendirme: ${r.location}`);
} else {
    console.log(`[?] Status ${r.status}`);
}

fs.writeFileSync('simple_oauth_response.html', r.body);

try { fs.unlinkSync(cookieJar); } catch {}
