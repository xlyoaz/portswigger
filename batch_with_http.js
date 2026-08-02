#!/usr/bin/env node

/**
 * Batch subscription extraction - HTTP agent version
 * Goes as far as possible without browser, prepares for Playwright
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpProxyAgent } = require('http');
const { HttpsProxyAgent } = require('https');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);

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
    return Object.entries(obj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

async function authWithHTTP(username, password) {
    try {
        // Reset cookies for new account
        cookies = {};

        // Step 1: Get state
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' });
        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('No state');

        // Step 2: Login
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
            loginData
        );
        if (res.status !== 302) throw new Error(`Login failed: ${res.status}`);

        // Step 3: Follow OAuth redirects
        let redirectUrl = res.location;
        for (let i = 0; i < 10 && redirectUrl; i++) {
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            res = await makeRequest({ url: redirectUrl, method: 'GET' });
            if (res.status !== 302 || !res.location) break;
            redirectUrl = res.location;
        }

        // Step 4: Try licenses page (will likely redirect to /users)
        res = await makeRequest({ url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' });

        // Step 5: If redirected to /users, follow it
        if (res.location?.includes('/users?returnurl')) {
            let usersUrl = res.location;
            if (!usersUrl.startsWith('http')) usersUrl = 'https://portswigger.net' + usersUrl;
            res = await makeRequest({ url: usersUrl, method: 'GET' });
        }

        // Check if we got an account page (status 200, not redirect)
        if (res.status === 200 && (res.body.includes('subscriptions') || res.body.includes('account'))) {
            return {
                success: true,
                html: res.body,
                cookies: JSON.parse(JSON.stringify(cookies))
            };
        } else if (res.status === 302) {
            // Still being redirected - session not created
            return {
                success: false,
                error: 'Session not authenticated (redirects continue)',
                requiresPlaywright: true,
                cookies: JSON.parse(JSON.stringify(cookies))
            };
        } else {
            return {
                success: false,
                error: `Unexpected status ${res.status}`,
                html: res.body.substring(0, 200),
                requiresPlaywright: true,
                cookies: JSON.parse(JSON.stringify(cookies))
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error.message,
            requiresPlaywright: true
        };
    }
}

// Test with one account
(async () => {
    console.log('HTTP Agent Test - Single Account\n');
    console.log('Username: y5571702@gmail.com');
    console.log('Password: Xlyoaz60863131..\n');

    const result = await authWithHTTP('y5571702@gmail.com', 'Xlyoaz60863131..');

    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
        console.log('\n✓ HTTP agent başarılı oldu!');
        console.log('Licenses HTML alındı.');
        fs.writeFileSync('http_licenses.html', result.html);
    } else {
        console.log('\n✗ HTTP agent yetersiz');
        console.log(`Reason: ${result.error}`);
        if (result.requiresPlaywright) {
            console.log('\n→ Playwright gerekli');
        }
    }
})();
