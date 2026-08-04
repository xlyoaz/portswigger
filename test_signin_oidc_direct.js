const https = require('https');
const http = require('http');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const fs = require('fs');
const cheerio = require('cheerio');

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

async function testDirectSigninOidc(username, password) {
    const cookies = {};

    try {
        console.log('🔐 OAUTH FLOW - DIRECT /signin-oidc APPROACH\n');

        // STEP 1: Authorize endpoint'ine git
        console.log('1️⃣  /authorize endpoint\'ine GET...');
        const authorizeUrl = `https://login.portswigger.net/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&response_mode=query`;

        let res = await makeRequest({ url: authorizeUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}`);

        let state = res.body.match(/state=([^&\s'"]+)/)?.[1];
        if (!state) {
            throw new Error('State parametresi çıkarılamadı!');
        }
        console.log(`   ✓ State: ${state.substring(0, 50)}...\n`);

        // STEP 2: Login POST
        console.log('2️⃣  Login POST yapılıyor...');
        console.log(`   Username: ${username}`);
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
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        // STEP 3: /authorize/resume'ı takip et
        console.log('3️⃣  /authorize/resume redirect\'ini takip ediliyor...');
        let redirectUrl = res.location;
        console.log(`   Location: ${redirectUrl}`);

        if (!redirectUrl.startsWith('http')) {
            redirectUrl = 'https://login.portswigger.net' + redirectUrl;
        }

        res = await makeRequest({ url: redirectUrl, method: 'GET' }, null, cookies);
        console.log(`   Status: ${res.status}`);
        console.log(`   Location header: ${res.location}\n`);

        // STEP 4: DEGISIKLIK - /signin-oidc direkt GET (query string olmadan)
        console.log('4️⃣  /signin-oidc direkt GET (query string olmadan)...');
        res = await makeRequest(
            { url: 'https://portswigger.net/signin-oidc', method: 'GET' },
            null,
            cookies
        );
        console.log(`   Status: ${res.status}`);
        console.log(`   Body length: ${res.body.length}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        // STEP 5: Form'u parse et
        console.log('5️⃣  Form parse ediliyor...');
        const $ = cheerio.load(res.body);
        const form = $('form').first();

        if (form.length === 0) {
            console.log('   ❌ Form bulunamadı!');
            console.log(`   Response ilk 800 char:\n${res.body.substring(0, 800)}\n`);

            // HTML'i dosyaya kaydet debug için
            fs.writeFileSync('signin_oidc_direct_response.html', res.body);
            console.log('   📝 Tam response kaydedildi: signin_oidc_direct_response.html\n');
            return;
        }

        let formAction = form.attr('action');
        if (!formAction) formAction = '/signin-oidc';
        const formMethod = (form.attr('method') || 'GET').toUpperCase();

        const formData = {};
        form.find('input').each((i, elem) => {
            const name = $(elem).attr('name');
            const value = $(elem).attr('value');
            if (name) formData[name] = value || '';
        });

        console.log(`   ✅ Form bulundu!`);
        console.log(`   Form action: ${formAction}`);
        console.log(`   Form method: ${formMethod}`);
        console.log(`   Form fields: ${Object.keys(formData).length}`);
        Object.keys(formData).slice(0, 5).forEach(k => {
            const val = formData[k];
            console.log(`      • ${k} = ${val ? val.substring(0, 60) + (val.length > 60 ? '...' : '') : '(boş)'}`);
        });
        console.log();

        // STEP 6: Form'u POST et
        console.log('6️⃣  Form POST ediliyor...');
        let targetUrl = formAction;
        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://portswigger.net' + targetUrl;
        }

        const postData = urlencode(formData);
        res = await makeRequest(
            {
                url: targetUrl,
                method: formMethod,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': postData.length
                }
            },
            postData,
            cookies
        );
        console.log(`   Status: ${res.status}`);
        console.log(`   Location: ${res.location || '(none)'}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        // STEP 7: Son redirect'leri takip et
        if (res.location) {
            console.log('7️⃣  Final redirect\'leri takip ediliyor...');
            for (let i = 0; i < 5 && res.location; i++) {
                let nextUrl = res.location;
                if (!nextUrl.startsWith('http')) nextUrl = 'https://portswigger.net' + nextUrl;

                console.log(`   ${i + 1}. GET ${nextUrl}`);
                res = await makeRequest({ url: nextUrl, method: 'GET' }, null, cookies);
                console.log(`      ← ${res.status}`);

                if (!res.location) break;
            }
            console.log();
        }

        // STEP 8: Licenses sayfasını al
        console.log('8️⃣  Licenses sayfası alınıyor...');
        res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            null,
            cookies
        );

        console.log(`   Status: ${res.status}`);
        console.log(`   Body length: ${res.body.length}`);
        console.log(`   Cookies: ${Object.keys(cookies).length}\n`);

        // STEP 9: Sonuç
        console.log('✅ BAŞARILI!\n');
        fs.writeFileSync('licenses_direct_response.html', res.body);
        console.log('📄 HTML kaydedildi: licenses_direct_response.html\n');

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
        }

    } catch (error) {
        console.error('\n❌ HATA:', error.message);
        console.error(error.stack);
    }
}

// Çalıştır
testDirectSigninOidc('y5571702@gmail.com', 'Xlyoaz60863131..');
