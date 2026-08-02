#!/usr/bin/env node

const crypto = require('crypto');

function generatePKCE() {
    // Generate random 43-128 character code_verifier
    const codeVerifier = crypto
        .randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    // Generate code_challenge by SHA256 hashing code_verifier
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
}

const pkce = generatePKCE();

console.log('Generated PKCE pair:');
console.log('');
console.log(`code_verifier:  ${pkce.codeVerifier}`);
console.log(`code_challenge: ${pkce.codeChallenge}`);
console.log('');
console.log('Use these in your OAuth flow:');
console.log(`1. In authorize URL, use: code_challenge=${pkce.codeChallenge}&code_challenge_method=S256`);
console.log(`2. When exchanging the code at /signin-oidc, use: code_verifier=${pkce.codeVerifier}`);
