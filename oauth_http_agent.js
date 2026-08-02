#!/usr/bin/env node

/**
 * OAuth authentication using Node.js HTTP agent (HttpsProxyAgent)
 * Single process, proper cookie handling, no curl subprocess issues
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpProxyAgent } = require('http');
const { HttpsProxyAgent } = require('https');

const fs = require('fs');

// npm install http https-proxy-agent gerekli!

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const proxyUrl = url.parse(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);
const httpsAgent = new HttpsProxyAgent(PROXY);

// Cookie jar bellekte
let cookies = {};

function setCookie(setCookieHeader) {
    if (!setCookieHeader) return;
    const parts = setCookieHeader.split(';')[0].split('=');
    if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
    }
}

function getCookieString() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const reqUrl = url.parse(options.url);

        const reqOptions = {
            hostname: reqUrl.hostname,
            port: reqUrl.port,
            path: reqUrl.path,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': getCookieString(),
                ...options.headers
            },
            agent: reqUrl.protocol === 'https:' ? httpsAgent : httpAgent,
            timeout: 30000
        };

        const protocol = reqUrl.protocol === 'https:' ? https : http;
        const req = protocol.request(reqOptions, (res) => {
            let body = '';

            // Cookie'leri kaydet
            const setCookieHeader = res.headers['set-cookie'];
            if (setCookieHeader) {
                if (Array.isArray(setCookieHeader)) {
                    setCookieHeader.forEach(setCookie);
                } else {
                    setCookie(setCookieHeader);
                }
            }

            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body,
                    location: res.headers.location
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (postData) req.write(postData);
        req.end();
    });
}

function urlencode(obj) {
    return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

(async () => {
    try {
        console.log('Node.js HTTP Agent ile OAuth test\n');

        // 1: Authorize
        console.log('[1] Authorize...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' });
        let state = res.body.match(/state=([^&\s'"]+)/)?.[1] || '';
        console.log(`State: ${state.substring(0, 30)}...`);

        // 2: Login
        console.log('\n[2] Login...');
        const loginData = urlencode({ username, password, action: 'default', state });
        res = await makeRequest(
            {
                url: 'https://login.portswigger.net/u/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': loginData.length }
            },
            loginData
        );
        console.log(`Status: ${res.status}`);
        console.log(`Location: ${res.location?.substring(0, 60) || 'none'}`);

        // 3: Follow redirects
        console.log('\n[3] Follow OAuth chain...');
        let redirectUrl = res.location;
        let step = 0;
        while (redirectUrl && step < 10) {
            step++;
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;

            console.log(`   [3.${step}] ${redirectUrl.substring(0, 70)}`);
            res = await makeRequest({ url: redirectUrl, method: 'GET' });
            console.log(`          Status: ${res.status}`);

            if (res.status !== 302 || !res.location) break;
            redirectUrl = res.location;
        }

        // 4: Licenses page
        console.log('\n[4] Licenses page...');
        res = await makeRequest({ url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' });
        console.log(`Status: ${res.status}`);
        console.log(`Location: ${res.location || 'none'}`);
        console.log(`Body: ${res.body.length} bytes`);

        // 5: Follow /users if needed
        if (res.location?.includes('/users?returnurl')) {
            console.log('\n[5] Follow /users redirect...');
            let usersUrl = res.location;
            if (!usersUrl.startsWith('http')) usersUrl = 'https://portswigger.net' + usersUrl;
            res = await makeRequest({ url: usersUrl, method: 'GET' });
            console.log(`Status: ${res.status}`);
            console.log(`Body: ${res.body.length} bytes`);
        }

        // Result
        console.log('\n' + '='.repeat(70));
        if (res.body.includes('You do not have any subscriptions')) {
            console.log('[✓] BAŞARILI - Serbest hesap');
        } else if (res.body.includes('Your Subscriptions')) {
            console.log('[✓] BAŞARILI - Abonelikler');
        } else if (res.body.includes('Trusted by')) {
            console.log('[✗] Ana sayfa - login başarısız');
        } else if (res.status === 200) {
            console.log('[?] 200 OK ama sayfa tanınamadı');
            console.log('İlk 200 char:', res.body.substring(0, 200));
        } else {
            console.log(`[?] Status ${res.status}`);
        }

        fs.writeFileSync('http_agent_response.html', res.body);

    } catch (error) {
        console.error('Error:', error.message);
    }
})();
