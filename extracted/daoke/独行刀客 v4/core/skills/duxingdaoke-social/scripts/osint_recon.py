#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OSINT 目标画像收集器
用法: python3 osint_recon.py <domain>
功能: 子域名枚举 + 证书透明 + Wayback URL + HTTP 头
"""
import sys
import json
import urllib.request
import urllib.parse
import ssl

def fetch(url, timeout=10):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (OSINT Scanner)"
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return ""

def crtsh_subdomains(domain):
    print(f"[*] crt.sh certificate transparency for {domain}")
    url = f"https://crt.sh/?q=%25.{domain}&output=json"
    data = fetch(url)
    if not data:
        print("  [!] crt.sh failed")
        return []
    subs = set()
    try:
        entries = json.loads(data)
        for entry in entries:
            names = entry.get("name_value", "")
            for name in names.split("\n"):
                name = name.strip().lower()
                if name and domain in name and "*" not in name:
                    subs.add(name)
    except json.JSONDecodeError:
        pass
    return sorted(subs)

def wayback_urls(domain):
    print(f"[*] Wayback Machine URLs for {domain}")
    url = (f"https://web.archive.org/cdx/search/cdx"
           f"?url=*.{domain}/*&output=text&fl=original"
           f"&collapse=urlkey&limit=200")
    data = fetch(url)
    if not data:
        print("  [!] Wayback failed")
        return []
    urls = [line.strip() for line in data.split("\n") if line.strip()]
    return urls

def http_fingerprint(url):
    print(f"[*] HTTP fingerprint for {url}")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, method="HEAD", headers={
            "User-Agent": "Mozilla/5.0 (OSINT Scanner)"
        })
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            headers = dict(resp.headers)
            interesting = {}
            for key in ["Server", "X-Powered-By", "X-AspNet-Version",
                        "X-Generator", "Via", "X-Cache", "Set-Cookie"]:
                if key in headers:
                    interesting[key] = headers[key]
            return interesting
    except Exception as e:
        return {"error": str(e)}

def google_dorks(domain):
    dorks = [
        f'site:{domain} filetype:pdf "confidential"',
        f'site:{domain} filetype:xls "salary" OR "budget"',
        f'site:{domain} inurl:admin OR inurl:login',
        f'site:{domain} intitle:"index of"',
        f'site:{domain} inurl:.git',
        f'site:{domain} filetype:env',
    ]
    print(f"\n[*] Google Dorks to try (copy-paste into Google):")
    for d in dorks:
        print(f"  {d}")
    return dorks

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <domain>")
        return 1

    domain = sys.argv[1].lower().strip()
    print(f"{'='*60}")
    print(f"  OSINT Report: {domain}")
    print(f"{'='*60}\n")

    # 子域名
    subs = crtsh_subdomains(domain)
    print(f"  Found {len(subs)} subdomains:")
    for s in subs[:30]:
        print(f"    {s}")
    if len(subs) > 30:
        print(f"    ... and {len(subs)-30} more")

    # HTTP 指纹
    print(f"\n[*] HTTP Fingerprint:")
    for sub in subs[:5]:
        for scheme in ["https", "http"]:
            fp = http_fingerprint(f"{scheme}://{sub}")
            if fp and "error" not in fp:
                print(f"  {scheme}://{sub}")
                for k, v in fp.items():
                    print(f"    {k}: {v}")
                break

    # Wayback
    print(f"\n[*] Wayback Machine URLs:")
    wb = wayback_urls(domain)
    print(f"  Found {len(wb)} URLs")
    for u in wb[:10]:
        print(f"    {u}")

    # Google Dorks
    google_dorks(domain)

    print(f"\n{'='*60}")
    print(f"  OSINT Report Complete")
    print(f"{'='*60}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
