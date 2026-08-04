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

async function testImprovedFlow(username, password) {
    const cookies = {};

    try {
        console.log('🔐 TESTING IMPROVED OAUTH FLOW\n');

        // Step 1: Authorize
        console.log('1️⃣  GET /authorize...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}, Cookies: ${Object.keys(cookies).length}\n`);

        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('State not found');

        // Step 2: Login
        console.log('2️⃣  POST /u/login...');
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
        console.log(`   Status: ${res.status}, Location: ${res.location}\n`);

        // Step 3: Follow redirects
        console.log('3️⃣  Following redirects...');
        let redirectUrl = res.location;
        let redirectCount = 0;
        for (let i = 0; i < 10 && redirectUrl; i++) {
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            console.log(`   ${i + 1}. ${res.status} - ${redirectUrl.substring(0, 80)}`);
            redirectCount++;
            if (res.status !== 302 || !res.location) break;
            redirectUrl = res.location;
        }
        console.log(`   Total redirects followed: ${redirectCount}\n`);

        // Step 4: Check for form
        console.log('4️⃣  Checking for form...');
        const $ = cheerio.load(res.body);
        const form = $('form').first();
        console.log(`   Form found: ${form.length > 0 ? 'YES' : 'NO'}`);

        if (form.length > 0) {
            // Step 5: Submit form
            console.log('\n5️⃣  Submitting form...');
            let formAction = form.attr('action');
            if (!formAction) formAction = '/signin-oidc';
            const formMethod = (form.attr('method') || 'GET').toUpperCase();

            const formData = {};
            form.find('input').each((i, elem) => {
                const name = $(elem).attr('name');
                const value = $(elem).attr('value');
                if (name) formData[name] = value || '';
            });

            console.log(`   Action: ${formAction}, Method: ${formMethod}`);
            console.log(`   Fields: ${Object.keys(formData).length}\n`);

            let targetUrl = formAction;
            if (!targetUrl.startsWith('http')) {
                targetUrl = 'https://portswigger.net' + targetUrl;
            }

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
                postData,
                cookies
            );

            console.log(`   Form submit status: ${res.status}`);
            if (res.location) {
                console.log(`   Location: ${res.location}\n`);
            }

            // Step 6: Follow final redirects
            if (res.location) {
                console.log('6️⃣  Following final redirects...');
                for (let i = 0; i < 5 && res.location; i++) {
                    let nextUrl = res.location;
                    if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;
                    res = await makeRequest({ url: nextUrl, method: 'GET' }, null, cookies);
                    console.log(`   ${i + 1}. ${res.status}`);
                }
                console.log();
            }
        } else {
            console.log('   No form found - trying direct licenses access\n');
        }

        // Step 7: Access licenses page
        console.log('7️⃣  Accessing licenses page...');
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );
        console.log(`   Status: ${res.status}, Body length: ${res.body.length}`);
        console.log(`   Cookies: ${Object.keys(cookies).join(', ')}\n`);

        // Check result
        if (res.status === 200) {
            console.log('✅ SUCCESS!\n');

            const html = res.body.toLowerCase();
            let plan = 'Unknown';

            if (html.includes('you do not have any subscriptions')) {
                plan = 'Free';
            } else if (html.includes('burp suite enterprise') || html.includes('enterprise')) {
                plan = 'Enterprise';
            } else if (html.includes('burp suite team') || html.includes('team')) {
                plan = 'Team';
            } else if (html.includes('burp suite professional') || html.includes('professional')) {
                plan = 'Professional';
            } else if (html.includes('community')) {
                plan = 'Community';
            } else if (html.includes('subscription')) {
                plan = 'Professional';
            }

            console.log(`📋 Plan detected: ${plan}\n`);
            fs.writeFileSync('test_improved_licenses.html', res.body);
            console.log('📄 HTML saved to: test_improved_licenses.html\n');
        } else if (res.status === 302) {
            console.log(`⚠️  Got 302 redirect to: ${res.location}\n`);
            console.log('Following redirect...\n');

            let redirectUrl = res.location;
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://portswigger.net' + redirectUrl;
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            console.log(`Final status: ${res.status}, Body length: ${res.body.length}\n`);

            if (res.status === 200) {
                console.log('✅ SUCCESS after redirect!\n');
                fs.writeFileSync('test_improved_licenses_redirect.html', res.body);
                console.log('📄 HTML saved to: test_improved_licenses_redirect.html\n');
            }
        } else {
            console.log(`❌ Unexpected status: ${res.status}\n`);
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

testImprovedFlow('y5571702@gmail.com', 'Xlyoaz60863131..');
