#!/usr/bin/env node

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
        console.log(`[DEBUG] Making ${options.method || 'GET'} request to: ${options.url}`);

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
            timeout: 15000
        };

        const protocol = reqUrl.protocol === 'https:' ? https : http;
        const req = protocol.request(reqOptions, (res) => {
            console.log(`[DEBUG] Response status: ${res.statusCode}`);
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
                console.log(`[DEBUG] Response body length: ${body.length}`);
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body,
                    location: res.headers.location
                });
            });
        });

        req.on('error', (error) => {
            console.log(`[DEBUG] Request error: ${error.message}`);
            reject(error);
        });

        req.on('timeout', () => {
            console.log(`[DEBUG] Request timeout`);
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

        console.log('\n[1] Get authorize state...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' });
        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        console.log(`[DEBUG] Extracted state: ${state ? 'YES' : 'NO'}`);
        if (!state) throw new Error('No state');

        console.log('\n[2] Login with credentials...');
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
        console.log(`[DEBUG] Login response status: ${res.status}, has location: ${!!res.location}`);

        console.log('\n[3] Follow OAuth redirects...');
        let redirectUrl = res.location;
        let redirectCount = 0;
        for (let i = 0; i < 10 && redirectUrl; i++) {
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            console.log(`[DEBUG] Redirect ${i+1}: ${redirectUrl.substring(0, 80)}`);
            res = await makeRequest({ url: redirectUrl, method: 'GET' });
            redirectCount++;
            if (res.status !== 302 || !res.location) {
                console.log(`[DEBUG] Redirect chain stopped (status=${res.status})`);
                break;
            }
            redirectUrl = res.location;
        }
        console.log(`[DEBUG] Followed ${redirectCount} redirects, final status: ${res.status}`);

        console.log('\n[4] Parsing /signin-oidc form...');
        const $ = cheerio.load(res.body);
        const form = $('form').first();

        if (form.length === 0) {
            console.log('[DEBUG] Form not found!');
            console.log('[DEBUG] Response body preview:', res.body.substring(0, 300));
            throw new Error('Form not found on /signin-oidc page');
        }

        console.log('[DEBUG] Form found');

        let formAction = form.attr('action');
        if (!formAction) {
            formAction = '/signin-oidc';
        }
        console.log(`[DEBUG] Form action: ${formAction}`);

        const formMethod = (form.attr('method') || 'GET').toUpperCase();
        console.log(`[DEBUG] Form method: ${formMethod}`);

        const formData = {};
        form.find('input').each((i, elem) => {
            const name = $(elem).attr('name');
            const value = $(elem).attr('value');
            if (name) {
                formData[name] = value || '';
            }
        });
        console.log(`[DEBUG] Form fields: ${Object.keys(formData).length}`);
        console.log(`[DEBUG] Form fields: ${Object.keys(formData).join(', ')}`);

        console.log('\n[5] Submitting form...');

        let targetUrl = formAction;
        if (!targetUrl.startsWith('http')) {
            if (!targetUrl.startsWith('/')) {
                targetUrl = '/signin-oidc?/' + targetUrl;
            }
            targetUrl = 'https://portswigger.net' + targetUrl;
        }
        console.log(`[DEBUG] Target URL: ${targetUrl}`);

        const postData = urlencode(formData);
        console.log(`[DEBUG] POST data length: ${postData.length}`);

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
        console.log(`[DEBUG] Form submission response: ${res.status}`);

        console.log('\n[6] Following post-form redirects...');
        for (let i = 0; i < 5 && res.location; i++) {
            let nextUrl = res.location;
            if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;
            console.log(`[DEBUG] Redirect ${i+1}: ${nextUrl.substring(0, 80)}`);
            res = await makeRequest({ url: nextUrl, method: 'GET' });
            console.log(`[DEBUG] Status: ${res.status}`);
        }

        console.log('\n[7] Fetching licenses page...');
        res = await makeRequest({ url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' });
        console.log(`[DEBUG] Licenses page status: ${res.status}`);

        if (res.status === 200 && (res.body.includes('subscriptions') || res.body.includes('account'))) {
            console.log('[DEBUG] Authentication successful!');
            return {
                success: true,
                html: res.body,
                cookies: JSON.parse(JSON.stringify(cookies))
            };
        } else {
            console.log(`[DEBUG] Authentication failed (status=${res.status})`);
            return {
                success: false,
                error: `Status ${res.status}`,
                html: res.body.substring(0, 300)
            };
        }

    } catch (error) {
        console.log(`[DEBUG] Error caught: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

(async () => {
    console.log('='.repeat(70));
    console.log('Full HTTP Flow Test - With Debug Output');
    console.log('='.repeat(70));
    console.log('Account: y5571702@gmail.com');
    console.log('');

    const result = await authWithHTTP('y5571702@gmail.com', 'Xlyoaz60863131..');

    console.log('\n' + '='.repeat(70));
    console.log('RESULT:');
    console.log('='.repeat(70));
    if (result.success) {
        console.log('✓ SUCCESS');
        fs.writeFileSync('batch_debug_response.html', result.html);
        console.log('HTML saved to batch_debug_response.html');
    } else {
        console.log('✗ FAILED');
        console.log(`Error: ${result.error}`);
    }
})();
