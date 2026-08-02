#!/usr/bin/env node

/**
 * Smarter plan extraction with better keyword matching
 * Looks for subscription section context instead of just keywords
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

function parseResponse(output) {
    const parts = output.split('\r\n\r\n');
    let headers = parts[0];
    let body = parts.slice(1).join('\r\n\r\n');

    if (body && body.startsWith('HTTP/')) {
        const bodyParts = body.split('\r\n\r\n');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
    }

    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location };
}

function curl(url, post = null) {
    try {
        let cmd;
        const cookies = `-b "${COOKIE_JAR}" -c "${COOKIE_JAR}"`;

        if (post) {
            const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            cmd = `curl -s -i ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
                fs.unlinkSync(tempFile);
                return parseResponse(output);
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
            return parseResponse(output);
        }
    } catch (e) {
        console.error(`Error: ${e.message.substring(0, 80)}`);
        return { status: 0, body: '', location: null };
    }
}

function extractPlan(html) {
    // Check for no subscriptions
    if (html.includes('You do not have any subscriptions')) {
        return 'Free/Community';
    }

    // Look for subscription info in specific contexts
    // Check for active subscription with plan type
    const subscriptionPatterns = [
        // Look for plan mentions in headers or subscription boxes
        /(?:current\s+)?(?:subscription|plan)[\s\S]*?(professional|enterprise|team|community)/i,
        // Look for plan in pricing context
        /plan[\s:]+["']?(professional|enterprise|team|community)["']?/i,
        // Look for "Your X plan" or "You have X"
        /(?:your|you have)\s+(?:an?\s+)?(professional|enterprise|team|community)/i,
        // Look for "X subscription" or "X account"
        /(professional|enterprise|team|community)\s+(?:subscription|account|plan)/i,
        // Look for plan in data attributes or JSON
        /["\']?plan["\']?\s*[=:]\s*["\']?(professional|enterprise|team|community)["\']?/i,
    ];

    for (const pattern of subscriptionPatterns) {
        const match = html.match(pattern);
        if (match) {
            const plan = match[1].toLowerCase();
            console.log(`    [DEBUG] Found plan via pattern: ${plan}`);
            return plan.charAt(0).toUpperCase() + plan.slice(1);
        }
    }

    // Fallback: just count occurrences in likely contexts (not in HTML tags or attributes)
    // Extract text content (rough approximation)
    const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');

    const planScores = {
        enterprise: (textOnly.match(/\benterprise\b/gi) || []).length,
        professional: (textOnly.match(/\bprofessional\b/gi) || []).length,
        team: (textOnly.match(/\bteam\b/gi) || []).length,
        community: (textOnly.match(/\bcommunity\b/gi) || []).length,
    };

    console.log(`    [DEBUG] Plan occurrence counts: ${JSON.stringify(planScores)}`);

    // Find the plan with highest count (excluding very common words like "community")
    const sorted = Object.entries(planScores)
        .filter(([plan, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0) {
        const [plan, count] = sorted[0];
        if (count > 2) { // Only trust if mentioned multiple times
            console.log(`    [DEBUG] Selected plan ${plan} with ${count} occurrences`);
            return plan.charAt(0).toUpperCase() + plan.slice(1);
        }
    }

    return 'Unknown';
}

console.log(`[*] Testing: ${username}\n`);

// Step 1: Get state
console.log('[1] Getting state');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';

if (!state) {
    console.error('[!] Failed to get state');
    process.exit(1);
}

// Step 2: Login
console.log('[2] Logging in');
r = curl('https://login.portswigger.net/u/login', {
    username: username,
    password: password,
    action: 'default',
    state: state
});

if (r.status !== 302) {
    console.error('[!] Login failed');
    process.exit(1);
}

// Step 3: Follow OAuth redirects but stop before code exchange
console.log('[3] Following OAuth chain');
let url = r.location;
let redirectCount = 0;
while (url && redirectCount < 15) {
    redirectCount++;
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;

    if (url.includes('/signin-oidc')) {
        console.log(`    Stopped before code exchange`);
        break;
    }

    r = curl(url);
    url = r.location;
}

// Step 4: Fetch account page
console.log('[4] Fetching account page');
r = curl('https://portswigger.net/#/my-account');
console.log(`    Got ${r.body.length} bytes`);

// Step 5: Extract plan with detailed logging
console.log('[5] Extracting plan');
let plan = extractPlan(r.body);

console.log('\n' + '='.repeat(60));
console.log(`RESULT: ${username} = ${plan}`);
console.log('='.repeat(60));

// Save response for manual inspection
fs.writeFileSync('debug_smart_extract.html', r.body);
console.log('\nSaved to: debug_smart_extract.html\n');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
