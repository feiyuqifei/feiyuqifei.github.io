---
title: 'CTF Misc 工具清单：按题目长相找工具'
description: 'Misc 没有固定套路，题目给什么就得会看什么。这份清单按「拿到什么东西」分类，列出 14 个我核实过活跃度的工具，附官方地址与使用时机。'
pubDate: 2026-10-13
tags: ['CTF', 'Misc', '隐写', '取证', '工具']
category: '工具'
featured: true
---

Web 方向的题有套路：给个 URL，找注入、找上传、找逻辑漏洞，工具链八九不离十。Misc 不是这样。

Misc 是「杂项」的缩写，字面意思是什么都可能。给你一张图、一段音频、一个 pcap、一个内存镜像、一堆乱七八糟的编码，你得先判断它是什么，再决定用什么。

所以 Misc 的难点往往不在解题，在看到题目的头三十秒不知道该干嘛。我刚开始打 CTF 的时候，在 Misc 题上最常见的状态就是盯着文件发呆，然后去搜「这道题用什么工具」。搜出来的答案往往还不对，因为同一张图里可能藏了三种东西，别人只写了其中一种。后来才慢慢摸出一个笨办法：不去想「这题考什么」，而是先回答「我手上这个文件到底是什么」，把 `file`、`exiftool`、`binwalk` 依次跑一遍。这三个命令花不了一分钟，但经常能把题目从「完全没头绪」变成「知道该往哪个方向查了」。方向对了，剩下的才是工具选择的问题。

这份清单按「手上拿到了什么东西」来组织，而不是按工具本身的类别。我挑工具时逐个查了 GitHub 上的活跃度，把失效和长期停更的排除掉了。

需要先说一句：**Misc 里最常用的工具其实不是专门做安全的**。`exiftool` 是摄影师用来清理 EXIF 的，`binwalk` 是路由器固件分析工具，`Audacity` 是音频编辑软件。这一点想通了，找工具的思路会宽很多。

## 一、图片：先看元数据，再动像素

拿到一张图，处理顺序很重要。

第一步永远是用 `exiftool` 看元数据。有时候答案直接写在注释字段里，根本不用动像素。见过太多人在 `zsteg` 里翻半天，其实 `exiftool` 一行就出结果。

```bash
exiftool suspicious.png
```

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| ExifTool | <https://github.com/exiftool/exiftool> | 任何图片音视频的第一步，看元数据、注释、隐藏字段 |
| pngcheck | <https://github.com/pnggroup/pngcheck> | 校验 PNG 结构。改过宽高的图会在这里报错 |
| zsteg | <https://github.com/zed-0xff/zsteg> | PNG/BMP 的 LSB 隐写自动检测，会把各种位平面和编码都扫一遍 |
| Stegsolve | <https://github.com/Giotino/stegsolve> | 图形界面逐通道看图，找肉眼看不见的图层 |
| steghide | Kali 源内 | JPEG/BMP/WAV 隐写，需要密码。配下面的 stegseek 爆破 |
| stegseek | <https://github.com/RickdeJager/stegseek> | steghide 的高速爆破器，穷举密码是秒级 |

`steghide` 我没有给官网链接。它挂在 SourceForge 上，而 SourceForge 现在有 Cloudflare 人机校验，我核实不了普通浏览器能否正常打开，所以不放不确定的地址。装它更省事的办法是用 Kali，它就在源里：

```bash
sudo apt install steghide stegseek
```

`pngcheck` 那条值得展开说。很多题的做法是把图片高度字段改小，让下面一截图看不见。`pngcheck` 会直接报 CRC 不匹配，顺着改回去就看到了。这比在颜色通道里瞎试快得多。

`zsteg` 和 `Stegsolve` 的关系是：前者自动扫，后者手动看。`zsteg` 没结果不代表没有，可能藏在某个特定平面上，这时候换 `Stegsolve` 一个个点。

`Stegsolve` 停在 2023 年，`stegseek` 也是。

这类工具不更新不代表废弃，是功能已经稳定。但新版图片格式可能不支持，遇到奇怪的格式换别的工具试。这一点和 Web 工具很不一样：Web 方向的工具两三年不更新基本就不能用了，因为浏览器和框架一直在变；图片格式的规范二十年没怎么动过，工具也就没必要更新。

## 二、音频：频谱图是主战场

音频隐写的常见手法是把信息画在频谱图上。切到频谱视图，经常能直接看到文字或者图形。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| Audacity | <https://github.com/audacity/audacity> | 切频谱图看隐藏信息。免费开源，各平台都有 |
| Sonic Visualiser | <https://github.com/sonic-visualiser/sonic-visualiser> | 频谱分析比 Audacity 更细，专业音频可视化 |

除了看频谱，音频题还可能考：波形首尾藏数据、左右声道差异、采样率异常、摩斯电码。这些用 Audacity 都能看出来。

## 三、一个文件里套着好几个文件

这是 Misc 最经典的一类。给你一个后缀是 `.jpg` 的文件，其实是 jpg + zip 拼起来的，或者里面还套着 png、pdf、甚至可执行文件。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| binwalk | <https://github.com/ReFirmLabs/binwalk> | 扫描并提取嵌套文件。整套流程基本靠它一个 |

```bash
binwalk -e suspicious.jpg      # 扫描并自动提取
binwalk --dd='.*' suspicious.jpg   # 提取所有识别到的文件
```

binwalk 原本是给路由器固件做分析的，用来拆 CTF 题属于顺手。它能识别几百种文件签名，所以「这文件里到底藏了什么」这个问题，先交给它。

## 四、编码、古典密码、看不出来的字符串

题干给你一串东西，不像 base64，也不像十六进制，看着像随机字符。这时候别急着人肉判断。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| CyberChef | <https://github.com/gchq/CyberChef> | 编码解码加密的瑞士军刀，可以串成流水线。Web 安全那篇也提到过它 |
| Ciphey | <https://github.com/bee-san/Ciphey> | 自动识别并解密未知编码，不用一个个试 |

CyberChef 是英国政府通信总部开源的，浏览器打开就能用，也可以本地部署。它的价值在于你能把「base64 解码 → 异或 → 反转 → zlib 解压」这种链条拖成一条流水线，改一个参数就能重跑。

Ciphey 走的是另一条路：把密文丢进去，它自己判断用了什么编码或密码，然后解出来。

## 五、内存镜像：看进程和网络连接

给一个几个 G 的内存转储文件，问「攻击者做了什么」。这类题在 Misc 里算信息量最大的，因为内存里有进程、命令行、网络连接、剪贴板、浏览器历史。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| Volatility 3 | <https://github.com/volatilityfoundation/volatility3> | 内存取证标准工具，命令行 |
| MemProcFS | <https://github.com/ufrisk/MemProcFS> | 把内存镜像挂载成文件系统，用资源管理器浏览 |

Volatility 的优势是插件多、资料全，缺点是命令要记。

```bash
vol -f memory.dump windows.pslist      # 进程列表
vol -f memory.dump windows.netscan     # 网络连接
vol -f memory.dump windows.cmdline     # 命令行
```

MemProcFS 的思路完全不同：它把内存挂成一堆文件夹，进程、模块、网络连接都是目录。**不熟悉 Volatility 插件的话，先用这个找到可疑进程，再回 Volatility 深挖**，比一上来就背命令快。

## 六、流量包：海量数据里捞出异常

流量分析本身是个大方向，`Wireshark` 是基础（我在 Web 安全那篇里提过它）。但 Misc 里的流量题经常给几百兆的 pcap，靠手工点根本看不完。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| Zeek | <https://github.com/zeek/zeek> | 把 pcap 转成结构化日志，适合大流量里筛异常 |

Zeek 做的事是把流量拆成 `conn.log`、`http.log`、`dns.log` 这些文本表格，然后用 grep、awk 随便筛。比如想看有没有人扫端口、有没有异常的 DNS 查询，直接查日志比在 Wireshark 里过滤快得多。

## 七、压缩包：没密码也能开

给一个加密的 zip 又没给密码。暴力破解慢，但有些情况根本不用破。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| bkcrack | <https://github.com/kimci86/bkcrack> | ZipCrypto 已知明文攻击。知道压缩包里任意一个文件的内容就能反推密钥 |

关键在于 ZipCrypto 这个老加密算法的弱点：知道明文就能恢复内部密钥状态。CTF 里通常会给一个提示文件，或者包里有张一看就知道内容的图，那就够了。

**注意这只对 ZipCrypto 有效，AES 加密的 zip 不行。** 判断方法是用 `7z l -slt` 看加密方式。

## 八、Python 打包的可执行文件

给一个 exe，运行起来是个 Python 小程序。这类题的入口是把它拆回源码。

| 工具 | 地址 | 什么时候用 |
|---|---|---|
| pyinstxtractor | <https://github.com/extremecoders-re/pyinstxtractor> | 解包 PyInstaller 打包的 exe，取出 pyc |

```bash
python pyinstxtractor.py mystery.exe
```

解出来会得到 `.pyc` 文件，再交给对应的反编译器还原成 Python 源码。注意 pyc 的版本要和反编译器匹配，版本不对会报错。

---

## 关于选型的几句话

上面 14 个工具，真正每天在用的其实就五六个：`exiftool`、`binwalk`、`zsteg`、`CyberChef`、`Audacity`。其余的是遇到特定题型才想起来。

所以别急着全装上，先把这五个放在手边。

还有一点比工具重要：**Misc 的题眼通常在题目描述里**。题干提了「节假日」「音乐」「老照片」这类词，往往直接指向解题方向。工具是第二步，第一步永远是读题。

## 这些工具的共同点

写完发现一个规律：它们都不是为 CTF 设计的。

`exiftool` 给摄影师用，`binwalk` 给固件分析用，`Audacity` 给音频编辑用，`Zeek` 给企业网络监控用。CTF 只是把它们的用途拐了个弯。

这意味着两件事。一是这些工具本身很成熟，不用担心质量问题；二是学它们的最好方式是了解它们「本来是干什么的」，而不是背 CTF 里的用法。知道 `binwalk` 是为拆固件而生，你就不会奇怪它为什么能处理那么多文件格式；知道 `exiftool` 是给摄影师清理元数据用的，你就明白为什么它读注释字段那么顺手。反过来，只记「Misc 题用 binwalk」的人，遇到一个不是图片也不是固件的合并文件时就会卡住，因为他不知道这个工具的判断依据是文件签名，而不是文件后缀。工具的名字好记，工具为什么存在不好记，但后者才是能迁移的部分。
