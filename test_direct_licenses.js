const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const CODE_CHALLENGE = 'BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk';

const httpsAgent = new HttpsProxyAgent(PROXY);
const httpAgent = new HttpProxyAgent(PROXY);

function setCookie(setCookieHeader, cookies) {
    if (!setCookieHeader) return;
    const parts = setCookieHeader.split(';')[0].split('=');
    if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
    }
}

function getCookieString(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function makeRequest(options, postData = null, cookies = {}) {
    return new Promise((resolve, reject) => {
        const reqUrl = url.parse(options.url);
        const reqOptions = {
            hostname: reqUrl.hostname,
            port: reqUrl.port,
            path: reqUrl.path,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': getCookieString(cookies),
                ...options.headers
            },
            agent: reqUrl.protocol === 'https:' ? httpsAgent : httpAgent,
            timeout: 30000
        };

        const protocol = reqUrl.protocol === 'https:' ? https : http;
        const req = protocol.request(reqOptions, (res) => {
            let body = '';

            const setCookieHeader = res.headers['set-cookie'];
            if (setCookieHeader) {
                if (Array.isArray(setCookieHeader)) {
                    setCookieHeader.forEach(h => setCookie(h, cookies));
                } else {
                    setCookie(setCookieHeader, cookies);
                }
            }

            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body,
                    location: res.headers.location
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (postData) req.write(postData);
        req.end();
    });
}

function urlencode(obj) {
    return Object.entries(obj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

async function testDirectAccess(username, password) {
    const cookies = {};

    try {
        console.log('🔐 OAUTH - DIRECT LICENSES ACCESS TEST\n');

        // STEP 1: Authorize
        console.log('1️⃣  /authorize endpoint\'ine GET...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;

        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) throw new Error('State parametresi çıkarılamadı!');

        // STEP 2: Login POST
        console.log('2️⃣  Login POST yapılıyor...');
        const loginData = urlencode({ username, password, action: 'default', state });

        res = await makeRequest(
            {
                url: 'https://login.portswigger.net/u/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': loginData.length
                }
            },
            loginData,
            cookies
        );
        console.log(`   Status: ${res.status}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}`);
        console.log(`   Cookies list: ${Object.keys(cookies).join(', ')}\n`);

        // STEP 3: SKIP REDIRECTS - DIREKT LICENSES SAYFASİNA GİT
        console.log('3️⃣  Licenses sayfasına DIREKT erişiliyor (redirects skip)...');
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );

        console.log(`   Status: ${res.status}`);
        console.log(`   Body length: ${res.body.length}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        // STEP 4: Sonuç
        if (res.status === 200) {
            console.log('✅ Licenses sayfası alındı!\n');
            fs.writeFileSync('licenses_direct_access.html', res.body);
            console.log('📄 HTML kaydedildi: licenses_direct_access.html\n');

            // Plan arama
            console.log('📋 Plan bilgisi araniyor:');
            const html = res.body.toLowerCase();

            const plans = [
                { name: 'Professional', keywords: ['professional', 'burp suite professional'] },
                { name: 'Team', keywords: ['team', 'burp suite team'] },
                { name: 'Enterprise', keywords: ['enterprise', 'burp suite enterprise'] },
                { name: 'Community', keywords: ['community'] },
                { name: 'Free', keywords: ['no subscriptions', 'you do not have'] }
            ];

            let foundPlan = false;
            plans.forEach(plan => {
                const found = plan.keywords.some(kw => html.includes(kw));
                if (found) {
                    foundPlan = true;
                    console.log(`   ✅ ${plan.name} BULUNDU!`);
                }
            });

            if (!foundPlan) {
                console.log('   ❌ Hiçbir plan bilgisi bulunamadı');
                console.log('\n   First 1000 chars:');
                console.log(res.body.substring(0, 1000));
            }
        } else if (res.status === 302) {
            console.log(`❌ Licenses sayfası 302 redirect dönüyor`);
            console.log(`   Location: ${res.location}\n`);

            // Redirect'i takip et
            console.log('4️⃣  Redirect takip ediliyor...');
            let redirectUrl = res.location;
            if (!redirectUrl.startsWith('http')) redirectUrl = 'https://portswigger.net' + redirectUrl;

            res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
            console.log(`   Status: ${res.status}`);
            console.log(`   Body length: ${res.body.length}\n`);

            fs.writeFileSync('licenses_redirect_response.html', res.body);
            console.log('📄 HTML kaydedildi: licenses_redirect_response.html\n');

            // Plan arama
            console.log('📋 Plan bilgisi araniyor (redirect response\'ta):');
            const html = res.body.toLowerCase();

            const plans = [
                { name: 'Professional', keywords: ['professional', 'burp suite professional'] },
                { name: 'Team', keywords: ['team', 'burp suite team'] },
                { name: 'Enterprise', keywords: ['enterprise', 'burp suite enterprise'] },
                { name: 'Community', keywords: ['community'] },
                { name: 'Free', keywords: ['no subscriptions', 'you do not have'] }
            ];

            let foundPlan = false;
            plans.forEach(plan => {
                const found = plan.keywords.some(kw => html.includes(kw));
                if (found) {
                    foundPlan = true;
                    console.log(`   ✅ ${plan.name} BULUNDU!`);
                }
            });

            if (!foundPlan) {
                console.log('   ❌ Hiçbir plan bilgisi bulunamadı');
            }
        } else {
            console.log(`❌ Licenses sayfası ${res.status} dönüyor\n`);
            console.log('Response:');
            console.log(res.body.substring(0, 500));
        }

    } catch (error) {
        console.error('\n❌ HATA:', error.message);
        console.error(error.stack);
    }
}

testDirectAccess('y5571702@gmail.com', 'Xlyoaz60863131..');
