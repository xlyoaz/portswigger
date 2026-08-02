#!/usr/bin/env node

/**
 * Check what's in the saved subscription_page.html
 */

const fs = require('fs');

const htmlFile = 'subscription_page.html';

if (!fs.existsSync(htmlFile)) {
    console.log('[E] File not found: ' + htmlFile);
    process.exit(1);
}

const html = fs.readFileSync(htmlFile, 'utf-8');

console.log(`[*] File size: ${html.length} bytes\n`);

// Check if it's a redirect
if (html.includes('<form') || html.includes('action=')) {
    console.log('[!] Looks like a form/redirect page');
    const formMatch = html.match(/<form[^>]*>([\s\S]*?)<\/form>/);
    if (formMatch) {
        console.log('[*] Form content:');
        console.log(formMatch[0].substring(0, 500));
    }
}

// Check for actual content
const textOnly = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

console.log(`\n[*] Visible text (first 1000 chars):`);
console.log(`${textOnly.substring(0, 1000)}\n`);

// Check for specific keywords
const keywords = ['subscription', 'plan', 'license', 'You do not have', 'burp', 'professional', 'team'];
const found = keywords.filter(kw => html.toLowerCase().includes(kw.toLowerCase()));

if (found.length > 0) {
    console.log(`[✓] Found keywords: ${found.join(', ')}`);
} else {
    console.log(`[!] No subscription keywords found`);
}

// Save text version
fs.writeFileSync('subscription_page_text.txt', textOnly);
console.log(`\n[✓] Saved: subscription_page_text.txt`);
