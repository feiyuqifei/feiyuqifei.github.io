---
title: 'Web 安全工具清单：分类、官方入口与我踩过的坑'
description: '一份能直接照着装的 Web 安全工具清单。按用途分类、附官方 Releases 入口与实测版本号，并写清本机环境要求和安装时会踩的坑。'
pubDate: 2026-03-14
tags: ['Web安全', '工具链', '渗透测试']
category: '安全'
featured: true
---

网上"渗透测试工具大全"这类文章太多了，绝大多数是把同一个列表抄来抄去，
列出一百个工具名，却不说哪个好用、装完能不能跑起来、踩过什么坑。

这篇不一样，它按**用途**组织，每个工具都给官方入口和实测版本号，
并且把**本机的环境约束**写清楚——因为 Windows 上装 Web 安全工具，
真正的敌人从来不是工具本身，而是 Ruby / Perl / Python 版本这些环境问题。

> ⚠️ 仅用于**自己搭建的靶场、CTF 平台、已获书面授权的测试**。
> 未授权扫描或入侵在《刑法》第 285、286 条下有真实法律风险。
> 这不是免责声明式的套话，是这一行最容易毁掉职业生涯的地方。

## 0. 先盘点本机已有条件

动手装之前先看清楚手上有什么，能省掉一半重复工作。

| 项目 | 说明 |
|---|---|
| Wireshark + tshark / dumpcap / editcap | 抓包与流量分析，tshark 可写脚本 |
| curl | 手工发请求、验证 HTTP 响应 |
| Python 3.9 | **偏老**，部分工具要求 ≥ 3.10，见第 6 节 |
| Git | 拉取 GitHub 上的工具仓库 |
| **Kali Linux 虚拟机** | 下面 90% 的工具已预装，**最省事的路线** |
| Ghidra / IDA | 逆向方向（RE / Pwn），不属于 Web |
| MySQL 在跑 | 有现成练习库，配合 sqlmap 做注入实训很方便 |

**一句话结论**：如果你已经有 Kali 虚拟机，就别在 Windows 上折腾 Ruby 和 Perl 了。
Web 类工具在 Windows 上装完还要配一堆运行时，虚拟机里开箱即用。

## 1. 流量拦截与改包（核心中的核心）

| 工具 | 官方入口 | 特点 |
|---|---|---|
| **Burp Suite CE** | [portswigger.net/burp/communitydownload](https://portswigger.net/burp/communitydownload) | 行业标准。社区版免费，Intruder 限速、无主动扫描器 |
| **OWASP ZAP** | [zaproxy.org/download](https://www.zaproxy.org/download/) | 全开源免费，含主动/被动扫描，Burp 免费版的功能替代 |
| Caido | [caido.io/download](https://caido.io/download) | Rust 写的轻量代理，界面现代，有免费档 |
| mitmproxy | [mitmproxy.org](https://mitmproxy.org/) | 纯命令行 / 可编程代理，适合写脚本自动化 |

**选一个主用就行**，同时用两个只会让你在两个界面之间反复横跳。
CTF 刷题场景下 **ZAP 或 Burp CE 二选一**完全够用。

### 我踩过的坑

Burp 默认用自签名 CA。如果你测 HTTPS 站点，必须把 `cacert.der`
导进浏览器或系统信任区，否则一直报证书错误。

**Firefox 有自己的证书库——系统装了不代表 Firefox 认。** 这点最容易卡住新手，
我第一次配的时候在这里耗了半小时。

### 什么时候该换 mitmproxy

两种场景值得切过去：

- 服务器上没有图形界面
- 需要写脚本自动改包（`mitmdump -s script.py`）

**真实用例**：我要批量验证某个接口对参数类型是否做了校验，
用 mitmproxy 挂了个脚本把所有 `id` 参数从整数改成带引号的字符串，
几百个请求几秒钟跑完。这种活 Burp 社区版干不了（Intruder 限速）。

## 2. 目录 / 参数 / 子域爆破

| 工具 | 官方入口 | 安装方式 |
|---|---|---|
| **ffuf** | [github.com/ffuf/ffuf/releases](https://github.com/ffuf/ffuf/releases) | 单文件 exe，解压即用 |
| dirsearch | [github.com/maurosoria/dirsearch/releases](https://github.com/maurosoria/dirsearch/releases) | `pip install dirsearch` 或下 zip |
| feroxbuster | [github.com/epi052/feroxbuster/releases](https://github.com/epi052/feroxbuster/releases) | 单文件 exe |
| gobuster | [github.com/OJ/gobuster/releases](https://github.com/OJ/gobuster/releases) | 单文件 exe |
| subfinder | [github.com/projectdiscovery/subfinder/releases](https://github.com/projectdiscovery/subfinder/releases) | 单文件 exe，子域收集 |
| katana | [github.com/projectdiscovery/katana/releases](https://github.com/projectdiscovery/katana/releases) | 爬虫，抓到的 URL 喂给 ffuf / nuclei |
| Arjun | [github.com/s0md3v/Arjun](https://github.com/s0md3v/Arjun) | 隐藏 GET/POST 参数发现 |

### 字典才是决定成败的关键

工具再好，字典不行也是白费。这三个够用很久：

- **SecLists**：<https://github.com/danielmiessler/SecLists> —— 最全，Web 爆破首选
- **fuzzing-templates**：<https://github.com/projectdiscovery/fuzzing-templates> —— 配合 ffuf
- 手上已有的小字典（比如 top 100 密码表）拿来快速验证连通性

### ffuf 的两个关键技巧

```bash
# 目录爆破：-fc 过滤状态码，-fs 过滤响应大小
ffuf -w SecLists/Discovery/Web-Content/common.txt \
     -u https://target/FUZZ \
     -fc 404 -fs 1234

# 参数名爆破
ffuf -w params.txt -u 'https://target/api?FUZZ=1' -fs 0
```

**`-fs`（按响应大小过滤）比 `-fc`（按状态码）有用得多。**
很多站点对不存在的路径返回 200 + 一个"页面不存在"的 HTML，
这时候按状态码过滤完全失效，必须靠响应大小。

## 3. 漏洞检测与利用

| 工具 | 官方入口 | 用途 |
|---|---|---|
| **sqlmap** | [github.com/sqlmapproject/sqlmap](https://github.com/sqlmapproject/sqlmap) | SQL 注入自动检测与利用，支持 `--os-shell` |
| **nuclei** | [github.com/projectdiscovery/nuclei/releases](https://github.com/projectdiscovery/nuclei/releases) | 模板化漏扫，模板库增长最快 |
| **httpx** | [github.com/projectdiscovery/httpx/releases](https://github.com/projectdiscovery/httpx/releases) | 存活探测、批量指纹、状态码筛选 |
| XSStrike | [github.com/s0md3v/XSStrike](https://github.com/s0md3v/XSStrike) | XSS 检测，含 WAF 绕过 |
| dalfox | [github.com/hahwul/dalfox/releases](https://github.com/hahwul/dalfox/releases) | XSS 扫描，单文件 exe |
| commix | [github.com/commixproject/commix](https://github.com/commixproject/commix) | 命令注入检测与利用 |
| nikto | [github.com/sullo/nikto](https://github.com/sullo/nikto) | 经典 Web 服务器漏扫（需 Perl） |
| Wapiti | [wapiti-scanner.github.io](https://wapiti-scanner.github.io/) | 开源黑盒扫描，覆盖 XSS / SQLi / LFI |
| WPScan | [github.com/wpscanteam/wpscan](https://github.com/wpscanteam/wpscan) | WordPress 专用（需 Ruby） |
| nmap | [nmap.org/download](https://nmap.org/download) | 端口与服务识别（`nmap -sV -sC`） |
| Semgrep | [github.com/semgrep/semgrep](https://github.com/semgrep/semgrep) | 白盒代码审计（SAST），规则可自定义 |
| Bandit | [github.com/PyCQA/bandit](https://github.com/PyCQA/bandit) | Python 代码安全审计 |
| Trivy | [github.com/aquasecurity/trivy/releases](https://github.com/aquasecurity/trivy/releases) | 依赖 / 容器 / 配置漏洞扫描 |

### ⚠️ httpx 是同名不同物

ProjectDiscovery 的 `httpx` 是**命令行工具**，
Python 生态里也有一个叫 `httpx` 的 **HTTP 客户端库**。
搜索的时候极易搞混，装之前看清仓库地址。

```bash
# 从子域名单批量探测存活
cat subs.txt | httpx -title -status-code -tech-detect -o alive.txt
```

### Nuclei 的 `-severity` 一定要限制

```bash
nuclei -update-templates
nuclei -l alive.txt -t cves/ -severity critical,high -o findings.txt
```

不加 `-severity` 会把几千条 info 级结果全打出来，报告根本没法看。
我第一次跑就是这么浪费了一下午。

### sqlmap 用 `-r` 读请求文件，不要手敲参数

```bash
# 从 Burp 保存的请求文件读（推荐）
sqlmap -r request.txt --batch --level 3 --risk 2 --dbs
sqlmap -r request.txt -D appdb --tables
```

手工拼 `--data` 时，一旦涉及 Cookie、特殊编码、多层 JSON，
很容易拼错，然后得到"不存在注入"的**误判结论**——这比跑不出结果更危险。

## 4. 指纹识别

| 工具 | 官方入口 | 用途 |
|---|---|---|
| WhatWeb | [github.com/urbanadventurer/WhatWeb](https://github.com/urbanadventurer/WhatWeb) | CMS / 框架 / 中间件指纹（需 Ruby） |
| wafw00f | [github.com/EnableSecurity/wafw00f](https://github.com/EnableSecurity/wafw00f) | WAF 识别，先判断有没有 WAF 再决定打法 |
| httpx | 见上 | `-tech-detect` 批量指纹 |

**为什么指纹识别值得单独一步**：技术栈直接决定你该往哪个方向找漏洞。
看到 ThinkPHP 就该试那几个经典 RCE，看到 Spring 就该先看 actuator 端点。
不做指纹就瞎打，效率会低一个数量级。

## 5. 推荐起步组合

别一次装全部。**按需装**才不会陷入"装了一堆工具却不知道用哪个"的状态。

**CTF 刷题（最小够用）**

1. 抓包改包：**ZAP 或 Burp CE**
2. 扫目录：**ffuf** + SecLists 字典
3. 注入：**sqlmap**
4. 指纹 / WAF：**wafw00f + WhatWeb**

**进阶补强**：nuclei（漏扫）、httpx + subfinder（资产收集）、
dalfox（XSS）、katana（爬虫）

## 6. 本机安装注意（Python 3.9 偏老的坑）

| 工具 | 要求 | 建议 |
|---|---|---|
| sqlmap | 兼容 3.9 | `pip install sqlmap`，或 `git clone` 后 `python sqlmap.py` |
| dirsearch | 部分新版要求 ≥ 3.10 | pip 装失败就改用 zip 发布包，或升级 Python |
| ffuf / feroxbuster / nuclei / httpx / dalfox / trivy | 免环境（预编译 exe） | 解压到统一目录并加进 PATH |
| WhatWeb / WPScan / nikto | 需 Ruby / Perl | Windows 上折腾成本高，**建议在 Kali 里跑** |
| 升级 Python | 3.12 / 3.13 | `winget install Python.Python.3.12`，注意别破坏现有 3.9 环境 |

**最省事的路线**：Kali 虚拟机已预装 Burp、ZAP、ffuf、sqlmap、nmap、
nikto、wpscan、whatweb、wfuzz、gobuster、dirb、hydra、metasploit。
Web 类工具在 Windows 上装完还要配 Ruby / Perl / Go 环境，虚拟机里开箱即用。

## 7. 两个容易被忽略但很关键的

这两个不在上面任何一个分类里，但我几乎每天都会用到。

### CyberChef —— 数据处理瑞士军刀

<https://gchq.github.io/CyberChef/>

浏览器里跑，编码解码、加解密、格式转换、正则提取全都有，
**完全离线、不联网不上传数据**——这点在客户现场很重要。

解 JWT、看 hexdump、转 base64、试各种编码组合。
以前这些活要写一堆小脚本，现在拖几个模块就完事。

### Hashcat —— GPU 加速的哈希破解

<https://hashcat.net/hashcat/>

和 John the Ripper 的分工：Hashcat 吃 GPU、速度快，
John 更擅长自动识别哈希格式。

```bash
hashcat --identify hash.txt          # 先识别类型
hashcat -m 1000 -a 0 hash.txt rockyou.txt   # NTLM（模式 1000）
```

**踩坑**：Windows 上要先装显卡驱动，且要用 `-d` 指定设备，
否则可能跑到集显上，速度差几十倍。
跑起来后按 `s` 看进度、`p` 暂停，**别直接 Ctrl+C**。

## 8. 一张表总结选型

| 阶段 | 首选 | 什么时候换别的 |
|---|---|---|
| 抓包改包 | Burp Suite / ZAP | 无图形界面或要自动化 → mitmproxy |
| 目录爆破 | ffuf | 需要递归爆破 → dirsearch / feroxbuster |
| 参数发现 | Arjun | — |
| 存活 / 指纹 | httpx | 命令行环境外想图形化 → Wappalyzer 插件 |
| 模板漏扫 | nuclei | 要自己写 POC 时 |
| SQL 注入 | sqlmap | — |
| XSS | 手工 + dalfox / XSStrike | 工具只是辅助，最终靠人看源码 |
| 哈希破解 | Hashcat | 格式识别困难 → John |
| 内网 | BloodHound | — |
| 数据处理 | CyberChef | — |

## 9. 学习与资源

- **PortSwigger Web Security Academy**：<https://portswigger.net/web-security>
  免费官方靶场 + 教程，讲得比绝大多数付费课好
- **OWASP 测试指南（WSTG）**：<https://owasp.org/www-project-web-security-testing-guide/>
- **PayloadsAllTheThings**：<https://github.com/swisskyrepo/PayloadsAllTheThings>
- **awesome-cybersecurity-tools**：<https://github.com/eudk/awesome-cybersecurity-tools>
- **Scanners-Box**：<https://github.com/CoderExamples/Scanners-Box> 国产开源扫描器合集
- **nuclei 模板实验室**：<https://projectdiscovery.io/blog/introducing-nuclei-templates-labs-a-hands-on-security-testing-playground>

## 最后：工具之外的三件事

写了这么多工具，但真正决定水平的从来不是工具：

1. **看懂源码**。工具报出来的每一个点，你都得能说清为什么它是漏洞。
   说不清就意味着你无法判断误报——而误报会让你在报告里丢脸。
2. **理解协议**。HTTP 的每个头部、每个状态码、每次跳转都可能藏着问题。
   工具不会告诉你这些。我写过的[请求走私复盘](/tech/http-request-smuggling/)
   就是个例子：payload 网上到处都有，但不懂"请求边界"就永远不知道为什么有效。
3. **守规矩**。授权范围写在纸上的才算数。这一行的职业生涯，
   毁在一次越界测试上太不值得了。
