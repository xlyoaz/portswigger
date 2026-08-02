#!/usr/bin/env node

/**
 * Final HTTP-only subscription extractor
 * Tries all endpoints and all data formats
 */

const { execSync } = require('child_process');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Test account: ${username}\n`);

// Curl helper
function curl(url, post = null) {
    try {
        let cmd = `curl -s -i -x "${PROXY}" "${url}"`;
        if (post) {
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            cmd = `curl -s -i -x "${PROXY}" -X POST -d "${data}" "${url}"`;
        }

        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024 });
        const [headers, ...bodyParts] = output.split('\r\n\r\n');
        const body = bodyParts.join('\r\n\r\n');
        const status = parseInt(headers.match(/HTTP\/\d\.\d (\d+)/)?.[1] || 0);
        const loc = headers.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();

        return { status, body, location: loc };
    } catch (e) {
        return { status: 0, body: '', location: null };
    }
}

// Login
console.log('[1] Login...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
console.log(`  Authorize: ${r.status}`);

let state = r.location?.match(/state=([^&]+)/)?.[1] || '';

r = curl(`https://login.portswigger.net/u/login${state ? '?state='+state : ''}`, {username, password, action:'default'});
console.log(`  Login: ${r.status}`);

let url = r.location;
for (let i = 0; i < 15 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    r = curl(url);
    console.log(`  Redirect ${i+1}: ${r.status}`);
    url = r.location;
    if (url?.includes('portswigger.net') && !url.includes('login')) break;
}

console.log(`[✓] Login done\n`);

// Try multiple endpoints
console.log('[2] Testing endpoints for subscription data:');
console.log('='.repeat(80));

const endpoints = [
    { name: '/users/youraccount', url: 'https://portswigger.net/users/youraccount' },
    { name: '#/my-account SPA', url: 'https://portswigger.net/#/my-account' },
    { name: '#/subscriptions SPA', url: 'https://portswigger.net/#/subscriptions' },
    { name: '/api/subscription', url: 'https://portswigger.net/api/subscription' },
    { name: '/api/subscriptions', url: 'https://portswigger.net/api/subscriptions' },
    { name: '/api/account', url: 'https://portswigger.net/api/account' },
    { name: '/api/user/account', url: 'https://portswigger.net/api/user/account' },
];

let bestData = { endpoint: '', size: 0, keywords: [], data: '' };

endpoints.forEach(ep => {
    r = curl(ep.url);
    console.log(`\n[${ep.name}]`);
    console.log(`  Status: ${r.status}, Size: ${r.body.length} bytes`);

    // Look for keywords
    const keywords = ['subscription', 'plan', 'license', 'You do not have', 'professional', 'team', 'enterprise'];
    const found = keywords.filter(kw => r.body.toLowerCase().includes(kw.toLowerCase()));
    if (found.length > 0) {
        console.log(`  ✓ Keywords: ${found.join(', ')}`);
    }

    // Look for JSON
    const jsonMatches = r.body.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
    const jsonWithData = jsonMatches.filter(j => keywords.some(kw => j.toLowerCase().includes(kw))).length;
    if (jsonWithData > 0) {
        console.log(`  ✓ JSON objects with subscription data: ${jsonWithData}`);
    }

    // Track best endpoint
    if (found.length > bestData.keywords.length || (found.length === bestData.keywords.length && r.body.length > bestData.size)) {
        bestData = { endpoint: ep.name, size: r.body.length, keywords: found, data: r.body };
    }
});

console.log(`\n${'='.repeat(80)}`);
console.log(`[✓] Best endpoint: ${bestData.endpoint} (${bestData.size} bytes, keywords: ${bestData.keywords.join(', ')})\n`);

// Extract from best endpoint
console.log('[3] Extracting data from best endpoint:');
console.log('='.repeat(80));

const html = bestData.data;

// Remove scripts/styles
let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();

console.log(`\nVisible text (first 800 chars):`);
console.log(text.substring(0, 800));

// Extract sentences with subscription info
const keywords = ['subscription', 'plan', 'license', 'account', 'you do not have'];
const sentences = text.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => keywords.some(kw => s.toLowerCase().includes(kw)))
    .filter(s => s.length > 20)
    .slice(0, 10);

if (sentences.length > 0) {
    console.log(`\n[✓] Relevant sentences (${sentences.length}):`);
    sentences.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.substring(0, 120)}`);
    });
}

// Save results
fs.writeFileSync('final_subscription_data.txt', text);
fs.writeFileSync('final_subscription_page.html', html);

console.log(`\n[✓] Saved:`);
console.log(`  - final_subscription_data.txt`);
console.log(`  - final_subscription_page.html`);

console.log(`\n${'='.repeat(80)}`);
console.log('[*] Extraction completed');
