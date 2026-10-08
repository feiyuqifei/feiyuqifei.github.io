---
title: 'VLAN 与交换网络：为什么"配了不通"，以及怎么一次配对'
description: 'VLAN 的配置命令只有几条，但配错的概率很高 —— 因为真正的难点在链路两端的角色匹配。这篇把 Access/Trunk、PVID、Native VLAN 的关系讲透，并给出一份配置检查清单。'
pubDate: 2026-03-22
tags: ['网络工程', 'VLAN', '交换机', '二层']
category: '网络'
---

VLAN 的配置命令可能只有几条：

```
vlan 10
interface GigabitEthernet0/1
 switchport mode access
 switchport access vlan 10
```

但我在现场见过的 VLAN 故障，比路由故障还多。
原因不是命令难，而是**它涉及链路两端的一致性** ——
一端配了、另一端没配，或者角色反了，就不通。
而且"不通"的表现往往没有报错，只有沉默。

这篇把 VLAN 的关键概念捋一遍，重点是**那些会静默失败的地方**。

## 一、先问：为什么需要 VLAN

三个真实动机，按我遇到频率排序：

1. **隔离广播域**。同一个二层网络里设备太多，
   ARP 广播会拖慢所有设备。划 VLAN 把广播限制在小范围。
2. **安全隔离**。财务和设备管理网不该和访客在同一个二层。
   即使有三层防火墙，二层能直接 ARP 到对方本身就是风险。
3. **复用物理设备**。一台交换机接多个部门，
   不需要为每个部门拉一套独立布线。

**关键认知**：VLAN 是**二层隔离**，不是安全边界。
VLAN 之间的通信靠三层设备（路由器或三层交换机）转发，
那里才是能施加策略的地方。

> **一个常见误解**：以为划了 VLAN 就安全了。
> 实际上如果三层设备上配了"VLAN 间全通"的策略，
> 隔离效果等于零。真正的隔离要在三层做 ACL。

## 二、两个角色：Access 与 Trunk

这是最容易搞混的地方，也是最容易配错的地方。

### Access 口

**接终端设备** （PC、打印机、AP、服务器）。特点：

- 属于**一个** VLAN
- 收发的帧**不带** VLAN 标签
- 终端设备完全不知道 VLAN 的存在

```
interface Gi0/1
 switchport mode access
 switchport access vlan 10
```

终端发出来的无标签帧进来，交换机打上 VLAN 10 的标签；
出去的时候把标签剥掉再发给终端。**终端侧永远看不到标签。**

### Trunk 口

**接另一台交换机、路由器或需要多 VLAN 的设备**。特点：

- 承载**多个** VLAN
- 帧**带** 802.1Q 标签（4 字节，插在源 MAC 之后）
- 除了 Native VLAN（默认 VLAN 1）的帧不带标签

```
interface Gi0/24
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30
 switchport trunk native vlan 99
```

**`allowed vlan` 这一条最容易被忽略，也最容易造成"不通"。**
默认是 `all`（放行所有 VLAN），但有些环境出于安全
会手工限制。如果只放行了 10,20 而你需要 30，就不通，
**而且交换机不会报错**。

> **我的习惯**：Trunk 口上永远显式写 `allowed vlan`，
> 哪怕就是 `all`。这样半年后别人看配置时，
> 不会怀疑"这里到底是默认还是漏配了"。

## 三、PVID 与 Native VLAN：同一个东西的两个名字

这是混乱的重灾区。

**它们指的是同一件事**：Trunk 口上"不打标签的那个 VLAN"。

| 厂商 | 叫法 |
|---|---|
| Cisco | Native VLAN |
| 华为 / H3C | PVID（Port VLAN ID） |
| Linux bridge | `pvid` / `untagged` |

**为什么需要它**：802.1Q 标签是后加的，
要兼容不支持 VLAN 的老设备，所以规定
"某一个 VLAN 的帧在 Trunk 上不打标签"。

**问题来了**：两端 Native VLAN 配成不一样会怎样？

假设 A 端 Native VLAN 10，B 端 Native VLAN 20：

- A 端把 VLAN 10 的帧**不打标签**发出去
- B 端收到无标签帧，按自己的 Native VLAN 20 打标签
- **结果：VLAN 10 的流量跑进了 VLAN 20**

这就叫 **VLAN 跳跃（VLAN Hopping）**，是个真实的安全问题。
两端该看到的东西跑到了一起，会造成：
数据串台、策略失效、甚至能被利用来做跨 VLAN 攻击。

**所以：Trunk 两端的 Native VLAN 必须一致，
并且最好改成没人用的 VLAN（比如 999）** ，
而不是默认的 VLAN 1。

```
# 两端都要改，建议改成一个专门的"黑洞"VLAN
switchport trunk native vlan 999
```

## 四、"配了不通"的六个常见原因

按我遇到的实际频率排：

### 1. 一端 Access、一端 Trunk

```
交换机 A  Gi0/24: switchport mode access, vlan 10
交换机 B  Gi0/24: switchport mode trunk
```

A 端发无标签帧，B 端按 Native VLAN（默认 1）打标签，
流量全进了 VLAN 1，而 VLAN 10 里什么都没有。

**表现**：VLAN 10 内的设备完全不通，也没有任何报错。

### 2. Trunk 的 allowed vlan 漏了

如上所述。**排查命令**：

```
# Cisco
show interfaces trunk
show interfaces Gi0/24 switchport

# 华为
display port vlan
display interface GigabitEthernet0/0/24
```

### 3. Native VLAN 两端不一致

会造成 VLAN 串台。**检查方法**：两端都看 native vlan 配置，
必须一致。

### 4. 忘了建 VLAN

Cisco 上如果 VLAN 10 没在 `vlan database` / 全局配置里创建过，
`switchport access vlan 10` 在某些平台上会失败或行为异常。

```
# 先建再配，这是稳妥顺序
vlan 10
 name OFFICE
```

**养成习惯：先建 VLAN，再往端口上配。**

### 5. 三层接口没配 IP（VLAN 间不通）

VLAN 内通了，但跨 VLAN 不通 —— 这通常不是二层问题，
而是缺少三层网关：

```
# 三层交换机上给每个 VLAN 配 SVI
interface Vlan10
 ip address 192.168.10.1 255.255.255.128
 no shutdown
```

**注意 `no shutdown`** —— SVI 默认可能是关闭的，
这个坑我踩过，配了 IP 却不通，查了半天。

### 6. 终端自己带了 VLAN 标签

如果终端（某些服务器网卡、虚拟化平台）配置了 VLAN tagging，
而交换机端口是 Access 模式，就会冲突。
**虚拟化环境里特别常见** ——
vSwitch 上打了标签，物理交换机也打了，变成双层标签。

## 五、配置检查清单

我现在配 VLAN 时按这个顺序走，能避开上面绝大多数问题：

- [ ] **规划表**：VLAN ID、名称、网段、网关 写下来（别只在脑子里）
- [ ] **两端设备**都创建 VLAN（先建，再配端口）
- [ ] **Access 口**：确认连接的是终端，模式是 access，VLAN 正确
- [ ] **Trunk 口**：两端**都是** trunk
- [ ] **allowed vlan**：显式写出需要的 VLAN 列表
- [ ] **native vlan**：两端一致，且改成非默认值（如 999）
- [ ] **三层网关**：SVI 配 IP 且 `no shutdown`
- [ ] **终端侧**：确认没有自己做 VLAN tagging
- [ ] **验证**：同 VLAN 能通、跨 VLAN 按策略通、不该通的不通

最后一条 **“不该通的不通”** 同样要测。
我见过只测了"该通的通了"就交付，
结果隔离策略没生效，VLAN 之间全通。

## 六、验证命令

配完必须验证，别靠"应该没问题"。

```
# Cisco：看所有 trunk 口的状态和放行的 VLAN
show interfaces trunk

# 看某个端口的完整二层信息（模式、VLAN、native）
show interfaces Gi0/24 switchport

# 看 VLAN 列表和成员端口
show vlan brief

# MAC 地址表 —— 确认设备学到了、并且学在正确的 VLAN 里
show mac address-table
show mac address-table vlan 10
```

**`show mac address-table vlan 10` 是我最常用的验证命令**。

如果 VLAN 10 的 MAC 表里能看到两台终端的 MAC，
说明二层学习正常；如果空的，说明这个 VLAN 里根本没有流量，
问题在链路或端口配置。

```
# 华为 / H3C 对应命令
display port vlan
display vlan
display mac-address
```

## 七、一个我印象很深的排查

有次一个部门的网络时通时断。配置看起来完全正常：
Access 口对、Trunk 对、VLAN 建了、网关也配了。

最后发现是 **Trunk 的 allowed vlan 漏了 VLAN 30，
但网络"大部分时候能用"** —— 因为那个部门主要是访问
VLAN 10 里的文件服务器（同 VLAN，不经过 Trunk），
只有访问 Internet 时才需要跨 VLAN，而 Internet 访问
恰好是"偶尔用一下"，所以用户描述成"时通时断"。

**这个案例教了我两件事**：

1. **用户的描述往往是错的。** "时通时断"实际是"部分功能不通"。
   要问"具体哪个操作不通"，而不是接受"网络不稳定"这个说法。
2. **"看起来正常"不等于正常。** 每条 Trunk 的 allowed vlan
   都该显式核对，而不是看一眼"有配"就过。

后来我把这条加进了检查清单：
**逐条列出每个 Trunk 应该放行哪些 VLAN，然后逐个核对。**
多花五分钟，省掉一次返工。

## 最后

VLAN 不难，但它有个特点：**它的错误大多是静默的**。

路由不通会给你 ICMP unreachable，
端口 down 会给你日志，
但 VLAN 配错往往什么都不说，只是不通。

所以在这个领域，**"配完必验"比"配得熟"更重要**。
我宁愿慢五分钟把清单走完，
也不愿花两小时去找一个漏掉的 VLAN 号。

---

这个网络系列目前四篇：

1. [IP 地址与子网划分](/tech/ip-subnetting/) —— 会算网段
2. [能 ping 通但业务不通](/tech/network-troubleshooting/) —— 按层次定位
3. [抓包分析：从看懂到定位](/tech/packet-analysis/) —— 拿确定结论
4. 本篇 —— 二层交换机这一层怎么配、怎么验
