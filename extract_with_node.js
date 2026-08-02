#!/usr/bin/env node

/**
 * Extract subscription data using Node.js with HTTP + JavaScript execution
 * No external dependencies - proxy built-in
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const querystring = require('querystring');
const fs = require('fs');
const net = require('net');

const PROXY_HOST = 'ankara8.buymobileproxy.com';
const PROXY_PORT = 8029;
const PROXY_USER = 'buymobileproxycom';
const PROXY_PASS = 'mugla9392';

// Read credentials
const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Test account: ${username}\n`);

// Helper to make HTTP requests through proxy
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';

        // Proxy auth header
        const proxyAuth = Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString('base64');

        const reqOptions = {
            hostname: PROXY_HOST,
            port: PROXY_PORT,
            path: url,  // Full URL through proxy
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Proxy-Authorization': `Basic ${proxyAuth}`,
                'Host': urlObj.hostname,
                ...options.headers
            },
            timeout: 10000
        };

        if (options.body) {
            const body = typeof options.body === 'string' ? options.body : querystring.stringify(options.body);
            reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const client = isHttps ? https : http;

        const req = client.request(reqOptions, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    url: res.url || url,
                    location: res.headers.location
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            const body = typeof options.body === 'string' ? options.body : querystring.stringify(options.body);
            req.write(body);
        }

        req.end();
    });
}

// Main execution
async function main() {
    const cookies = {};

    try {
        // Step 1: OAuth authorize
        console.log('[1] OAuth Login Flow:');
        console.log('='.repeat(80));

        const authUrl = 'https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query';

        console.log('[A] GET authorize...');
        let resp = await makeRequest(authUrl);
        console.log(`    Status: ${resp.status}`);

        // Store cookies
        if (resp.headers['set-cookie']) {
            resp.headers['set-cookie'].forEach(cookie => {
                const parts = cookie.split(';')[0].split('=');
                cookies[parts[0]] = parts[1];
            });
        }

        let state = '';
        if (resp.location) {
            const locationUrl = new URL(resp.location.startsWith('http') ? resp.location : 'https://login.portswigger.net' + resp.location);
            state = locationUrl.searchParams.get('state');
            console.log(`    Redirect: ${resp.location.substring(0, 60)}...`);
            console.log(`    State: ${state.substring(0, 30)}...`);
        }

        // Step 2: Login
        console.log(`\n[B] Submitting login...`);
        const loginUrl = `https://login.portswigger.net/u/login${state ? '?state=' + state : ''}`;

        resp = await makeRequest(loginUrl, {
            method: 'POST',
            headers: {
                'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
            },
            body: {
                username: username,
                password: password,
                action: 'default'
            }
        });

        console.log(`    Status: ${resp.status}`);
        if (resp.headers['set-cookie']) {
            resp.headers['set-cookie'].forEach(cookie => {
                const parts = cookie.split(';')[0].split('=');
                cookies[parts[0]] = parts[1];
            });
        }

        // Step 3: Follow redirects
        console.log(`\n[C] Following OAuth redirects...`);
        let redirectCount = 0;
        let currentUrl = resp.location || resp.url;

        while (resp.location && redirectCount < 15) {
            if (!resp.location.startsWith('http')) {
                currentUrl = 'https://login.portswigger.net' + resp.location;
            } else {
                currentUrl = resp.location;
            }

            console.log(`    Redirect ${redirectCount + 1}: ${currentUrl.substring(0, 70)}...`);
            redirectCount++;

            resp = await makeRequest(currentUrl, {
                headers: {
                    'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
                }
            });

            console.log(`      Status: ${resp.status}`);

            if (resp.headers['set-cookie']) {
                resp.headers['set-cookie'].forEach(cookie => {
                    const parts = cookie.split(';')[0].split('=');
                    cookies[parts[0]] = parts[1];
                });
            }

            if (currentUrl.includes('portswigger.net') && !currentUrl.includes('login.portswigger.net')) {
                break;
            }
        }

        console.log(`[✓] Login completed`);
        console.log(`[*] Cookies: ${Object.keys(cookies).length}`);
        console.log(`\n[2] Accessing subscription endpoints:`);
        console.log('='.repeat(80));

        const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

        // Access /users/youraccount
        console.log(`\n[Testing] /users/youraccount`);
        resp = await makeRequest('https://portswigger.net/users/youraccount', {
            headers: { 'Cookie': cookieHeader }
        });

        console.log(`  Status: ${resp.status}`);
        console.log(`  Length: ${resp.body.length} bytes`);

        // Parse HTML and extract subscription info
        const subscriptionPattern = /You do not have any subscriptions|subscription|plan|license/gi;
        const matches = resp.body.match(subscriptionPattern);

        if (matches) {
            console.log(`  ✓ Found keywords: ${[...new Set(matches)].join(', ')}`);
        }

        // Extract text content
        const textContent = resp.body
            .replace(/<[^>]*>/g, '')
            .replace(/&[a-z]+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        console.log(`\n[3] Page content (first 500 chars):`);
        console.log('='.repeat(80));
        console.log(textContent.substring(0, 500));

        // Save files
        fs.writeFileSync('users_youraccount_http.html', resp.body);
        fs.writeFileSync('users_youraccount_text.txt', textContent);

        console.log(`\n[✓] Files saved:`);
        console.log(`  - users_youraccount_http.html`);
        console.log(`  - users_youraccount_text.txt`);

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[*] Extraction completed`);

    } catch (error) {
        console.error(`[✗] Error: ${error.message}`);
        process.exit(1);
    }
}

main();
