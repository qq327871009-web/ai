# OSINT 信息收集技术

## Google Dork 速查

### 基本语法
```
site:target.com            # 限定域名
filetype:pdf                # 限定文件类型
intitle:"index of"          # 目录遍历
inurl:admin                 # URL 中含 admin
intext:"password"           # 页面文本含 password
@target.com                 # 邮件地址
site:target.com -www        # 排除 www 子域
site:target.com filetype:xls # Excel 文件
site:target.com inurl:login # 登录页面
```

### 常用 Dork 组合
```
# 敏感文件
site:target.com filetype:pdf "confidential"
site:target.com filetype:xls "salary" OR "budget"
site:target.com filetype:doc "internal"

# 暴露页面
site:target.com inurl:admin OR inurl:login
site:target.com intitle:"index of /backup"
site:target.com inurl:.git

# 员工信息
site:linkedin.com "target company" "email"
"@target.com" filetype:pdf

# 技术信息
site:target.com inurl:phpinfo
site:target.com intext:"powered by"
site:target.com filetype:env
```

## 子域名枚举

```bash
# Subfinder
subfinder -d target.com -silent -o subdomains.txt

# Amass
amass enum -d target.com -o amass_results.txt

# DNS 暴力
cat /usr/share/wordlists/subdomains-top1million-110000.txt | \
  while read sub; do
    host $sub.target.com 2>/dev/null | grep "has address"
  done

# crt.sh 证书透明
curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u

# Wayback Machine
curl -s "https://web.archive.org/cdx/search/cdx?url=*.target.com/*&output=text&fl=original&collapse=urlkey" | sort -u
```

## GitHub 代码泄露搜索

```bash
# GitHub Dork
# 搜索目标组织的代码泄露
git clone https://github.com/techgaun/github-dorks
# 或用 GitHub API
curl -s "https://api.github.com/search/code?q=org:target+password" | jq '.items[].html_url'
curl -s "https://api.github.com/search/code?q=org:target+api_key" | jq '.items[].html_url'
curl -s "https://api.github.com/search/code?q=org:target+BEGIN+PRIVATE+KEY" | jq '.items[].html_url'
curl -s "https://api.github.com/search/code?q=org:target+AWS_ACCESS_KEY" | jq '.items[].html_url'
```

## LinkedIn 员工信息

```bash
# 用 theHarvester
theHarvester -d target.com -b linkedin -l 500

# 用 recon-ng
recon-cli -w target -r recon/profiles-full/recon -m companies
```

## 元数据分析

```bash
# 提取文档元数据
exiftool document.pdf

# 批量提取
find . -name "*.pdf" -exec exiftool {} \; | grep -E "Author|Creator|Producer|Title"

# FOCA / metagoofile
python metagoofile.py -d target.com -t pdf,doc,xls -l 100 -o results.txt
```

## 技术栈指纹

```bash
# whatweb
whatweb target.com

# wappalyzer
# 浏览器插件或 CLI
nmap -sV -sC target.com

# HTTP 头分析
curl -sI target.com
curl -sI target.com | grep -i "server\|x-powered-by\|x-aspnet-version"

# CDN/WAF 检测
wafw00f target.com
```

## 目标画像报告模板

```markdown
# OSINT Report: TARGET_COMPANY

## 1. 基本信息
- 域名: target.com
- 注册商: [whois]
- 注册日期: [whois]
- DNS 记录: [dig]

## 2. 子域名
| 子域名 | IP | 服务 |
|---|---|---|
| www.target.com | 1.2.3.4 | nginx |
| mail.target.com | 1.2.3.5 | Exchange |
| api.target.com | 1.2.3.6 | |

## 3. 员工
| 姓名 | 职位 | 邮箱 | LinkedIn |
|---|---|---|---|

## 4. 技术栈
| 技术 | 版本 | 检测来源 |
|---|---|---|

## 5. 泄露
| 类型 | URL | 日期 |
|---|---|---|
```
