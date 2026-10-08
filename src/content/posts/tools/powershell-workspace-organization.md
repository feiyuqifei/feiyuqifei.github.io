---
title: '用 PowerShell 给乱糟糟的工作区做一次数据整理'
description: '把散落各处的比价记录、脚本和报告自动归类、去重、生成索引。全程用 PowerShell 原生命令，零依赖，附完整可复用脚本。'
pubDate: 2026-02-08
tags: ['PowerShell', '自动化', 'Windows']
category: '工具'
featured: true
---

我的工作区一度有六十多个文件平铺在根目录：脚本、报告、
临时导出的 HTML、各种 `_final` `_final2` `_v2` 命名的文档。
找东西全靠搜索，而且经常发现同一份报告有三个版本，
不确定哪个是最新的。

这篇记录我用 PowerShell 做的一次彻底整理。
**全程零依赖**，不需要装任何东西，Windows 自带就能跑。

## 一、先看清楚现状，别急着动手

整理最忌讳的就是上来就 `Move-Item`。先做一次统计：

```powershell
# 统计根目录各类型文件的数量和总大小
Get-ChildItem -File |
    Group-Object Extension |
    Sort-Object Count -Descending |
    Select-Object @{N='类型';E={$_.Name}},
                  @{N='数量';E={$_.Count}},
                  @{N='总大小KB';E={
                      [math]::Round(($_.Group | Measure-Object Length -Sum).Sum / 1KB, 1)
                  }} |
    Format-Table -AutoSize
```

这一条命令会告诉你**哪类文件最多**。我第一次跑的时候发现
`.md` 有 20 多个、`.ps1` 有 15 个、各种导出的 `.html` 有 6 个，
立刻就清楚了整理的重点在哪。

## 二、按"会不会再用"分类，而不是按格式

按扩展名分类是偷懒，真正有用的是按**用途**分。
我用的四分类：

| 类别 | 目录 | 判断标准 |
|---|---|---|
| 项目 | `projects/` | 有独立目录、还在迭代的 |
| 文档 | `docs/` | 最终交付物，不再改动的报告 |
| 脚本 | `scripts/` | 可复用的工具脚本 |
| 存档 | `archive/` | 三个月没动过的 |

关键是 `archive/`——**不要删，移走就行**。
删文件的心理成本太高，会导致你一直拖着不整理。

```powershell
# 找出 90 天内没修改过、也没访问过的文件
$cutoff = (Get-Date).AddDays(-90)
Get-ChildItem -File -Recurse |
    Where-Object { $_.LastWriteTime -lt $cutoff -and $_.LastAccessTime -lt $cutoff } |
    Select-Object FullName, LastWriteTime |
    Format-Table -AutoSize
```

> 注意：Windows 默认可能关闭了"最后访问时间"更新（为了性能）。
> 如果 `LastAccessTime` 看起来全是今天，用管理员权限执行
> `fsutil behavior set disablelastaccess 0` 打开，或者干脆只看 `LastWriteTime`。

## 三、识别重复文件：用哈希而不是文件名

`_final` `_final2` `_v2` 这种命名说明你在手动做版本管理，
结果就是同一份内容有多个副本。找出真正重复的：

```powershell
# 按内容哈希找重复文件
Get-ChildItem -File -Recurse |
    Where-Object { $_.Length -gt 1KB } |      # 跳过空文件和极小文件
    Get-FileHash -Algorithm SHA256 |
    Group-Object Hash |
    Where-Object Count -gt 1 |
    ForEach-Object {
        "===== 重复组（$($_.Count) 份，哈希 $($_.Name.Substring(0,12))...）====="
        $_.Group | Select-Object -ExpandProperty Path
        ""
    }
```

**为什么先过滤 `Length -gt 1KB`**：哈希几千个小文件很慢，
而小文件重复通常无所谓。先按大小分组再算哈希会更快：

```powershell
# 更快的做法：只有大小相同的文件才值得算哈希
Get-ChildItem -File -Recurse |
    Group-Object Length |
    Where-Object { $_.Count -gt 1 -and $_.Name -ne '0' } |
    ForEach-Object { $_.Group } |
    Get-FileHash -Algorithm SHA256 |
    Group-Object Hash |
    Where-Object Count -gt 1 |
    ForEach-Object { $_.Group | Select-Object -ExpandProperty Path }
```

## 四、安全地批量改名

整理时最想做的就是把 `某某报告_final_v2_已订正.pdf`
改成规范的 `2026-10-07_传感器比价_第2组.pdf`。

**但改名是不可逆操作的开始**，必须加两重保险：

```powershell
# 保险一：先 dry run，只打印不执行
$plan = Get-ChildItem -File -Filter '*比价*' | ForEach-Object {
    # 从内容里提取日期，提取不到就跳过
    if ($_.BaseName -match '(\d{4})[-_](\d{2})[-_](\d{2})') {
        $date = "$($Matches[1])-$($Matches[2])-$($Matches[3])"
        [PSCustomObject]@{
            Old = $_.Name
            New = "${date}_$($_.BaseName -replace '.*?(\d{4}[-_]\d{2}[-_]\d{2})[_-]?','')$($_.Extension)"
        }
    }
}

$plan | Format-Table -AutoSize
# 确认输出没问题，再执行下一段
```

```powershell
# 保险二：执行前先建映射表，出问题能倒推
$log = "rename-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
$plan | Export-Csv $log -NoTypeInformation -Encoding UTF8
$plan | ForEach-Object {
    if ($_.New -and $_.New -ne $_.Old) {
        Rename-Item -LiteralPath $_.Old -NewName $_.New -WhatIf
    }
}
```

**`-WhatIf` 是 PowerShell 最好的功能之一**。
它会把"将要做什么"打印出来但不真的做。
把上面最后一行的 `-WhatIf` 去掉才会真正执行。
养成"先带 `-WhatIf` 跑一遍"的习惯，能避免绝大部分误操作。

## 五、生成索引，让以后不用再整理

整理完还会再乱，所以关键产出是一份**自动生成的索引**：

```powershell
$out = "INDEX.md"
"# 工作区索引" | Set-Content $out -Encoding UTF8
"`n> 自动生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n" | Add-Content $out -Encoding UTF8

Get-ChildItem -Directory | Sort-Object Name | ForEach-Object {
    "## $($_.Name)`n" | Add-Content $out -Encoding UTF8
    $files = Get-ChildItem $_.FullName -File -Recurse |
             Sort-Object LastWriteTime -Descending
    if ($files) {
        foreach ($f in $files) {
            $rel = $f.FullName.Replace((Get-Location).Path + '\', '')
            $size = [math]::Round($f.Length / 1KB, 1)
            "- [$($f.Name)]($rel) · ${size}KB · $($f.LastWriteTime.ToString('yyyy-MM-dd'))" |
                Add-Content $out -Encoding UTF8
        }
    } else {
        "- （空）" | Add-Content $out -Encoding UTF8
    }
    "" | Add-Content $out -Encoding UTF8
}

"索引已生成：$out"
```

把它存成 `scripts/update-index.ps1`，
以后每次整理完跑一次就行。配合任务计划程序每天自动跑，
索引永远不会过期。

## 六、几个真正省时间的细节

**1. 中文文件名在 PowerShell 5.1 里会乱码**

Windows PowerShell 5.1 默认用 GBK 读写文件，
处理中文路径时经常出问题。两个解法：

```powershell
# 解法一：显式指定编码（推荐）
Get-Content $file -Encoding UTF8
Set-Content $out -Encoding UTF8

# 解法二：干脆用 PowerShell 7（pwsh），它默认就是 UTF-8
```

**2. `-LiteralPath` 比 `-Path` 安全**

路径里含 `[` `]` `*` `?` 时，`-Path` 会把它们当通配符解析，
导致"文件明明存在却找不到"。**含方括号的路径一定要用 `-LiteralPath`。**

**3. `Measure-Object` 算总大小**

```powershell
# 算整个目录大小
(Get-ChildItem -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
```

比 `Get-ChildItem | Measure` 快，因为只取 `Length` 属性。

**4. 先备份再整理**

```powershell
# 整理前打个压缩包，比什么都强
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Compress-Archive -Path .\* -DestinationPath "..\backup-$stamp.zip" -CompressionLevel Optimal
```

我现在的习惯是：**任何批量操作之前先压一个包**。
几百 MB 的压缩包换一整个下午的安心，很值。

## 七、最后的效果

整理之后根目录从 60 多个文件降到 8 个（项目目录 + 索引 + 备份），
其余都归位了。更重要的是**每周花十分钟跑一下索引脚本**，
就不会再积累到需要大整理的程度。

这类事情的价值不在脚本本身有多精妙——
而在于**你终于有了一个可以重复执行的流程**，
而不是每次靠记忆和手工。

---

配套的三个脚本（`organize.ps1`、`find-duplicates.ps1`、
`update-index.ps1`）我整理后会单独发一篇工具分享，
带上完整的参数说明和出错处理。
