#!/usr/bin/env node

/**
 * Extract subscription data from API endpoints (JSON)
 */

const { execSync } = require('child_process');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Account: ${username}\n`);

function curl(url, post = null) {
    try {
        let cmd = `curl -s -i -x "${PROXY}" "${url}"`;
        if (post) {
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            cmd = `curl -s -i -x "${PROXY}" -X POST -d "${data}" "${url}"`;
        }
        const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024 });
        const parts = output.split('\r\n\r\n');
        const body = parts.slice(1).join('\r\n\r\n');
        const loc = parts[0].match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();
        return { body, location: loc };
    } catch (e) {
        return { body: '', location: null };
    }
}

// Login
console.log('[1] Logging in...');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');
let state = r.location?.match(/state=([^&]+)/)?.[1] || '';

const loginData = Object.entries({username, password, action:'default'}).map(([k,v]) => `${k}=${v}`).join('&');
const loginCmd = `curl -s -i -x "${PROXY}" -X POST -d "${loginData}" "https://login.portswigger.net/u/login${state ? '?state='+state : ''}"`;

const loginOutput = execSync(loginCmd, {encoding:'utf-8', shell: true, maxBuffer: 50*1024*1024});
let url = loginOutput.match(/[Ll]ocation:\s*([^\r\n]+)/)?.[1]?.trim();

for (let i = 0; i < 15 && url; i++) {
    if (!url.startsWith('http')) url = 'https://login.portswigger.net' + url;
    r = curl(url);
    url = r.location;
    if (url?.includes('portswigger.net') && !url.includes('login')) break;
}

console.log('[✓] Logged in\n');

// Try API endpoints
console.log('[2] Testing API endpoints:\n');

const apiEndpoints = [
    'https://portswigger.net/api/subscription',
    'https://portswigger.net/api/subscriptions',
    'https://portswigger.net/api/account',
    'https://portswigger.net/api/user/account',
    'https://portswigger.net/api/user/subscription',
    'https://portswigger.net/api/me',
];

let bestData = null;

apiEndpoints.forEach(endpoint => {
    r = curl(endpoint);
    console.log(`[${endpoint.split('/').pop()}]`);
    console.log(`  Size: ${r.body.length} bytes`);

    // Try to parse as JSON
    try {
        // Find JSON in response (might be in HTML)
        const jsonMatch = r.body.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[0]);
            console.log(`  ✓ Valid JSON found!`);
            console.log(`  Content: ${JSON.stringify(json).substring(0, 200)}`);

            if (!bestData || r.body.length > bestData.size) {
                bestData = { endpoint, json, raw: r.body, size: r.body.length };
            }
        } else {
            console.log(`  - No JSON found`);
        }
    } catch (e) {
        console.log(`  - Not JSON: ${e.message.substring(0, 50)}`);
    }
    console.log();
});

console.log('='.repeat(80));

if (bestData) {
    console.log(`\n[✓] Best API: ${bestData.endpoint}`);
    console.log('\nFull JSON response:');
    console.log(JSON.stringify(bestData.json, null, 2));

    fs.writeFileSync('api_subscription_data.json', JSON.stringify(bestData.json, null, 2));
    console.log(`\n[✓] Saved: api_subscription_data.json`);
} else {
    console.log(`\n[-] No JSON data found in any endpoint`);
}
