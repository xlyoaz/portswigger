#!/usr/bin/env node

const fs = require('fs');

const html = fs.readFileSync('error_page_full.html', 'utf-8');

// Look for common error message patterns
const patterns = [
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<h2[^>]*>([^<]+)<\/h2>/i,
    /error[^<]*:\s*([^<]+)/i,
    /<p[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/p>/i,
    /<div[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/div>/i,
    /<span[^>]*>([^<]*error[^<]*)<\/span>/i,
];

console.log('Searching for error message in error_page_full.html...\n');

let found = false;
for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
        console.log(`Found: ${match[1].trim()}`);
        found = true;
    }
}

if (!found) {
    console.log('No error message found in standard locations.');
    console.log('\nSearching for any text content...\n');

    // Extract all text between tags
    const textMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (textMatch) {
        const bodyText = textMatch[1]
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        console.log(bodyText.substring(0, 500));
    }
}
