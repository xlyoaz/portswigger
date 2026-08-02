#!/usr/bin/env node

/**
 * Batch subscription extraction - FULL HTTP (no browser needed!)
 *
 * Key insight: /signin-oidc form'un tüm bilgisi HTML'de
 * JavaScript sadece submit ediyor, biz de aynı POST'u yapabiliriz
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');

const cheerio = require('cheerio');

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

        // Step 3: Follow OAuth redirects
        let redirectUrl = res.location;
        for (let i = 0; i < 10 && redirectUrl; i++) {
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            res = await makeRequest({ url: redirectUrl, method: 'GET' });
            if (res.status !== 302 || !res.location) break;
            redirectUrl = res.location;
        }

        // Step 4: Parse form from /signin-oidc and submit it
        console.log('    [*] Parsing OAuth form...');
        const $ = cheerio.load(res.body);
        const form = $('form').first();

        if (form.length === 0) {
            throw new Error('Form not found on /signin-oidc page');
        }

        // Form action'ını al (yoksa mevcut URL'ye POST et)
        let formAction = form.attr('action');
        if (!formAction) {
            // Action yoksa formu içeren sayfanın URL'ine POST et
            formAction = '/signin-oidc';
        }

        // Form method
        const formMethod = (form.attr('method') || 'GET').toUpperCase();

        // Tüm input'ları topla
        const formData = {};
        form.find('input').each((i, elem) => {
            const name = $(elem).attr('name');
            const value = $(elem).attr('value');
            if (name) {
                formData[name] = value || '';
            }
        });

        console.log('    [*] Submitting form...');

        // Form action'ının full URL'sini oluştur
        let targetUrl = formAction;
        if (!targetUrl.startsWith('http')) {
            if (!targetUrl.startsWith('/')) {
                targetUrl = '/signin-oidc?/' + targetUrl;
            }
            targetUrl = 'https://portswigger.net' + targetUrl;
        }

        // POST isteği gönder
        const postData = urlencode(formData);
        res = await makeRequest(
            {
                url: targetUrl,
                method: formMethod,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': postData.length
                }
            },
            postData
        );

        // Redirects takip et (ama max 5)
        for (let i = 0; i < 5 && res.location; i++) {
            let nextUrl = res.location;
            if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;
            res = await makeRequest({ url: nextUrl, method: 'GET' });
        }

        // Step 5: Licenses page
        res = await makeRequest({ url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' });

        // Check if authenticated
        if (res.status === 200 && (res.body.includes('subscriptions') || res.body.includes('account'))) {
            return {
                success: true,
                html: res.body,
                cookies: JSON.parse(JSON.stringify(cookies))
            };
        } else {
            return {
                success: false,
                error: `Status ${res.status}`,
                html: res.body.substring(0, 300)
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

function extractPlan(html) {
    if (html.includes('You do not have any subscriptions')) return 'Free';
    if (html.includes('enterprise')) return 'Enterprise';
    if (html.includes('team')) return 'Team';
    if (html.includes('professional')) return 'Professional';
    if (html.includes('community')) return 'Community';
    return 'Unknown';
}

// Test
(async () => {
    console.log('Full HTTP Flow Test\n');
    console.log('Account: y5571702@gmail.com');
    console.log('');

    const result = await authWithHTTP('y5571702@gmail.com', 'Xlyoaz60863131..');

    if (result.success) {
        const plan = extractPlan(result.html);
        console.log(`✓ SUCCESS`);
        console.log(`Plan: ${plan}`);
        fs.writeFileSync('final_test_response.html', result.html);
    } else {
        console.log(`✗ FAILED`);
        console.log(`Error: ${result.error}`);
    }
})();
