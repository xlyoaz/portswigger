#!/usr/bin/env node

/**
 * OAuth extraction using Puppeteer headless browser
 * This properly maintains browser state (cookies, localStorage) needed for PKCE flow
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const username = 'y5571702@gmail.com';
const password = 'Xlyoaz60863131..';

(async () => {
    console.log('Starting Puppeteer browser...');

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            `--proxy-server=http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029`,
        ]
    });

    try {
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1280, height: 720 });

        console.log('\n[1] Navigate to PortSwigger login...');
        await page.goto('https://portswigger.net/', { waitUntil: 'networkidle2', timeout: 30000 });

        // Click login button
        await page.click('a[href="/users"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        console.log('[2] Entering credentials...');
        // Enter username
        await page.type('input[name="username"]', username, { delay: 50 });
        // Enter password
        await page.type('input[name="password"]', password, { delay: 50 });
        // Submit form
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);

        console.log('[3] Following OAuth redirects...');
        // Wait for redirects to complete
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

        console.log('[4] Navigating to licenses page...');
        await page.goto('https://portswigger.net/users/youraccount/licenses', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Get the page content
        const content = await page.content();

        console.log('[5] Checking page content...');

        if (content.includes('You do not have any subscriptions')) {
            console.log('\n[✓] SUCCESS - Free account detected');
        } else if (content.includes('Your Subscriptions')) {
            console.log('\n[✓] SUCCESS - Subscriptions page loaded');
        } else if (content.includes('error') || content.includes('Error')) {
            console.log('\n[✗] Error page loaded');
        } else {
            console.log('\n[?] Unknown page content');
        }

        // Save response
        fs.writeFileSync('browser_licenses_response.html', content);
        console.log('\nPage saved to: browser_licenses_response.html');

        // Show first 500 chars
        console.log('\nFirst 500 chars:');
        console.log(content.substring(0, 500));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
})();
