#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const COOKIE_JAR = path.join(os.tmpdir(), `test_${Date.now()}.txt`);

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

function parseResponse(output) {
    console.log('[PARSE] Raw output length:', output.length);
    console.log('[PARSE] First 100 chars:', JSON.stringify(output.substring(0, 100)));

    const parts = output.split('\r\n\r\n');
    console.log('[PARSE] Split into', parts.length, 'parts');
    console.log('[PARSE] Part[0] length:', parts[0].length, 'starts with:', parts[0].substring(0, 50));
    if (parts[1]) console.log('[PARSE] Part[1] length:', parts[1].length, 'starts with:', parts[1].substring(0, 50));

    let headers = parts[0];
    let body = parts.slice(1).join('\r\n\r\n');

    console.log('[PARSE] Initial headers starts with:', headers.substring(0, 30));
    console.log('[PARSE] Initial body starts with:', body.substring(0, 50));

    // Handle proxy wrapping: actual HTTP response in body
    if (body && body.startsWith('HTTP/')) {
        console.log('[PARSE] Detected proxy wrapping, unwrapping...');
        const bodyParts = body.split('\r\n\r\n');
        console.log('[PARSE] Body split into', bodyParts.length, 'parts');
        headers = bodyParts[0];
        body = bodyParts.slice(1).join('\r\n\r\n');
        console.log('[PARSE] After unwrap - headers starts with:', headers.substring(0, 50));
        console.log('[PARSE] After unwrap - body starts with:', body.substring(0, 50));
    }

    const statusMatch = headers.match(/HTTP\/\d\.\d (\d+)/);
    console.log('[PARSE] Status match:', statusMatch ? statusMatch[1] : 'NO MATCH');

    const locationMatch = headers.match(/[Ll]ocation:\s*([^\r\n]+)/);
    console.log('[PARSE] Location match:', locationMatch ? locationMatch[1] : 'NO MATCH');

    const status = parseInt(statusMatch?.[1] || 0);
    const location = locationMatch?.[1]?.trim();

    console.log('[PARSE] Final - Status:', status, 'Location:', location);
    console.log('---');

    return { status, body, location };
}

// Step 1: Authorize
console.log('[1] Authorize');
let cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 30 "https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"`;
const authOutput = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
let r = parseResponse(authOutput);

let state = r.body.match(/state=([^&\s'"]+)/)?.[1] || '';
console.log('Got state:', state.substring(0, 30) + '...\n');

// Step 2: Login
console.log('[2] Login');
const tempFile = path.join(os.tmpdir(), `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`);
const data = `username=${username}&password=${password}&action=default&state=${state}`;
fs.writeFileSync(tempFile, data);

cmd = `curl -s -i -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -x "${PROXY}" --connect-timeout 10 --max-time 30 -X POST -d @"${tempFile}" "https://login.portswigger.net/u/login"`;
const loginOutput = execSync(cmd, { encoding: 'utf-8', shell: true, maxBuffer: 50*1024*1024, timeout: 40000 });
r = parseResponse(loginOutput);

fs.unlinkSync(tempFile);
fs.unlinkSync(COOKIE_JAR);
