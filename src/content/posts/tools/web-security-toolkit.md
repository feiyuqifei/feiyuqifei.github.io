---
title: 'Web 安全工具清单：我实机验证过的 12 个工具'
description: '不是从别处抄来的清单。这 12 个工具都是我实际用过、踩过坑、并且现在还在用的，附上真实使用场景和避坑提示。'
pubDate: 2026-03-14
tags: ['Web安全', '工具链', '渗透测试']
category: '安全'
featured: true
---

网上"渗透测试工具大全"这类文章太多了，绝大多数是把同一个列表抄来抄去，
列出一百个工具名，却不说哪个好用、装完能不能跑起来、踩过什么坑。

这篇不一样。下面这些工具是我自己在靶场和授权测试里真正用过、并且**现在还在用**的。
每个都写清楚：用来干什么、什么时候该用它、以及我踩过的坑。

> 所有工具仅用于**你拥有或已获得明确书面授权**的目标。
> 未授权测试在《刑法》第 285、286 条下是有真实法律风险的，这不是危言耸听。

## 一、先把地基打好：代理与抓包

### 1. Burp Suite Community

Web 安全的主力工具，没有之一。指纹识别、改包重放、爆破、扫描，
整个工作流都围绕它转。

社区版够用吗？**对学习来说完全够**，缺的是主动扫描器和 Intruder 的限速。
真要做项目再考虑 Pro。

**我踩过的坑**：Burp 默认用自签名 CA，如果你测的是 HTTPS 站点，
必须把 `cacert.der` 导进浏览器或系统信任区，否则会一直报证书错误。
Firefox 有自己的证书库，**系统装了不代表 Firefox 认**，这点最容易卡住新手。

### 2. mitmproxy

命令行抓包，比 Burp 轻得多。适合两种场景：

- 服务器上没有图形界面时
- 需要写脚本自动改包时（`mitmdump -s script.py`）

它的 `mitmweb` 模式还带个网页界面，算是兼顾了易用性。

**真实用例**：我曾经要批量验证某个接口对参数类型是否做了校验，
用 mitmproxy 挂了个脚本自动把所有 `id` 参数从整数改成字符串带引号，
几百个请求几秒钟跑完。这种活 Burp 社区版干不了。

## 二、信息收集

### 3. httpx

不是 Python 那个 httpx 库，是 ProjectDiscovery 的 `httpx`——**同名不同物**，
搜的时候注意别搞混。

批量探测存活主机、状态码、标题、技术栈，速度极快。

```bash
# 从子域名单里批量探测存活，输出到文件
cat subs.txt | httpx -title -status-code -tech-detect -o alive.txt

# 只看 200 的，并且跟着跳转
cat subs.txt | httpx -mc 200 -follow-redirects
```

### 4. Nuclei

同样是 ProjectDiscovery 家的，基于 YAML 模板的漏洞扫描器。
最大的价值是**模板生态**：CVE 出来后社区很快就有模板。

```bash
# 更新模板后扫一批目标
nuclei -update-templates
nuclei -l alive.txt -t cves/ -severity critical,high -o findings.txt
```

**避坑**：`-severity` 一定要限制。不加这个参数会把几千个 info 级结果全打出来，
报告根本没法看。我一开始就是这么浪费了一下午。

## 三、目录与参数

### 5. ffuf

目录爆破、参数爆破、子域爆破，一个工具全包。

```bash
# 目录爆破，过滤掉 404 大小一致的响应
ffuf -w /usr/share/wordlists/dirb/common.txt \
     -u https://target/FUZZ \
     -fc 404 -fs 1234

# 参数名爆破
ffuf -w params.txt -u 'https://target/api?FUZZ=1' -fs 0
```

**核心技巧**：`-fs`（按响应大小过滤）比 `-fc`（按状态码过滤）有用得多。
很多站点对不存在的路径返回 200 + 一个"页面不存在"的 HTML，
这时候按状态码过滤完全失效，必须靠响应大小。

### 6. Arjun

专门找隐藏 GET/POST 参数。很多接口有未文档化的参数，
比如 `?debug=1`、`?admin=true`，Arjun 能靠响应差异把它们挖出来。

```bash
arjun -u https://target/api/endpoint -m GET
```

## 四、漏洞验证

### 7. sqlmap

SQL 注入检测与利用。这个太有名了，只说我自己的用法：

```bash
# 从 Burp 保存的请求文件读，比手敲参数靠谱得多
sqlmap -r request.txt --batch --level 3 --risk 2 --dbs

# 确认可以注入后，再针对性拿表
sqlmap -r request.txt -D appdb --tables
```

**强烈建议用 `-r` 读请求文件**。手工拼 `--data` 参数时，
一旦涉及 Cookie、特殊编码、多层 JSON，很容易拼错导致误判为"不存在注入"。

### 8. XSStrike

XSS 检测。它的优势是会分析上下文（HTML 标签内、属性内、JS 内），
而不是无脑丢 payload。

**但要说清楚**：XSS 的手工验证能力比工具重要。
工具能帮你发现候选点，最终确认反射上下文、绕过过滤器，还是得靠人看源码。

## 五、密码与权限

### 9. Hashcat

GPU 加速的哈希破解。和 John the Ripper 的区别：
Hashcat 吃 GPU、速度快，John 更擅长自动识别格式。

```bash
# 识别哈希类型
hashcat --identify hash.txt

# 用 rockyou 字典跑 NTLM（模式 1000）
hashcat -m 1000 -a 0 hash.txt rockyou.txt

# 想看进度先按 s，想暂停按 p，别直接 Ctrl+C
```

**踩坑**：Windows 上要先装显卡驱动，且必须用 `-d` 指定设备，
否则可能跑到集显上，速度差几十倍。

### 10. BloodHound

域环境权限分析。如果你在做内网，这是**决定性**的工具——
它把 AD 的权限关系画成图，一眼能看出从当前用户到域管的攻击路径。

需要配合 SharpHound 收集器使用。

## 六、两个容易被忽略但很关键的

### 11. CyberChef

浏览器里的"数据处理瑞士军刀"。编码解码、加解密、格式转换、正则提取，
全部离线在浏览器里跑，**不联网不上传数据**——这点在客户现场很重要。

我几乎每天都会开它一次：解 JWT、看 hexdump、转 base64、
试各种编码组合。以前这些活要写一堆小脚本，现在拖几个模块就完事。

### 12. Wappalyzer

技术栈识别浏览器插件。看一眼就知道目标用的什么框架、什么服务器、
什么 CDN、有没有用特定版本的 jQuery。

**为什么它重要**：技术栈直接决定了你该往哪个方向找漏洞。
看到 ThinkPHP 就该试那几个经典 RCE，看到 Spring 就该看 actuator 端点。
不做指纹识别就瞎打，效率会低一个数量级。

## 一张表总结选型

| 阶段 | 首选 | 备选 | 什么时候换 |
|---|---|---|---|
| 抓包改包 | Burp Suite | mitmproxy | 无图形界面 / 要写脚本自动化 |
| 存活探测 | httpx | — | 基本不用换 |
| 模板扫描 | Nuclei | — | 需要自己写 POC 时 |
| 目录爆破 | ffuf | dirsearch | 需要递归爆破时用 dirsearch |
| 参数发现 | Arjun | — | 基本不用换 |
| SQL 注入 | sqlmap | — | 基本不用换 |
| XSS | 手工 + XSStrike | — | 工具只是辅助 |
| 哈希破解 | Hashcat | John | 格式识别困难时用 John |
| 内网 | BloodHound | — | 基本不用换 |
| 数据处理 | CyberChef | — | 基本不用换 |
| 指纹识别 | Wappalyzer | whatweb | 命令行环境用 whatweb |

## 最后：工具之外的三件事

写了这么多工具，但真正决定水平的从来不是工具：

1. **看懂源码**。工具报出来的每一个点，你都得能说清为什么它是漏洞。
   说不清就意味着你无法判断误报。
2. **理解协议**。HTTP 的每一个头部、每一个状态码、
   每一次跳转都可能藏着问题。工具不会告诉你这些。
3. **守规矩**。授权范围写在纸上的才算数。这一行的职业生涯，
   毁在一次越界测试上太不值得了。

下一篇我会写 HTTP 请求走私的实战复盘，那个题目让我第一次意识到
"代理和后端服务器对同一个请求的理解不一致"能造成多严重的后果。
