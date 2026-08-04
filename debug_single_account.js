#!/usr/bin/env node

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const cheerio = require('cheerio');

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
                'User-Agent': 'Mozilla/5.0',
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

async function debugAuth(username, password) {
    const cookies = {};
    let step = 0;

    try {
        // Step 1
        step = 1;
        console.log(`\n${step}️⃣  GET /authorize...`);
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}, Body: ${res.body.length} chars, Cookies: ${Object.keys(cookies).length}`);

        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('State not found');
        console.log(`   State: ${state.substring(0, 30)}...`);

        // Step 2
        step = 2;
        console.log(`\n${step}️⃣  POST /u/login...`);
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
        console.log(`   Status: ${res.status}, Body: ${res.body.length} chars`);
        console.log(`   Location: ${res.location}`);
        console.log(`   Cookies: ${Object.keys(cookies).join(', ')}`);

        // Step 3 - Follow redirects
        step = 3;
        console.log(`\n${step}️⃣  Following redirects...`);
        let redirectUrl = res.location;
        let redirectCount = 0;
        while (redirectUrl && redirectCount < 10) {
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            }
            console.log(`   Redirect ${redirectCount + 1}: ${redirectUrl.substring(0, 80)}`);
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            console.log(`      ← ${res.status} (${res.body.length} chars)`);
            redirectCount++;

            if (res.status !== 302) break;
            redirectUrl = res.location;
        }
        console.log(`   Total redirects: ${redirectCount}`);

        // Step 4 - Check for form
        step = 4;
        console.log(`\n${step}️⃣  Checking for form...`);
        const $ = cheerio.load(res.body);
        const form = $('form').first();
        console.log(`   Form found: ${form.length > 0 ? 'YES' : 'NO'}`);
        if (form.length > 0) {
            console.log(`   Action: ${form.attr('action')}`);
            console.log(`   Method: ${form.attr('method')}`);
            console.log(`   Fields: ${$('input').length}`);
        }

        // Step 5 - Access licenses
        step = 5;
        console.log(`\n${step}️⃣  GET /users/youraccount/licenses...`);
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );
        console.log(`   Status: ${res.status}, Body: ${res.body.length} chars`);
        if (res.location) console.log(`   Location: ${res.location}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}`);

        // Step 6 - Follow if 302
        if (res.status === 302) {
            step = 6;
            console.log(`\n${step}️⃣  Following redirects from licenses page...`);
            let redirectCount = 0;
            while (res.status === 302 && res.location && redirectCount < 10) {
                let url = res.location;
                if (!url.startsWith('http')) url = 'https://portswigger.net' + url;
                console.log(`   Redirect ${redirectCount + 1}: ${url.substring(0, 80)}`);
                res = await makeRequest({ url: url, method: 'GET' }, null, cookies);
                console.log(`      ← ${res.status} (${res.body.length} chars)`);
                redirectCount++;
            }
            console.log(`   Final status: ${res.status}`);
        }

        // Step 7 - Check result
        step = 7;
        console.log(`\n${step}️⃣  Result:`);
        if (res.body.length > 500) {
            console.log(`   ✅ Got large response (${res.body.length} chars)`);
            if (res.body.includes('subscriptions')) console.log(`   ✅ Contains "subscriptions"`);
            if (res.body.includes('Professional')) console.log(`   ✅ Contains "Professional"`);
            if (res.body.includes('you do not have')) console.log(`   ✅ Free account`);
        } else {
            console.log(`   ❌ Response too small (${res.body.length} chars)`);
            console.log(`   First 200 chars: ${res.body.substring(0, 200)}`);
        }

    } catch (error) {
        console.error(`\n❌ Error at step ${step}:`, error.message);
    }
}

debugAuth('y5571702@gmail.com', 'Xlyoaz60863131..');
