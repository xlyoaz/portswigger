#!/usr/bin/env node

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);

function setCookie(setCookieHeader, cookies) {
    if (!setCookieHeader) return;
    const parts = setCookieHeader.split(';')[0].split('=');
    if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
    }
}

function getCookieString(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function makeRequest(options, postData = null, cookies = {}) {
    return new Promise((resolve, reject) => {
        const reqUrl = url.parse(options.url);
        const reqOptions = {
            hostname: reqUrl.hostname,
            port: reqUrl.port,
            path: reqUrl.path,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': getCookieString(cookies),
                ...options.headers
            },
            agent: reqUrl.protocol === 'https:' ? httpsAgent : httpAgent,
            timeout: 30000
        };

        const protocol = reqUrl.protocol === 'https:' ? https : http;
        const req = protocol.request(reqOptions, (res) => {
            let body = '';

            const setCookieHeader = res.headers['set-cookie'];
            if (setCookieHeader) {
                if (Array.isArray(setCookieHeader)) {
                    setCookieHeader.forEach(h => setCookie(h, cookies));
                } else {
                    setCookie(setCookieHeader, cookies);
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
    return Object.entries(obj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

async function debug404() {
    const cookies = {};
    const username = 'y5571702@gmail.com';
    const password = 'Xlyoaz60863131..';

    try {
        console.log('1️⃣  GET /authorize...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}`);

        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('State not found');

        console.log('\n2️⃣  POST /u/login...');
        const loginData = urlencode({ username, password, action: 'default', state });
        res = await makeRequest(
            {
                url: 'https://login.portswigger.net/u/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': loginData.length
                }
            },
            loginData,
            cookies
        );
        console.log(`   Status: ${res.status}`);

        console.log('\n3️⃣  Following redirects...');
        let redirectUrl = res.location;
        let count = 0;
        while (redirectUrl && count < 10) {
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            }
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            console.log(`   Redirect ${count + 1}: ${res.status}`);
            count++;
            if (res.status !== 302) break;
            redirectUrl = res.location;
        }

        console.log('\n4️⃣  GET /users/youraccount/licenses...');
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );
        console.log(`   Status: ${res.status}`);
        console.log(`   Body size: ${res.body.length}`);

        if (res.status === 404) {
            console.log('\n❌ Got 404! Saving response...\n');
            fs.writeFileSync('debug_404_response.html', res.body);
            console.log('📄 Saved to: debug_404_response.html\n');

            // Show first 1000 chars
            console.log('First 1000 chars:');
            console.log(res.body.substring(0, 1000));
            console.log('\n...\n');

            // Check for keywords
            console.log('Response contains:');
            console.log(`  - "login": ${res.body.includes('login') ? '✓' : '✗'}`);
            console.log(`  - "error": ${res.body.includes('error') ? '✓' : '✗'}`);
            console.log(`  - "unauthorized": ${res.body.includes('unauthorized') ? '✓' : '✗'}`);
            console.log(`  - "subscriptions": ${res.body.includes('subscriptions') ? '✓' : '✗'}`);
            console.log(`  - "licenses": ${res.body.includes('licenses') ? '✓' : '✗'}`);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debug404();
