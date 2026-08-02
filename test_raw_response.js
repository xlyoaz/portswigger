#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

// STEP 1: Get state
console.log('[1] Getting state...');
let cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"`;
let output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
let state = output.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log(`Got state: ${state.substring(0, 30)}...\n`);

// STEP 2: Login
console.log('[2] Logging in...');
const tempFile = path.join(os.tmpdir(), `login_${Date.now()}.txt`);
fs.writeFileSync(tempFile, `username=${username}&password=${password}&action=default&state=${state}`);
cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 -X POST -d @"${tempFile}" "https://login.portswigger.net/u/login"`;
output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });
fs.unlinkSync(tempFile);

const locationMatch = output.match(/[Ll]ocation:\s*([^\r\n]+)/);
const loginLocation = locationMatch ? locationMatch[1].trim() : null;
console.log(`Login redirect: ${loginLocation?.substring(0, 60) || '(none)'}\n`);

// STEP 3: Licenses page - SHOW RAW RESPONSE
console.log('[3] Fetching licenses page - RAW RESPONSE:');
console.log('='.repeat(70));
cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 20 "https://portswigger.net/users/youraccount/licenses"`;
output = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 35000 });

// Show first 1000 characters of raw response
console.log(output.substring(0, 1000));
console.log('\n' + '='.repeat(70));
console.log('\nRaw response saved to: debug_raw.txt');
fs.writeFileSync('debug_raw.txt', output);

// Parse it manually
const lines = output.split('\r\n');
console.log('\nParsing headers:');
for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (lines[i].includes('location') || lines[i].includes('Location') || lines[i].includes('HTTP')) {
        console.log(`  Line ${i}: ${lines[i]}`);
    }
}

try { fs.unlinkSync(COOKIE_JAR); } catch {}
