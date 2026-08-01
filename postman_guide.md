# PortSwigger Endpoint Testi - Postman Rehberi

## OAuth2 Akışı Postman'de Kurulması

### Step 1: Authorization Tab'ında OAuth2 Seç
1. Postman'de yeni bir request oluştur
2. **Authorization** sekmesine git
3. **Type** dropdown'dan **OAuth 2.0** seç

### Step 2: OAuth2 Konfigürasyonu
Aşağıdaki ayarları yap:

```
Grant Type: Authorization Code
Callback URL: https://portswigger.net/signin-oidc
Auth URL: https://login.portswigger.net/authorize
Access Token URL: https://login.portswigger.net/oauth/token

Client ID: F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz
Client Secret: (boş bırak)
Scope: openid profile email
State: (Postman otomatik oluşturacak)
```

### Step 3: PKCE Ayarları
- **Code challenge method**: SHA256
- **Code verifier**: (Postman otomatik oluşturacak)

### Step 4: Token Al
1. "Get New Access Token" düğmesine tıkla
2. Portswigger login sayfasında giriş yap
3. İzin ver
4. Postman token'ı otomatik alacak

### Step 5: Endpoint Testi
URL'e yapıştır:
```
https://portswigger.net/users/youraccount/licenses
```

veya yeni endpoints:
```
https://portswigger.net/subscriptions
https://portswigger.net/account/subscriptions
https://portswigger.net/user/subscriptions
```

### Step 6: GET İsteği Gönder
1. Method: **GET** seç
2. **Send** düğmesine tıkla
3. Response'u kontrol et

---

## Hızlı Test Yöntemi (Python Script ile)

Alternatif olarak, bu Python script'ini kullanabilirsin:

```python
#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/user/portswigger')
from plan_extractor import PortSwiggerPlanExtractor

# Credentials'ı ayarla
username = "senin_email@gmail.com"
password = "senin_sifre"
proxy_url = "http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029"

extractor = PortSwiggerPlanExtractor("log.txt", proxy_url=proxy_url)

# Giriş yap
if extractor.login(username, password):
    print("[✓] Giriş başarılı!")
    
    # Plan çıkart
    plan = extractor.extract_plan(username)
    print(f"\nPlan verisi:\n{plan}")
else:
    print("[✗] Giriş başarısız")
```

Bu script'i çalıştırıp sonuçları görebilirsin.
