#!/usr/bin/env node

/**
 * Extract all lines containing a keyword from subscription page
 */

const { execSync } = require('child_process');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';

// Parse account
const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Account: ${username}\n`);

// Curl helper
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

const loginData = Object.entries({username, password, action:'default'})
    .map(([k,v]) => `${k}=${v}`).join('&');
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

// Get subscription page
console.log('[2] Fetching subscription page...');
r = curl('https://portswigger.net/#/my-account');
console.log('[✓] Page fetched\n');

const html = r.body;

// Extract all lines containing keyword
console.log('[3] Extracting lines with keyword:\n');
console.log('='.repeat(80));

const keywords = ['community', 'professional', 'team', 'enterprise', 'subscription', 'plan'];

keywords.forEach(keyword => {
    console.log(`\n[${keyword.toUpperCase()}]`);
    console.log('-'.repeat(40));

    // Create regex to find lines containing the keyword (case insensitive)
    const lines = html.split('\n').filter(line =>
        line.toLowerCase().includes(keyword)
    );

    if (lines.length === 0) {
        console.log('  (not found)');
        return;
    }

    // Clean up and display each line
    lines.slice(0, 10).forEach((line, i) => {
        // Remove HTML tags
        let clean = line
            .replace(/<[^>]+>/g, '')
            .replace(/&[a-z]+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (clean.length > 5) {
            console.log(`  ${i+1}. ${clean.substring(0, 120)}`);
        }
    });

    if (lines.length > 10) {
        console.log(`  ... ve ${lines.length - 10} daha`);
    }
});

console.log(`\n${'='.repeat(80)}`);

// Save full raw HTML
fs.writeFileSync('page_raw.html', html);
console.log(`\n[✓] Full HTML saved to: page_raw.html`);

// Save extracted keywords
const keywordData = {};
keywords.forEach(keyword => {
    keywordData[keyword] = html
        .split('\n')
        .filter(line => line.toLowerCase().includes(keyword))
        .map(line => line
            .replace(/<[^>]+>/g, '')
            .replace(/&[a-z]+;/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter(line => line.length > 5)
        .slice(0, 10);
});

fs.writeFileSync('keyword_lines.json', JSON.stringify(keywordData, null, 2));
console.log('[✓] Keyword lines saved to: keyword_lines.json');
