#!/usr/bin/env node

/**
 * PortSwigger subscription extractor - Node.js
 * Uses curl for proxy + JavaScript execution
 */

const { execSync } = require('child_process');
const fs = require('fs');
const vm = require('vm');
const querystring = require('querystring');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

// Read credentials
const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Test account: ${username}\n`);

// Make HTTP request using curl
function makeRequest(url, options = {}) {
    try {
        let curlCmd = `curl -s -i -x "${PROXY}" "${url}"`;

        if (options.method === 'POST' && options.body) {
            const bodyStr = querystring.stringify(options.body);
            curlCmd = `curl -s -i -x "${PROXY}" -X POST -d '${bodyStr}' "${url}"`;
        }

        const output = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

        // Parse HTTP response
        const parts = output.split('\r\n\r\n');
        const headers = parts[0];
        const body = parts.slice(1).join('\r\n\r\n');

        // Extract status code
        const statusMatch = headers.match(/HTTP\/\d\.\d (\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 0;

        // Extract location header
        const locMatch = headers.match(/[Ll]ocation:\s*([^\r\n]+)/);
        const location = locMatch ? locMatch[1].trim() : null;

        return { status, body, location };
    } catch (error) {
        console.error(`[!] Curl error: ${error.message.substring(0, 100)}`);
        return { status: 0, body: '', location: null };
    }
}

// Execute JavaScript to extract data
function executeJavaScript(htmlContent) {
    const jsCode = `
    (function() {
        const html = \`${htmlContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

        const data = {
            hasSubscription: false,
            subscriptionText: '',
            keywords: [],
            sentences: [],
            elements: []
        };

        // Check for "You do not have" message
        if (html.includes('You do not have any subscriptions')) {
            data.subscriptionText = 'You do not have any subscriptions';
        }

        // Extract keywords
        const keywords = ['subscription', 'plan', 'license', 'professional', 'team', 'enterprise', 'community'];
        keywords.forEach(kw => {
            if (html.toLowerCase().includes(kw)) {
                data.keywords.push(kw);
            }
        });

        // Extract text
        let text = html
            .replace(/<script[^>]*>.*?<\\/script>/gi, '')
            .replace(/<style[^>]*>.*?<\\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/g, '')
            .replace(/\\s+/g, ' ')
            .trim();

        // Find relevant sentences
        const sentences = text.split(/[.!?]+/);
        data.sentences = sentences
            .filter(s => keywords.some(kw => s.toLowerCase().includes(kw)))
            .map(s => s.trim())
            .filter(s => s.length > 10)
            .slice(0, 10);

        return data;
    })()
    `;

    try {
        const sandbox = {};
        const context = vm.createContext(sandbox);
        const result = vm.runInContext(jsCode, context, { timeout: 5000 });
        return result;
    } catch (error) {
        console.error(`[E] JS error: ${error.message}`);
        return null;
    }
}

// Main
async function main() {
    const cookies = new Map();

    try {
        console.log('[1] OAuth Login Flow:');
        console.log('='.repeat(80));

        // Step 1: Authorize
        console.log('[A] OAuth authorize...');
        const authUrl = 'https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query';

        let resp = makeRequest(authUrl);
        console.log(`    Status: ${resp.status}`);

        let state = '';
        if (resp.location && resp.location.includes('state=')) {
            const match = resp.location.match(/state=([^&]+)/);
            if (match) state = match[1];
        }

        // Step 2: Login
        console.log('[B] Login...');
        const loginUrl = `https://login.portswigger.net/u/login${state ? '?state=' + state : ''}`;

        resp = makeRequest(loginUrl, {
            method: 'POST',
            body: { username, password, action: 'default' }
        });
        console.log(`    Status: ${resp.status}`);

        // Step 3: Follow redirects
        console.log('[C] Following redirects...');
        let redirectCount = 0;
        let currentUrl = resp.location;

        while (currentUrl && redirectCount < 15) {
            if (!currentUrl.startsWith('http')) {
                currentUrl = 'https://login.portswigger.net' + currentUrl;
            }

            console.log(`    Redirect ${redirectCount + 1}: ${currentUrl.substring(0, 60)}...`);
            redirectCount++;

            resp = makeRequest(currentUrl);
            console.log(`      Status: ${resp.status}`);

            currentUrl = resp.location;

            if (!currentUrl || currentUrl.includes('portswigger.net') && !currentUrl.includes('login.portswigger.net')) {
                break;
            }
        }

        console.log(`[✓] Login completed\n`);

        // Step 4: Access /users/youraccount
        console.log('[2] Accessing /users/youraccount:');
        console.log('='.repeat(80));

        resp = makeRequest('https://portswigger.net/users/youraccount');
        console.log(`Status: ${resp.status}`);
        console.log(`Content length: ${resp.body.length} bytes\n`);

        // Step 5: Execute JavaScript
        console.log('[3] Executing JavaScript to extract subscription data:');
        console.log('='.repeat(80));

        const extractedData = executeJavaScript(resp.body);

        if (extractedData) {
            console.log(`\n✓ Subscription text: ${extractedData.subscriptionText || 'None found'}`);
            console.log(`✓ Keywords: ${extractedData.keywords.join(', ') || 'None'}`);

            if (extractedData.sentences.length > 0) {
                console.log(`\n✓ Relevant info (${extractedData.sentences.length} items):`);
                extractedData.sentences.forEach((s, i) => {
                    console.log(`  ${i + 1}. ${s.substring(0, 100)}`);
                });
            }

            // Save results
            fs.writeFileSync('subscription_extracted.json', JSON.stringify(extractedData, null, 2));
            fs.writeFileSync('subscription_page.html', resp.body);

            console.log(`\n[✓] Saved:`);
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
