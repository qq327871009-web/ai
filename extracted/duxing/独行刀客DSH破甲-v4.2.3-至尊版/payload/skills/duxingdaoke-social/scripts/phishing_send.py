#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
钓鱼邮件投递脚本 — 批量发送
用法: python3 phishing_send.py --template email.html --targets targets.csv --from "noreply@target-similar.com" --smtp smtp.server.com:587 --user user --pass password
"""
import sys
import argparse
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import csv

def send_email(smtp_host, smtp_port, username, password,
               from_addr, to_addr, subject, html_body, text_body=None,
               attachments=None, use_tls=True):
    msg = MIMEMultipart("alternative")
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if attachments:
        for path in attachments:
            with open(path, "rb") as f:
                part = MIMEApplication(f.read())
                part.add_header("Content-Disposition",
                                "attachment", filename=path.split("/")[-1])
                msg.attach(part)

    try:
        if use_tls:
            context = ssl.create_default_context()
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(username, password)
            server.sendmail(from_addr, [to_addr], msg.as_string())
            server.quit()
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.login(username, password)
            server.sendmail(from_addr, [to_addr], msg.as_string())
            server.quit()
        return True, ""
    except Exception as e:
        return False, str(e)

def main():
    parser = argparse.ArgumentParser(description="Phishing email delivery")
    parser.add_argument("--template", required=True, help="HTML email template")
    parser.add_argument("--targets", required=True, help="CSV file: name,email")
    parser.add_argument("--from", dest="from_addr", required=True, help="From address")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--smtp", required=True, help="SMTP host:port")
    parser.add_argument("--user", required=True, help="SMTP username")
    parser.add_argument("--pass", required=True, help="SMTP password")
    parser.add_argument("--no-tls", action="store_true", help="Disable TLS")
    parser.add_argument("--attach", action="append", help="Attachment file path")
    parser.add_argument("--dry-run", action="store_true", help="Print without sending")

    args = parser.parse_args()

    with open(args.template, "r", encoding="utf-8") as f:
        html_template = f.read()

    targets = []
    with open(args.targets, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            targets.append(row)

    smtp_host, smtp_port = args.smtp.rsplit(":", 1)
    smtp_port = int(smtp_port)

    sent = 0
    failed = 0

    for target in targets:
        name = target.get("name", "")
        email = target.get("email", "")
        if not email:
            continue

        html_body = html_template.replace("{{NAME}}", name)
        html_body = html_body.replace("{{EMAIL}}", email)

        if args.dry_run:
            print(f"[DRY RUN] To: {email} ({name})")
            print(f"  Subject: {args.subject}")
            print(f"  Body length: {len(html_body)} chars")
            continue

        ok, err = send_email(
            smtp_host, smtp_port, args.user, args.pass,
            args.from_addr, email, args.subject, html_body,
            attachments=args.attach, use_tls=not args.no_tls
        )

        if ok:
            sent += 1
            print(f"[+] Sent to: {email} ({name})")
        else:
            failed += 1
            print(f"[-] Failed: {email} — {err}")

    print(f"\n{'='*40}")
    print(f"Sent: {sent} | Failed: {failed}")
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
