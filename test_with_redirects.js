#!/usr/bin/env node

/**
 * Test with curl's automatic redirect following (-L flag)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `portswigger_test_${Date.now()}.txt`);

const logFile = fs.readFileSync('log.txt', 'utf-8');
const [username, password] = logFile.split('\n')[0].trim().split(':').map(x => x.trim());

console.log(`[*] Account: ${username}\n`);

function curl(url, post = null) {
    try {
        let cmd;
        const cookies = `-b "${COOKIE_JAR}" -c "${COOKIE_JAR}"`;

        if (post) {
            const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
            const data = Object.entries(post).map(([k,v]) => `${k}=${v}`).join('&');
            fs.writeFileSync(tempFile, data);
            cmd = `curl -s -i -L ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "${url}"`;
            try {
                const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
                fs.unlinkSync(tempFile);
                const lines = output.split('\n');
                const body = lines.slice(1).join('\n');
                return { body };
            } catch (e) {
                try { fs.unlinkSync(tempFile); } catch {}
                throw e;
            }
        } else {
            cmd = `curl -s -i -L ${cookies} -x "${PROXY}" --connect-timeout 10 --max-time 30 "${url}"`;
            const output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
            const lines = output.split('\n');
            const body = lines.slice(1).join('\n');
            return { body };
        }
    } catch (e) {
        console.error(`[!] Error: ${e.message.substring(0, 80)}`);
        return { body: '' };
    }
}

console.log('[1] Step 1: Authorize');
let r = curl('https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query');

let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`    State: ${state.substring(0, 30)}...`);

if (!state) {
    console.error('[!] State not found');
    fs.writeFileSync('debug_step1.html', r.body);
    process.exit(1);
}

console.log('\n[2] Step 2: Login');
r = curl(`https://login.portswigger.net/u/login?state=${state}`, {
    username: username,
    password: password,
    action: 'default'
});

if (r.body.length > 5000) {
    console.log(`    [✓] Response size: ${r.body.length} bytes`);
} else {
    console.log(`    [!] Small response: ${r.body.length} bytes`);
}

// Check for keywords
if (r.body.includes('You do not have any subscriptions')) {
    console.log('    [✓] Found: "You do not have any subscriptions"');
}
if (r.body.toLowerCase().includes('professional')) {
    console.log('    [✓] Found: "professional"');
}
if (r.body.toLowerCase().includes('team')) {
    console.log('    [✓] Found: "team"');
}
if (r.body.toLowerCase().includes('enterprise')) {
    console.log('    [✓] Found: "enterprise"');
}
if (r.body.toLowerCase().includes('community')) {
    console.log('    [✓] Found: "community"');
}

if (r.body.toLowerCase().includes('error') || r.body.toLowerCase().includes('invalid')) {
    console.log('    [!] Response contains error');
    fs.writeFileSync('debug_login_error.html', r.body);
    console.log('    Saved to: debug_login_error.html');
    process.exit(1);
}

console.log('\n[3] Step 3: Fetch account page');
r = curl('https://portswigger.net/#/my-account');
console.log(`    Page size: ${r.body.length} bytes`);

// Extract plan
let plan = 'Unknown';
if (r.body.includes('You do not have any subscriptions')) {
    plan = 'Free/Community';
    console.log('    [✓] Plan: Free/Community');
} else {
    if (r.body.toLowerCase().includes('enterprise')) {
        plan = 'Enterprise';
        console.log('    [✓] Plan: Enterprise');
    } else if (r.body.toLowerCase().includes('team')) {
        plan = 'Team';
        console.log('    [✓] Plan: Team');
    } else if (r.body.toLowerCase().includes('professional')) {
        plan = 'Professional';
        console.log('    [✓] Plan: Professional');
    } else if (r.body.toLowerCase().includes('community')) {
        plan = 'Community';
        console.log('    [✓] Plan: Community');
    } else {
        console.log('    [?] Subscription active but plan unknown');
    }
}

console.log('\n' + '='.repeat(60));
console.log(`[✓] SUCCESS: ${username} = ${plan}`);
console.log('='.repeat(60) + '\n');

try { fs.unlinkSync(COOKIE_JAR); } catch {}
