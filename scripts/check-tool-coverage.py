"""复核线上文章是否覆盖了原始清单的全部条目。

用法: python scripts/check-tool-coverage.py
这是一个一次性核对脚本，放在 scripts/ 下便于以后清单更新后重跑。
"""

import pathlib

SRC = pathlib.Path(r"D:\deepseek工作区\Web安全工具清单.md")
ART = pathlib.Path(r"D:\deepseek工作区\blog\src\content\posts\tools\web-security-toolkit.md")

src_text = SRC.read_text(encoding="utf-8")
art_text = ART.read_text(encoding="utf-8")

groups = {
    "本机环境": ["Wireshark", "tshark", "dumpcap", "editcap", "curl", "Python",
                 "Git", "Kali", "Ghidra", "IDA", "MySQL"],
    "拦截改包": ["Burp Suite", "ZAP", "Caido", "mitmproxy"],
    "爆破枚举": ["ffuf", "dirsearch", "feroxbuster", "gobuster", "subfinder",
                 "katana", "Kiterunner"],
    "字典资源": ["SecLists", "fuzzing-templates"],
    "漏洞利用": ["sqlmap", "nuclei", "nikto", "Wapiti", "WPScan", "dalfox",
                 "XSStrike", "commix", "httpx", "nmap", "Semgrep", "Bandit", "Trivy"],
    "指纹识别": ["WhatWeb", "wafw00f", "TideFinger", "EHole"],
    "学习资源": ["PortSwigger", "OWASP", "PayloadsAllTheThings",
                 "awesome-cybersecurity-tools", "Scanners-Box"],
}

print("==== 原始清单 -> 文章 全量覆盖复核 ====")
total = 0
missing = []
for group, tools in groups.items():
    print(f"\n  [{group}]")
    for tool in tools:
        total += 1
        ok = tool.lower() in art_text.lower()
        if not ok:
            missing.append(tool)
        print(f"    {'OK  ' if ok else 'MISS'}  {tool}")

print(f"\n  原始清单条目 {total} 项，缺失 {len(missing)} 项")
if missing:
    print("  缺失清单：")
    for m in missing:
        print(f"    - {m}")

extra = ["Arjun", "CyberChef", "Hashcat", "BloodHound", "Wappalyzer", "John"]
added = [t for t in extra
         if t.lower() in art_text.lower() and t.lower() not in src_text.lower()]
print(f"\n  文章新增（原清单没有）：{added}")
