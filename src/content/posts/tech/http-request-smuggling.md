---
title: 'HTTP 请求走私：当代理和后端吵起来'
description: '请求走私的本质不是"发一个畸形请求"，而是利用两个服务器对请求边界的不同理解。这篇从一个 CTF 题目出发，把 CL.TE、TE.CL、TE.TE 三种情形讲透。'
pubDate: 2026-03-02
updatedDate: 2026-03-10
tags: ['Web安全', 'CTF', 'HTTP', '请求走私']
category: '安全'
featured: true
---

做 CTF 的时候遇到一道请求走私题，卡了很久。事后复盘发现，
卡住的原因不是不会用工具，而是**没真正理解"请求边界"这件事**。

这篇把这个概念讲清楚。

## 一、问题的根源：谁来切分请求？

HTTP/1.1 是文本协议，一个 TCP 连接上可以发多个请求。
那么服务器怎么知道第一个请求到哪里结束、第二个从哪里开始？

答案靠两个头部之二：

- `Content-Length: 13` —— 后面还有 13 个字节是请求体
- `Transfer-Encoding: chunked` —— 请求体是分块传输的，以 `0\r\n\r\n` 结束

正常情况两者只出现一个，大家理解一致，相安无事。

**问题出在中间有代理的时候。** 典型架构是：

```
客户端  →  前端代理（Nginx/CDN）  →  后端服务器（应用）
```

前端代理和后端服务器是**两套独立的 HTTP 实现**。
如果它们在以下问题上给出不同答案，走私就发生了：

> 同时看到 `Content-Length` 和 `Transfer-Encoding` 时，听谁的？

RFC 7230 规定：**应该以 `Transfer-Encoding` 为准，并忽略 `Content-Length`**。
但现实是，很多实现不遵守，或者遵守得不一样。

## 二、三种情形

### CL.TE：前端看 Content-Length，后端看 Transfer-Encoding

前端用 CL 切分，后端用 TE 切分。

```http
POST / HTTP/1.1
Host: target.com
Content-Length: 13
Transfer-Encoding: chunked

0

SMUGGLED
```

**前端视角**：`Content-Length: 13`，所以它取后面 13 个字节：
`0\r\n\r\nSMUGGLED`（注意 `\r\n` 各算一个字节）。
前端认为这一个请求就结束了，把整包转发给后端。

**后端视角**：有 `Transfer-Encoding: chunked`，所以按分块解析。
读到 `0\r\n\r\n` 就认为**请求体结束**了——
于是 `SMUGGLED` 这段被留在了缓冲区里。

结果：`SMUGGLED` 成了下一个请求的开头。
如果后面来了另一个用户的请求，后端会把 `SMUGGLED` 和它拼在一起解析，
攻击者就能**劫持别人的请求**或者**投毒缓存**。

### TE.CL：反过来

前端看 TE，后端看 CL。

```http
POST / HTTP/1.1
Host: target.com
Content-Length: 4
Transfer-Encoding: chunked

5c
GPOST / HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Content-Length: 15

x=1
0


```

前端按分块解析，把整个东西当一个请求体读完转发。
后端看 `Content-Length: 4`，只读 4 个字节：`5c\r\n`。
剩下的 `GPOST / HTTP/1.1 ...` 就成了下一个请求。

> 这里有个手工构造时极易出错的地方：**`\r\n` 必须是真实的回车换行，
> 而且要精确字节对齐**。用 Burp 的话记得关掉 "Update Content-Length"，
> 否则它会好心帮你改数字，整个 payload 就废了。

### TE.TE：两边都看 TE，但有一边能被骗

两个服务器都支持 `Transfer-Encoding`，但其中一个会被畸形的 TE 头骗到，
从而**忽略它**，退回用 CL。

常见的混淆写法：

```http
Transfer-Encoding: chunked
Transfer-Encoding: x

Transfer-Encoding : chunked
Transfer-Encoding: chunked
Transfer-Encoding: identity
Transfer-Encoding: chunked

Transfer-Encoding:\tchunked
X: X
```

思路是：一个服务器能正确处理（或忽略）这个畸形头，另一个不能。
具体哪个生效取决于两边的实现，需要逐个试。

## 三、CTF 里的这道题

题目给了个 Nginx 反代 + 后端 Flask 的组合。前端 Nginx 对
`Transfer-Encoding: chunked` 的处理是标准的，但**后端 Flask 的
WSGI 服务器在同时看到 CL 和 TE 时优先用了 CL**——这就是 TE.CL。

关键步骤：

1. 先用 Burp 的 Repeater 关掉自动修正 Content-Length
2. 发一个探测包，观察响应时间和状态码的异常
3. 构造 TE.CL payload，把 `GPOST /admin` 走私进下一个请求
4. 因为靶场没有其他用户，用 `Connection: keep-alive` 补发第二个请求
   让走私的内容被当作那个请求处理

拿到 flag 的那一刻才真正明白：**这不是"发坏包"，这是精确利用解析差异。**

## 四、怎么防御

如果你在防守方，这几条是真正有效的：

| 措施 | 说明 |
|---|---|
| 拒绝同时出现 CL 和 TE 的请求 | 最彻底，直接返回 400 |
| 统一用 HTTP/2 到后端 | HTTP/2 是二进制分帧，没有这个问题 |
| 前端 normalize 后再转发 | 但要注意实现是否真的规范 |
| 禁用后端对 TE 的支持 | 只在确定不需要时可行 |

**最容易被忽略的一条**：`Transfer-Encoding` 头部一旦出现，
就应该把 `Content-Length` 完全丢弃——不是"忽略"，是"当作不存在"，
并且**不要用它做任何长度校验**。

## 五、手工测试时的实操清单

这部分是我自己踩过坑总结的，比理论更容易出错：

- [ ] 确认 Burp 未开启 "Update Content-Length"（Repeater 右上角）
- [ ] 用 `\r\n` 而不是 `\n`，在 Burp 里打开十六进制视图核对字节数
- [ ] 计算 CL 时把回车换行都算进去
- [ ] 先发探测包确认是哪一种（CL.TE 还是 TE.CL），别直接上 payload
- [ ] 注意连接复用——靶场里需要用 keep-alive 补第二个请求
- [ ] 观察响应时间：走私成功常常表现为**响应延迟**或**后续请求拿到别人的响应**

## 六、我的理解

请求走私之所以有意思，是因为它攻击的不是某个具体的代码缺陷，
而是**系统之间的理解差异**。

这类漏洞在别的地方也反复出现：

- 路径解析差异（`/admin/..;/` 绕过鉴权）
- 编码差异（Unicode 规范化导致的绕过）
- 参数解析差异（`a=1&a=2` 取第一个还是最后一个）

**只要有"两个组件各自实现同一个规范"，就有可能出现这类问题。**
这也是为什么我觉得理解原理比背 payload 重要得多——
payload 会过期，但"找出解析差异"这个思路不会。

---

参考与延伸阅读：

- [RFC 7230 §3.3.3](https://datatracker.ietf.org/doc/html/rfc7230#section-3.3.3) —— 规范原文，值得逐字读一遍
- PortSwigger Web Security Academy 的 Request Smuggling 实验环境，免费且循序渐进
