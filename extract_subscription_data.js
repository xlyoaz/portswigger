#!/usr/bin/env node

/**
 * Extract subscription data from PortSwigger accounts
 * Finds subscription plan, tier, and status
 */

const { execSync } = require('child_process');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

// Parse account from log.txt
const logFile = fs.readFileSync('log.txt', 'utf-8');
const lines = logFile.split('\n').filter(l => l.trim() && !l.startsWith('#'));

console.log(`[*] Found ${lines.length} accounts in log.txt\n`);

// Process first account
const [username, password] = lines[0].trim().split(':').map(x => x.trim());

console.log(`[*] Processing account: ${username}\n`);

// Curl helper
function curl(url) {
    try {
        const cmd = `curl -s -i -x "${PROXY}" "${url}"`;
        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024 });
        const parts = output.split('\r\n\r\n');
        const body = parts.slice(1).join('\r\n\r\n');
        const status = parseInt(parts[0].match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
        const loc = parts[0].match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
        return { status, body, location: loc };
    } catch (e) {
        return { status: 0, body: '', location: null };
    }
}

// Login
console.log('[1] Logging in...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.location?.match(/state=([^&]+)/)?.[1] || '';

try {
    const data = Object.entries({username, password, action:'default'}).map(([k,v]) => `${k}=${v}`).join('&');
    const cmd = `curl -s -i -x "${PROXY}" -X POST -d "${data}" "https://login.portswigger.net/u/login${state ? '?state='+state : ''}"`;
    r = { status: 200, body: '', location: execSync(cmd, {encoding:'utf-8', shell: true, maxBuffer: 50*1024*1024}).match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim() };
} catch(e) {}

let url = r.location;
for (let i = 0; i < 15 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    r = curl(url);
    url = r.location;
    if (url?.includes('portswigger.net') && !url.includes('login')) break;
}

console.log('[✓] Logged in\n');

// Get subscription data from SPA
console.log('[2] Fetching subscription data...');
r = curl('https://portswigger.net/#/my-account');

const html = r.body;

// Extract subscription info
const data = {
    username: username,
    account_status: 'unknown',
    subscription: 'unknown',
    plan: 'unknown',
    license_type: 'unknown',
    expiry: null
};

// Look for subscription status text
if (html.includes('You do not have any subscriptions')) {
    data.subscription = 'None';
    data.plan = 'Free/Community';
} else {
    // Look for subscription types
    if (html.toLowerCase().includes('professional')) data.plan = 'Professional';
    if (html.toLowerCase().includes('team')) data.plan = 'Team';
    if (html.toLowerCase().includes('enterprise')) data.plan = 'Enterprise';
    if (html.toLowerCase().includes('community')) data.plan = 'Community';
}

// Look for expiry/renewal dates
const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g;
const dates = html.match(datePattern);
if (dates && dates.length > 0) {
    data.expiry = dates[0];
}

// Extract all text
let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Find subscription-related sentences
const sentences = text.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.toLowerCase().includes('subscription') || s.toLowerCase().includes('plan') || s.toLowerCase().includes('license'))
    .filter(s => s.length > 20)
    .slice(0, 5);

if (sentences.length > 0) {
    data.details = sentences;
}

console.log(`[✓] Extracted subscription data\n`);

// Display results
console.log('[3] Subscription Information:');
console.log('='.repeat(60));
console.log(`Username:  ${data.username}`);
console.log(`Plan:      ${data.plan}`);
console.log(`Subscription: ${data.subscription}`);
if (data.expiry) console.log(`Expiry:    ${data.expiry}`);
console.log('='.repeat(60));

if (data.details) {
    console.log('\nDetails:');
    data.details.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.substring(0, 100)}`);
    });
}

// Save results
fs.writeFileSync('subscription_result.json', JSON.stringify(data, null, 2));
console.log(`\n[✓] Saved: subscription_result.json`);
