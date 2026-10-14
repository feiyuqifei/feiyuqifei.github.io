---
title: 'Kali 虚拟机里鼠标箭头不见了，怎么修'
description: 'VMware 里的 Kali 鼠标出问题有三种完全不同的情况：箭头看不见、鼠标被吸住出不来、指针点不准。搞混了就白折腾。这篇给出判断方法、根因和各自的正解。'
pubDate: 2026-10-15
tags: ['Kali', 'VMware', '虚拟机', '排障']
category: '工具'
featured: true
---

事情是这样的：Kali 装好了，界面也改成中文了，然后鼠标箭头不见了。

不是鼠标坏了。图标会高亮，按钮会变色，文字能选中，点哪哪响应，就是屏幕上那个箭头一个像素都没画出来。

这种情况网上教程很多，但大部分是 2024 年以前写的，照着做不但没用，还可能把图形界面搞崩。我花了一段时间把这事查清楚，中间还验证了一批「常见建议」全是无效的。这篇是结论。

## 零、先花三十秒判断你是哪一种

这是全文最重要的一节。鼠标问题至少有三种，原因和解法完全不同，**别混着试**。

| 现象 | 属于哪种 | 看第几章 |
|---|---|---|
| 鼠标能动、点击有效，但完全看不到箭头 | 隐身鼠标 | 第一章 |
| 箭头看得到，但点进虚拟机就出不来，要按 Ctrl+Alt | 鼠标被吸住 | 第二章 |
| 箭头在，但卡顿、漂移、点 A 却点到 B | 指针不准 | 第三章 |
| 用了一会儿、或者挂起恢复之后箭头才消失 | 属第一种（挂起是触发点） | 第一章 |
| 一开机就没有箭头 | 属第一种 | 第一章 |

口诀：看不见但点得动是显示问题，看得见但出不来是抓取问题，看得见但点不准是加速或设置问题。

## 一、箭头看不见（最常见）

### 1.1 确认症状

四条全中才是这一章的问题：

- 鼠标能移动：图标会高亮、按钮会变色、文字能选中
- 点击有效：能打开窗口、能关掉窗口
- 屏幕上就是看不到箭头
- 鼠标移出虚拟机窗口回到 Windows 桌面时，Windows 里的光标完全正常

少任何一条，请回到第零章重新对照。

### 1.2 为什么会这样

三个事实凑在一起造成的。

**事实一**：Kali 现在用的是 `modesetting` 通用驱动。2025 年 11 月，Kali 把 `xserver-xorg-video-vmware`（VMware 专用显卡驱动）永久移除了。从那以后，Kali 在 VMware 里默认走通用驱动。

**事实二**：`modesetting` 的硬件光标默认是开着的。Debian 手册页写得很清楚：

```
Option "SWcursor" boolean
    Selects software cursor.  The default is off.
```

默认 off，意思是默认用硬件光标，由显卡硬件去画那个箭头，而不是系统软件来画。

**事实三**：VMware 虚拟显示适配器加上硬件光标，再碰上某些宿主机显卡驱动，会出 bug。结果是光标逻辑上在动，但一个像素都没画出来。

至于为什么挂起恢复之后特别容易触发：那一刻虚拟机会把所有输入设备移除再重新枚举，在 `/var/log/Xorg.0.log` 里能看到 `device removed` 和 `device is a pointer` 交替出现几十行。硬件光标图层在这时最容易重建失败。

所以解法方向只有一个：让 X 别用硬件光标。

### 1.3 正解

三步。

**第一步**，创建配置目录：

```bash
sudo mkdir -p /etc/X11/xorg.conf.d
```

目录已存在也不会报错，放心执行。

**第二步**，写入配置。整段复制粘贴即可：

```bash
sudo tee /etc/X11/xorg.conf.d/20-swcursor.conf > /dev/null <<'EOF'
Section "Device"
    Identifier "Configured Video Device"
    Driver "modesetting"
    Option "SWcursor" "true"
EndSection
EOF
```

粘贴不了就手动创建再编辑：

```bash
sudo nano /etc/X11/xorg.conf.d/20-swcursor.conf
```

把上面 `Section` 到 `EndSection` 五行原样打进去，然后 Ctrl+O 回车保存、Ctrl+X 退出。

**第三步**，重启：

```bash
sudo reboot
```

重启后箭头应该立刻出现。

### 1.4 两个必须写对的地方

写错任意一个，轻则无效，重则图形界面直接起不来，只剩黑底白字的登录界面。

| 项目 | 必须这样写 | 绝对不能这样写 | 原因 |
|---|---|---|---|
| 驱动名 | `Driver "modesetting"` | `Driver "vmware"` | vmware 驱动在 Kali 里已经不存在，写了会让 X 启动失败 |
| 选项名 | `Option "SWcursor" "true"` | `Option "HWCursor" "false"` | HWCursor 是另一个驱动的选项，modesetting 不认，会被静默忽略 |

再强调一次：网上 2024 年以前的所有教程都在教你装 `xserver-xorg-video-vmware`、改 `HWCursor`。那是当时的正确做法，但现在包已经被 Kali 移除，照抄只会白费时间，甚至把图形界面搞崩。

### 1.5 验证是否真的生效

重启后跑这一条：

```bash
grep -i cursor /var/log/Xorg.0.log | tail -10
```

判断标准：

- 没有警告，说明配置被采纳
- 看到 `(WW) modeset(0): Option "HWcursor" is not used` 或类似的 `is not used`、`No such option`，说明配置没被读取，Device 段落没匹配上，把配置内容和命令输出发出来重新分析

还有个更直观的验证：按 `Ctrl+Alt` 释放鼠标，再点回虚拟机窗口。配置正常的话，进出虚拟机窗口会非常顺滑，不需要反复按 Ctrl+Alt。

### 1.6 改配置之前，先用运行时命令确认

改 `/etc/X11/xorg.conf.d/` 有搞崩图形界面的风险，所以最好先用不改配置的方式验证方向：

```bash
sudo apt install -y xinput
xinput list
```

找到名字里带 `VMware ... Mouse` 的那一行，记下 id 号，然后：

```bash
xinput set-prop <id> "Device Enabled" 0
xinput set-prop <id> "Device Enabled" 1
```

把 `<id>` 换成实际的数字，比如 8。关掉再打开，强制 X 重建光标。

如果这一步光标就恢复了，说明判断完全正确，可以放心去写 1.3 的配置文件。

### 1.7 已经验证无效的做法

下面这些都是网上教程的常见建议，对这个 bug 全部无效：

| 常见建议 | 为什么无效 |
|---|---|
| 重装 `open-vm-tools-desktop` | 现代 Kali 里它本来就是装好的，进程也在正常跑 |
| 换光标主题 | 主题设置本身正常，与这个 bug 无关 |
| 装 `xserver-xorg-video-vmware` | 已被 Kali 移除，没有安装候选，根本装不上 |
| 调整 Windows 显示缩放或 DPI 兼容性 | 与机制无关 |
| 重装 VMware Workstation | 与机制无关 |
| 直通 USB 鼠标接收器给虚拟机 | 会让问题更复杂，不是解法 |

还有一类是临时救急的，解决不了根本问题但能救场：

| 操作 | 说明 |
|---|---|
| 按 `Ctrl + Alt` | 释放再重新抓取输入，X 会重建一次光标。最快，先按这个 |
| `Alt + F2` 然后输入 `r` 回车 | 重启 GNOME Shell，光标立即重画（GNOME 桌面有效） |
| `Ctrl + Alt + F2`，再 `Ctrl + Alt + F1` | 切到文字终端再切回来，重建整个图形会话。XFCE 等桌面都有效 |

顺便一个判断技巧：切到 Ctrl+Alt+F2 的文字终端时，字符光标是正常显示的。如果 tty 里有光标、回到图形界面就没有，就百分之百确认是 X11 显示层的问题，不是硬件坏了、不是驱动缺失、不是鼠标坏了。

## 二、鼠标被吸进虚拟机出不来

点进 Kali 窗口之后，指针被锁在虚拟机里，移到窗口边缘也出不来，必须按 Ctrl+Alt 才能回到 Windows。

救急就是按 `Ctrl + Alt`，立刻释放。

永久解决要先把虚拟机**关机**（不是挂起），然后：VMware 菜单 → 虚拟机 → 设置 → 选项标签 → 客户机隔离。在这个页面里：

1. 勾选「启用拖放」和「启用复制粘贴」
2. **取消勾选「为游戏优化鼠标」**，这个选项会让指针被独占抓取
3. 确认输入抓取处于启用状态

改完开机，鼠标就能自由穿进穿出虚拟机窗口了。

## 三、指针卡顿、漂移、定位不准

箭头看得见，但移动不跟手、漂移，或者点 A 却点到 B，经常差几十个像素。按顺序排查四步。

**第一步**，确认 `open-vm-tools` 的两个进程都在：

```bash
ps -ef | grep vmtoolsd | grep -v grep
```

正常应该看到两个：

```
root       490   1  ... /usr/bin/vmtoolsd
kali      1855   1  ... /usr/bin/vmtoolsd -n vmusr --blockFd 3
```

第一个是系统级进程，第二个是用户态进程，指针坐标同步靠它。只有系统级、没有用户态的话，先注销重新登录；还不行就重启服务：

```bash
sudo systemctl restart open-vm-tools
```

**第二步**，关掉 3D 加速。关机 → 虚拟机设置 → 硬件 → 显示器 → 取消勾选「加速 3D 图形」→ 开机。

**第三步**，检查有没有把 USB 设备直通进虚拟机。如果你把无线鼠标的接收器直通给了 Kali，宿主机和虚拟机会抢同一个指针，表现就是指针乱飘。到虚拟机设置 → USB 控制器，把直通的 USB 设备全部断开。

**第四步**，换个鼠标测试。插一个 USB 有线鼠标：换了就好，说明是原鼠标被虚拟机抓取的问题，回到第三步；换了还一样，说明不是鼠标的问题，回到第一章或者检查虚拟机显示设置。

## 四、操作纪律

这一章比命令更重要。

### 4.1 改 X 配置之前必须先做快照

在改 `/etc/X11/xorg.conf.d/` 下任何文件之前：

VMware 菜单 → 虚拟机 → 快照 → 拍摄快照 → 命名，例如「改光标配置前 2026-10-14」。

出问题后一键回滚：虚拟机 → 快照 → 快照管理器 → 选中快照 → 转到。

为什么必须这么做，因为 `xorg.conf.d` 里的配置会在 X 启动时被优先读取，写错驱动名会让整个图形界面起不来。有快照，最坏情况是花三十秒回滚；没快照，最坏情况是花两小时重装。

### 4.2 万一图形界面真的起不来了

别慌，这三步一定救得回来。

**第一步**，在文字界面登录（账号 `kali` 密码 `kali`，root 是 `root` 密码 `toor`），删掉可疑配置：

```bash
sudo rm -f /etc/X11/xorg.conf.d/20-swcursor.conf
```

不确定文件名就先看一眼目录：

```bash
ls -l /etc/X11/xorg.conf.d/
```

**第二步**，重启显示管理器，不用重启系统，几秒见效：

```bash
sudo systemctl restart display-manager
```

**第三步**，还不行就重启：

```bash
sudo reboot
```

配置已经删了，图形界面一定会回来。

两个补充说明。文字界面里没有复制粘贴是正常的，tty 本身不支持图形剪贴板，而且剪贴板同步靠的用户态 `vmtoolsd` 进程也随着 X 一起没了，先把图形界面救回来，剪贴板自然就有了。另外手打长路径记得用 Tab 补全：输入 `sudo rm -f /etc/X11/xorg` 按 Tab，再输入 `20-sw` 按 Tab，几乎不可能打错。

### 4.3 演示或答辩前一天要做的四件事

1. 做快照，命名带日期
2. 完整升级并重启：`sudo apt update && sudo apt full-upgrade -y`
3. 手动跑一遍演示流程：打开终端、跑一条命令、验证光标和复制粘贴都正常
4. 演示当天不要让宿主机休眠或合盖，挂起恢复是光标消失最常见的触发点

再加一条保险：演示前把光标修好的状态拍成快照，现场真出问题，回滚只要三十秒。

## 五、速查

判断：

| 现象 | 结论 |
|---|---|
| 看不见箭头，但点得动 | 硬件光标 bug，用下面「正解」 |
| 看得见箭头，但出不来 | 输入抓取，按 Ctrl+Alt，去改客户机隔离 |
| 看得见箭头，但点不准 | 加速或直通冲突，关 3D 加速、断 USB 直通 |
| tty 里有光标、图形界面没有 | 确认是 X11 显示问题，放心改配置 |

正解（光标看不见）：

```bash
sudo mkdir -p /etc/X11/xorg.conf.d
sudo tee /etc/X11/xorg.conf.d/20-swcursor.conf > /dev/null <<'EOF'
Section "Device"
    Identifier "Configured Video Device"
    Driver "modesetting"
    Option "SWcursor" "true"
EndSection
EOF
sudo reboot
```

救急（图形界面起不来）：

```bash
sudo rm -f /etc/X11/xorg.conf.d/20-swcursor.conf
sudo systemctl restart display-manager
sudo reboot
```

检查命令：

```bash
grep -i cursor /var/log/Xorg.0.log | tail -10   # 光标相关警告
grep -E '\(EE\)' /var/log/Xorg.0.log | tail -20  # X 的报错
grep -i 'Using.*driver' /var/log/Xorg.0.log      # X 在用哪个驱动
ps -ef | grep vmtoolsd | grep -v grep            # 应当有 2 个进程
```

三条铁律：

1. 改 `/etc/X11/xorg.conf.d/` 之前必须做快照
2. 不要装 `xserver-xorg-video-vmware`，Kali 已移除，装不上也不需要
3. 配置里的驱动名必须写系统里真实存在的，写错会让图形界面直接起不来

## 六、原理：为什么 Kali 会变成这样

这一节供理解用，排查问题时不需要看。

`xserver-xorg-video-vmware` 是 VMware 虚拟显卡的 Xorg 专用驱动，同时提供硬件光标和自动分辨率调整两个功能。

2025 年 11 月 11 日，它被移出 kali-rolling。原因是两个 bug，其中一个较严重：该驱动的最新版（13.4.0-2）针对新版 mesa 重建后，移除了对 XA（X acceleration）加速库的支持。上游 VMware 开发者的评价是：

> The driver is basically useless without XA and unlikely to work well, if at all.

Kali 管理员的结论是「There's nothing we can do in Kali at this point」。于是 Kali 采取两个替代措施：

| 失去的功能 | Kali 的替代方案 |
|---|---|
| 光标正常显示 | 改用 `modesetting` 驱动，并通过 `SWcursor` 强制软件光标 |
| 自动分辨率调整 | 安装 `xautoresize` 包，注销重登后生效 |

这就解释了为什么网上 2024 年以前的教程都在教你装那个包：那时候这样做是对的，但现在情况变了。

## 怎么判断一篇教程是不是过时了

看到 VMware 加 Kali 的显示类教程，先看两点。

它是否让你安装 `xserver-xorg-video-vmware`？是的话，跳过。

它写的选项是 `HWCursor` 还是 `SWcursor`？`HWCursor` 加 `Driver "vmware"` 是过时的，`SWcursor` 加 `Driver "modesetting"` 方向才对。

最可靠的做法是直接看 `/var/log/Xorg.0.log`，它会告诉你系统现在到底在用什么驱动、哪个选项没生效。日志永远比教程新。
