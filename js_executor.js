#!/usr/bin/env node

/**
 * PortSwigger subscription extractor
 * Node.js with HTTP proxy + JavaScript execution
 * No external dependencies
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const querystring = require('querystring');
const fs = require('fs');
const vm = require('vm');

const PROXY_HOST = 'ankara8.buymobileproxy.com';
const PROXY_PORT = 8029;
const PROXY_USER = 'buymobileproxycom';
const PROXY_PASS = 'mugla9392';

// Read credentials
const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Test account: ${username}\n`);

// Make HTTP request through proxy
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const proxyAuth = Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString('base64');

        const reqOptions = {
            hostname: PROXY_HOST,
            port: PROXY_PORT,
            path: url,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Proxy-Authorization': `Basic ${proxyAuth}`,
                'Host': urlObj.hostname,
                ...options.headers
            },
            timeout: 30000
        };

        if (options.body) {
            const body = typeof options.body === 'string' ? options.body : querystring.stringify(options.body);
            reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    location: res.headers.location
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        if (options.body) {
            const body = typeof options.body === 'string' ? options.body : querystring.stringify(options.body);
            req.write(body);
        }
        req.end();
    });
}

// Execute JavaScript to extract data
function executeJavaScript(htmlContent) {
    const jsCode = `
    (function() {
        // Simulate minimal DOM API
        const html = \`${htmlContent.replace(/`/g, '\\`')}\`;

        // Parse subscription info
        const data = {
            hasSubscription: false,
            subscriptionText: '',
            keywords: [],
            elements: []
        };

        // Check for "You do not have" message
        if (html.includes('You do not have any subscriptions')) {
            data.subscriptionText = 'You do not have any subscriptions';
            data.hasSubscription = false;
        }

        // Extract keywords
        const keywords = ['subscription', 'plan', 'license', 'professional', 'team', 'enterprise'];
        keywords.forEach(kw => {
            if (html.toLowerCase().includes(kw)) {
                data.keywords.push(kw);
            }
        });

        // Extract text content
        let textContent = html
            .replace(/<script[^>]*>.*?<\\/script>/gi, '')
            .replace(/<style[^>]*>.*?<\\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/g, '')
            .replace(/\\s+/g, ' ')
            .trim();

        // Find sentences with subscription info
        const sentences = textContent.split(/[.!?]+/);
        const relevantSentences = sentences.filter(s => {
            const s_lower = s.toLowerCase();
            return keywords.some(kw => s_lower.includes(kw));
        }).map(s => s.trim()).filter(s => s.length > 10);

        data.relevantSentences = relevantSentences.slice(0, 10);

        // Extract all text between important tags
        const divPattern = /<div[^>]*class="[^"]*(?:subscription|plan|license)[^"]*"[^>]*>([^<]+)<\\/div>/gi;
        let match;
        while ((match = divPattern.exec(html)) !== null) {
            data.elements.push(match[1].trim());
        }

        return data;
    })()
    `;

    try {
        const sandbox = {};
        const context = vm.createContext(sandbox);
        const result = vm.runInContext(jsCode, context, { timeout: 5000 });
        return result;
    } catch (error) {
        console.error(`[E] JS Execution error: ${error.message}`);
        return null;
    }
}

// Main function
async function main() {
    const cookies = {};

    try {
        // Step 1: OAuth flow
        console.log('[1] OAuth Login Flow:');
        console.log('='.repeat(80));

        const authUrl = 'https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query';

        console.log('[A] OAuth authorize...');
        let resp = await makeRequest(authUrl);
        console.log(`    Status: ${resp.status}`);

        if (resp.headers['set-cookie']) {
            resp.headers['set-cookie'].forEach(cookie => {
                const parts = cookie.split(';')[0].split('=');
                cookies[parts[0]] = parts[1];
            });
        }

        let state = '';
        if (resp.location && resp.location.includes('state=')) {
            const stateMatch = resp.location.match(/state=([^&]+)/);
            if (stateMatch) state = stateMatch[1];
        }

        // Step 2: Login
        console.log('[B] Login...');
        const loginUrl = `https://login.portswigger.net/u/login${state ? '?state=' + state : ''}`;

        resp = await makeRequest(loginUrl, {
            method: 'POST',
            headers: {
                'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
            },
            body: { username, password, action: 'default' }
        });
        console.log(`    Status: ${resp.status}`);

        if (resp.headers['set-cookie']) {
            resp.headers['set-cookie'].forEach(cookie => {
                const parts = cookie.split(';')[0].split('=');
                cookies[parts[0]] = parts[1];
            });
        }

        // Step 3: Follow redirects
        console.log('[C] Following redirects...');
        let redirectCount = 0;
        while (resp.location && redirectCount < 15) {
            let nextUrl = resp.location;
            if (!nextUrl.startsWith('http')) {
                nextUrl = 'https://login.portswigger.net' + nextUrl;
            }

            console.log(`    Redirect ${redirectCount + 1}: ${nextUrl.substring(0, 60)}...`);
            redirectCount++;

            resp = await makeRequest(nextUrl, {
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

            if (nextUrl.includes('portswigger.net') && !nextUrl.includes('login.portswigger.net')) {
                break;
            }
        }

        console.log(`[✓] Login completed\n`);

        // Step 4: Access /users/youraccount
        console.log('[2] Accessing /users/youraccount:');
        console.log('='.repeat(80));

        const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        resp = await makeRequest('https://portswigger.net/users/youraccount', {
            headers: { 'Cookie': cookieHeader }
        });

        console.log(`Status: ${resp.status}`);
        console.log(`Content length: ${resp.body.length} bytes\n`);

        // Step 5: Execute JavaScript to extract data
        console.log('[3] Executing JavaScript to extract subscription data:');
        console.log('='.repeat(80));

        const extractedData = executeJavaScript(resp.body);

        if (extractedData) {
            console.log(`\n✓ Subscription text: ${extractedData.subscriptionText || 'None found'}`);
            console.log(`✓ Keywords found: ${extractedData.keywords.join(', ') || 'None'}`);

            if (extractedData.relevantSentences.length > 0) {
                console.log(`\n✓ Relevant sentences (${extractedData.relevantSentences.length}):`);
                extractedData.relevantSentences.forEach((s, i) => {
                    console.log(`  ${i + 1}. ${s.substring(0, 120)}`);
                });
            }

            if (extractedData.elements.length > 0) {
                console.log(`\n✓ Subscription elements (${extractedData.elements.length}):`);
                extractedData.elements.forEach((e, i) => {
                    console.log(`  ${i + 1}. ${e.substring(0, 100)}`);
                });
            }

            // Save results
            fs.writeFileSync('subscription_extracted.json', JSON.stringify(extractedData, null, 2));
            fs.writeFileSync('subscription_page.html', resp.body);

            console.log(`\n[✓] Files saved:`);
            console.log(`  - subscription_extracted.json`);
            console.log(`  - subscription_page.html`);
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log('[*] Extraction completed');

    } catch (error) {
        console.error(`\n[✗] Error: ${error.message}`);
        process.exit(1);
    }
}

main();
