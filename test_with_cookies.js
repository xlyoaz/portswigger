const https = require('https');
const url = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

const PROXY = 'http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029';
const httpsAgent = new HttpsProxyAgent(PROXY);

// Cookies JSON'ından key=value string'ine çevir
function cookiesFromJSON(cookiesJSON) {
    const cookies = {};
    cookiesJSON.forEach(cookie => {
        cookies[cookie.name] = cookie.value;
    });
    return cookies;
}

function getCookieString(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function makeRequest(options, cookies = {}) {
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
            agent: httpsAgent,
            timeout: 30000
        };

        const req = https.request(reqOptions, (res) => {
            let body = '';

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

        req.end();
    });
}

async function testWithCookies() {
    try {
        console.log('🍪 COOKIES İLE LICENSES SAYFASINA ERIŞIM\n');

        // User'ın cookies'leri
        const cookiesJSON = [
            {
                "domain": ".portswigger.net",
                "expirationDate": 1785893160.636001,
                "hostOnly": false,
                "httpOnly": true,
                "name": "SessionId",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "CfDJ8GZV8PmhXiFBpGxIuC0LDmnD2OGwxgWh1WDZDzO9YwT7r9qgaJxv5abtVVG3Q7cDv2qqu0i61eI5zXpUYVfu8tw5TWeD7%2F1hgxK3pbf75jevZCbYMIwKnEh2cs1SZ4qUNIrnd%2BNLjI%2BiWpsBNHvQwYv%2B2PkcA1p%2BRU4bx%2FwYpW1R"
            },
            {
                "domain": "portswigger.net",
                "expirationDate": 1817385648,
                "hostOnly": true,
                "httpOnly": false,
                "name": "sa-user-id-v4",
                "path": "/",
                "sameSite": null,
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "s%253ACiQwMTlmYjRjOC05OGNmLTdiMTctYWZjZC00YWY5MWRlNTI1MTgQBBoERU1FQSBj.80iiqDTyJiP2ObM1YiQlCwrNO0WF87Ti32HojKA%252F3iA"
            },
            {
                "domain": "portswigger.net",
                "hostOnly": true,
                "httpOnly": true,
                "name": ".AspNetCore.CookiesC2",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": true,
                "storeId": null,
                "value": "KvMkwmUOByW32zf4NkEzv7-OufKZKubTXQm5GjFMlwoeP6xZjfJDf9iAuUY5dh2afpZxMKLAiwNK68VYfQrPA2dc5-s9QXZXgZiJBTfGpUuPyICyeZRIlLskIgVgH-UFbfxP1v-io0fuJmN1hteSCmKKgeL7sr6C0mZL_IfDZOg"
            },
            {
                "domain": "portswigger.net",
                "hostOnly": true,
                "httpOnly": true,
                "name": ".AspNetCore.Cookies",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": true,
                "storeId": null,
                "value": "chunks-2"
            },
            {
                "domain": "portswigger.net",
                "expirationDate": 1817385648,
                "hostOnly": true,
                "httpOnly": false,
                "name": "sa-user-id-v3",
                "path": "/",
                "sameSite": null,
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "s%253AAQAKIM3blucrHx-oYMn_xpaiPq0EqNb85TIJA_NHk5Lb_CYAEHwYBCD58K7TBjABOgRROBtLQgRfUqb2.Kv952wvuGN0Bzl4Dhn7mnYsVhEbobeNFv7upvkNtc1w"
            },
            {
                "domain": "portswigger.net",
                "hostOnly": true,
                "httpOnly": true,
                "name": ".AspNetCore.CookiesC1",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": true,
                "storeId": null,
                "value": "CfDJ8GZV8PmhXiFBpGxIuC0LDmm08TRjcHfRbF4iTOteNGJcpqECYt7tAQaPdPndz6vZMNgYct0ERkdshFHKqUTy1ZpTYaorEriq5ik8VOnHKdgt0BfyMl8v8Vak2izBvXmTvm8dCVzJJT4NT45i6qtdRDuqu4uKyCoTzgvNFU15ZvjiWUr4DXEsmxtfd6ZbpHhLIlEmrKJMx4Ufj6U95YGV0DzS_BMe40T7YncFaMMghe4Dk-rvEiaPm8JVjT7hm51jf80PfGVYoGXaIoRCrW0qbC0gYby0WTzQjIHOCii0Fao_hJ9E-vMIh3k-d-jmbaMoHHWvW7UAFRIe312dwmfVf39V6OSANQuEbVYKy2sLHJKx6rhNPjuHDALbgV0byaX18I_qVWEF3Cy4bQxQk1QYO9lforsfpuAzE-igfjWN2dhiG6nEvrDarl0w4BILPx_gWxD_jRk-ONaQDEv4gxGDYQ79UNbQ-B_NnZXpi0fioXMcYDagoCwE2JGUFew9aMyDIQeuviB1N5g5_QaswiaJwIur5ZoGmoWZjLS94sZbk7NhkTdDE_OQTuaYA4nfJwBPFu1Z3HKnbK0ftVfz_FNoK9W7rzsN4HFLpur7zdLO42ERzmbtNvi-3euUXk1YITP3l8FqyzMuvHsG74BBv_rqtKS5i5VmXUnekkVsnMWk2DISWJkRn6tznc5B9UBnki7mGbLhU1aLDYmEn6w9sfp5eVqPj7gMZH5NnRtxDVVY9gNq54eu1jvsHupHX4xMKHB6p-6u4jNOB4zXLrcLxs2U5oh0iH0A_bBM2CtW7rAQiF8ar40cADz4tai2a1cGUK1V1uGoS9B5K_fJQwfj-hhDcbPaL1OpxgWxyaX0Y4kBSPit5-t8Bw_syLVT9H8dQ7_0PejFzuuorMwnmkgDuQVuWEepIvfM02RvNofS4HtbagT0QeLlDVZf_SYIhaDiODh-K1yXF46N7QpGBPQXFPHR7Tl4G5fgwo30zLS3dfd_BwqYQ8SvneWE05n_jg-qROocp_kKv0jufea07LLqfCtFXZi0qteuooDYqKJcobqx9WaUOQVr3J0RAF5MTuwWYLzJJouliYr_rq-Qq_fYdLitZ0gt2xLElrXIPaejgnPX5TywJ79dKZ8hzw8TcbNKFR0Z9vxBKHn3_NHV73CxIF1q5joUzO2C3QalHRwMf9zINM4zhxsPCYu2DlTMmJEIUxn-utsCnQ9t6qoHHbo0LSmg13MwOwU_eGzotoORKfzElBRm_reYgBrcjVzPZnChoFyHZHMVg0IlX2TzcNPmLrM9Iyja_9aXisZvR6dKvI5qTHWJrnUMmG2ai3vGvzAk42T7i1dyXflpXjV0hZ0lA--u_bQ-7gEnqpOVwk3ZJp4Kvh2QtwieH6Mifl_fCybt7Hvq4BGnixxqUzcPryXFlB2vMUUIKgWtsNan2jOazj1KBfmL48Kz_HHhCcIqsuCE39P6cm8z-s3GgJKJYZY4GB8qxBtSqrFERFMPaMttD1gyflKaBFAJdWl6QRMFiVWwcaJ7vfVmlmIL6NRxvWkV1xR105NKceDzzDaKx-a8sVcIJ0Jpmk8Te7Ymj63424iiLI_0kNUr-joL97Ztv6-jxeNPij9_ZNxPjc4vs7zkVcJNbzu_HyWOXSsC-TqXr9QvNUiZvV_MdJkZ2Uczc5jUtj_Twb5MvjEb3pjyX2Hn_NcK60Y3URbR-dDOv3SeeZ0D3a6NBWnIlJSiVmMj1Yqb_qgLL9DVJ8le0BRQH5nxz4sYKWAr3aPjRkXYJg8jyFMgpdUGo-YF1tqJ6RLwClzBzF2kwabQ_T23rMafsqCajZ5n7LJz78GkL4lRGoKrvRmdXmofTqo5DuoI-eEwkO5ou30BpX0rWr77oU3-8eGpMxFX95_d8aVc-CPuD8B9uOcOO7mmlxdAbapurUFYgxEqww1XHkbUgy9t4BFtC7KrayMMMKjEtUEGqNPsekCG0nsQ6VNZrPAMhpeffTyRQ2z5ay_zEU-F7qqRRMKJ-eAH8N-l9Lc4OKweIRa0BRbqDafHjplFvrEVaYL3vlnvA1LydCyqXOyKfmcv-bceXw9Rx_CNimoWt2f_3FD_BiIVGXtJ0cffqZ5d_Ko4uyUEAimrVptAFRL4ibqAtBI1DpNxIGva4Bc1HqpRqot_wIL6dCtfdBsY2xwgp5rNiJKqjwqioBDHr_nU4BxxF-62oENEY-ElVaLNqv4iOIRMBCFsaKM906hLGb7wvWwf2WCUv5NtbfZHhdTGvGQ7QkzmKW99ZGRvurLzVHRujkQ8W6H5wCX2P-Wm0eOhtkUY105vcEnsESSRj3tfLwHlyGOY-i2Jd3WFFrZPQmwmO_DYy3xeNGiKyGfKwWOHABuPFvnNvIlA6q23AMG1Ofz73wOO98y0JUaq9dp0pZGSinPT-el2SASJ6dQuD-x2x1OZEi8vc2irLTTpokJ8AZHR27u4Qw-ScsVano6LIUPVeer5GDs_6E-XThTZXFAQdGxJ0Ukv2cu64r_VKAMpfJBNahBSxW7Et1Y1hR49sZ1aNV01HspsKZJwX6yjo0uuml3fUcQHXy2YDJQHcpgbXl76X8HEivpM9pzA1cbwJSF9SwxedcOqz9BJpFtT870xAPM8JiLI2lTl4UrUNga_aaFRJq0ORaE5JX9YjJd82-7FVcxgIonUW7WG4I9VhafncX2UuygFt8dfv5WnvHBSwqAve7e_wlpGXk_1OAlNgfF3FEoRSDdotNKvBq3Htsl2IgDF_lXQAF49k-aS3UkhJMr61-pf4Npj2ucISExhv080LyisHPFI44-AbEGQdUV_ZxmNZn6frwFj1ESbVuR_EPmVTgqbn0RR7v2vJ3YXu1K-bVtVkTfQptILopsA8Z5TQqtOhZ5KVmNIEGukxJ5Ui1OiXyJ-XG8aAT7tqwk5lsYbTNLraFY3rQqkITcF3HL9yuZ-SceAyMpcB5y-co03VJ9KwdzjgAd8DU8ZZO2L5h0SP_E-XC-0sjSvB2sCiE0jFy9fONY5vNJCaVJ2RY27WvWJb0bM2dQrdY24tIkBiLeaTmoOQI6_aJ6-Pl00nH4mvM7m_lwYJFeBQcm1Jk6rsCkrLpiapksw-wT5MjlAmBzqiAJLrOFFhnzEwv51rjGOsdjv_tH5y6Y8eydrwiLNFNXKevElAmbNudgaJufdtND6Bm7oVyF9NC8NYcEXSAWH-eukrvPY_YLIbuEKsltGd8lKziWIrjwy2iMuqFF_CbP9Zfyz2KF2X4QW8sGNDNV97eB6cUr1lvo8qW8uIOk3KP_SB9Nj76N8vUPXsM2uy2bInc6jHh0PAIRt4gpCUIHMiWZ0VFPbA46ip1CNvK_fNqqGsx3uMmhItg5K_v4dQov7pMtYVFfG1YW8G2j0kQApCRjhUIrOKPdVXuiJYpPHz6dssnWtV0sWBPYbPSf7T0fu2nseeTLxHU_caUpPvfvJmaypATwh-LS8fnZ2OyhFq_IGBDmkBxzvxbx3ad1wSKZzEvX1hbBwIz5MEWne4AoKbx7r69mksa0rFGAAOt_hlzWA5K9Jmqh2aygYpNTrFBO178rwRs76f1n5KCjI-sqBB4dYqxqWjMfijFIitApuDGd19EZ8FAzTtYnc8N8oei-tuRSNv6G0hPFWr7pIAcq9cAgibRWbpHUbT6P_s8I0vvHp6Ci3aQZh1RTDldBWN1hhMk2MCBSa0uVwrtexoGVdCxo-Wh7EZ8S1WlAdWxPmzSNbFAaZUboxUzCO-pQzpMjq4vHyEjRuf8-Z51gL8wYa3h85-uEjnFN0-ySf0e7kkTkIGzT6xcEq_GAAnDWKeejJ7UBIpiVHedNDPAiDV9Du4Op9aIDzL8eFvzX5qQW-d8tbONVNhaRINeWOM--b90OJ-wZDJefqqmtuTEMBacjgcrdo3QRpqTQz59AtiJJywioxb2kVrR1LSS_VcBOMk468vk0LW_BseYLMab8wd5LVo--0Dh3ixRL3fq3L7xJ"
            },
            {
                "domain": "portswigger.net",
                "expirationDate": 1817385648,
                "hostOnly": true,
                "httpOnly": false,
                "name": "sa-user-id-v2",
                "path": "/",
                "sameSite": null,
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "s%253AJgofdOqdW6J_V_OSdrdsvh_SJG0.oLlpHZRGeR6LjiLrEuMDRWFayXYQGe%252Fuu8uWi789MCs"
            },
            {
                "domain": "portswigger.net",
                "expirationDate": 1785893160.636477,
                "hostOnly": true,
                "httpOnly": true,
                "name": "Authenticated_UserVerificationId",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "54A06CEF04A87C4A282F9CF42CF1B3DC"
            },
            {
                "domain": ".portswigger.net",
                "expirationDate": 1817385986,
                "hostOnly": false,
                "httpOnly": false,
                "name": "ph_phc_zmnmWxifkm9THV54Mrn2XvFDL3Tq497pyRgrYbDu5PGW_posthog",
                "path": "/",
                "sameSite": "lax",
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "%7B%22%24device_id%22%3A%22019fccef-1201-7eca-b3ec-97f35a482823%22%2C%22distinct_id%22%3A%22019fccef-1201-7eca-b3ec-97f35a482823%22%2C%22%24sesid%22%3A%5B1785849986569%2C%22019fccef-1252-722d-b2b7-4b48efebf0a1%22%2C1785849647671%5D%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22%24direct%22%2C%22u%22%3A%22https%3A%2F%2Fportswigger.net%2F%22%7D%2C%22%24user_state%22%3A%22anonymous%22%7D"
            },
            {
                "domain": "portswigger.net",
                "expirationDate": 1817385648,
                "hostOnly": true,
                "httpOnly": false,
                "name": "sa-user-id",
                "path": "/",
                "sameSite": null,
                "secure": true,
                "session": false,
                "storeId": null,
                "value": "s%253A0-260a1f74-ea9d-5ba2-7f57-f39276b76cbe.o452eQoXcZuig58%252BjGW0M8dcxeb36TWxvk5s%252BQyDu68"
            }
        ];

        const cookies = cookiesFromJSON(cookiesJSON);
        console.log(`📝 Cookies yüklendi: ${Object.keys(cookies).length} adet\n`);

        // Licenses sayfasını erişim
        console.log('1️⃣  Licenses sayfasına GET yapılıyor...');
        let res = await makeRequest(
            { url: 'https://portswigger.net/users/youraccount/licenses', method: 'GET' },
            cookies
        );

        console.log(`   Status: ${res.status}`);
        console.log(`   Body length: ${res.body.length}\n`);

        if (res.status === 302) {
            console.log(`   ⚠️  Redirect: ${res.location}`);
            console.log(`   Takip ediliyor...\n`);

            let redirectUrl = res.location;
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = 'https://portswigger.net' + redirectUrl;
            }

            res = await makeRequest(
                { url: redirectUrl, method: 'GET' },
                cookies
            );

            console.log(`   Status: ${res.status}`);
            console.log(`   Body length: ${res.body.length}\n`);
        }

        // HTML'i kaydet
        fs.writeFileSync('licenses_with_cookies.html', res.body);
        console.log('📄 HTML kaydedildi: licenses_with_cookies.html\n');

        // Plan bilgisi ara
        console.log('2️⃣  Plan bilgisi araniyor...');
        const html = res.body.toLowerCase();

        if (html.includes('you do not have any subscriptions')) {
            console.log('   ✅ PLAN BULUNDU: Free');
        } else if (html.includes('burp suite professional')) {
            console.log('   ✅ PLAN BULUNDU: Professional');
        } else if (html.includes('burp suite team')) {
            console.log('   ✅ PLAN BULUNDU: Team');
        } else if (html.includes('burp suite enterprise')) {
            console.log('   ✅ PLAN BULUNDU: Enterprise');
        } else if (html.includes('community')) {
            console.log('   ✅ PLAN BULUNDU: Community');
        } else {
            console.log('   ❌ Plan bulunamadı');
            console.log(`   HTML ilk 500 char:\n${res.body.substring(0, 500)}`);
        }

    } catch (error) {
        console.error('\n❌ HATA:', error.message);
        console.error(error.stack);
    }
}

testWithCookies();
