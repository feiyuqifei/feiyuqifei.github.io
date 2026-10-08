# 飞鱼 · 个人技术博客

> 潜得够深，才能跃出水面。

用 [Astro](https://astro.build) 构建的静态技术博客，托管在 GitHub Pages。

**线上地址**：<https://feiyuqifei.github.io>

---

## 这个站有什么

| 功能 | 实现方式 |
|---|---|
| 三大板块 | 技术文章 `/tech/`、工具分享 `/tools/`、关于 `/about/` |
| 写文章 | 一个 `.md` 文件就是一篇，放在 `src/content/posts/` 下 |
| 全文搜索 | Pagefind，构建时生成静态索引，零后端、支持中文分词 |
| 深浅色主题 | 手写 CSS 变量 + 首屏防闪白，默认跟随系统 |
| 标签 / 归档 | 动态路由生成，中文标签直接用中文 URL |
| RSS | `/rss.xml`，阅读器可订阅 |
| 代码高亮 | Shiki 双主题，浅色/深色各一套配色，带一键复制 |
| 数学公式 | KaTeX，`$行内$` 与 `$$块级$$` |
| 评论 | Giscus（基于 GitHub Discussions，**需手动开启**） |
| 访问统计 | Umami Cloud（**需手动开启**） |
| 图片优化 | Astro 内置 Sharp，自动生成 WebP 与多尺寸 |
| 自动部署 | 推送到 `main` 即自动构建上线 |

---

## 本地开发

本机没有全局 npm，用 pnpm 即可（**必须是 pnpm 11**，原因见下方"构建"一节）。

```powershell
# 安装依赖
pnpm install

# 启动开发服务器（改文件自动刷新）
pnpm dev

# 构建生产版本（astro build 会自动生成 Pagefind 搜索索引）
pnpm run build

# 本地预览构建产物
pnpm preview

# 类型检查（应为 0 errors / 0 warnings / 0 hints）
pnpm run check

# 交互功能的端到端测试（需要先 build + preview）
pnpm run test:theme    # 主题切换：真实鼠标点击 + 刷新后保持
pnpm run test:copy     # 代码复制：真实点击 + 校验剪贴板实际内容
```

> ⚠️ **搜索只在 `build` 之后可用**。
> `astro dev` 下没有 `/pagefind/` 索引，搜索按钮会被自动隐藏；
> 要测试搜索请先 `pnpm run build`，再 `pnpm preview`。

> ℹ️ 两个 `test:*` 脚本通过 Chrome DevTools Protocol 驱动真实浏览器，
> 用的是**合成鼠标事件**而非 `element.click()`。因此它们能发现
> "元素存在但点不到"这类问题（例如元素在视口之外）。
> 脚本会自动设置足够高的视口并在点击前滚入视野，无需手动干预。

---

## 构建

```powershell
pnpm run build
```

这条命令只做一件事：`astro build`。
搜索索引由 `astro-pagefind` 集成在构建结束的钩子里自动生成，
**不需要也不要再单独调用 `pagefind` CLI** —— 那会重复索引一遍，
而且 `pagefind` 并非本项目依赖，调用它需要额外的网络下载。

**pnpm 版本要求 ≥ 11**：项目在 `pnpm-workspace.yaml` 里用 `allowBuilds`
放行 `esbuild` 的构建脚本，这是 pnpm 11 的配置项。
pnpm 10 不认识它，会静默跳过 esbuild 的 postinstall，
导致构建时找不到 esbuild 二进制。GitHub Actions 工作流里已固定为 11。

---

## 怎么写一篇新文章

1. 在对应板块目录下新建 `.md` 文件：

```
src/content/posts/tech/我的新文章.md    →  /tech/我的新文章/
src/content/posts/tools/某个工具.md      →  /tools/某个工具/
```

> 目录名即 URL 前缀。想加新板块，除了建目录，还要在 `src/consts.ts`
> 的 `SECTIONS` 里加一项，并在 `NAV` 里加入导航。

2. 文件开头写 frontmatter：

```yaml
---
title: '文章标题'                    # 必填
description: '一句话摘要，会显示在列表页和搜索结果里'
pubDate: 2026-10-08                  # 必填，格式 YYYY-MM-DD
updatedDate: 2026-10-10              # 可选，有更新时填
tags: ['Web安全', 'CTF']             # 可选，用于标签页与相关文章推荐
category: '安全'                     # 可选，细分类别
featured: true                       # 可选，标记为精选
draft: false                         # 可选，true 则不出现在任何列表与构建产物中
---
```

3. 正文用标准 Markdown。支持表格、任务列表、脚注、代码块和 KaTeX 公式。

`draft: true` 的文章**不会**进入构建产物，可以放心存在仓库里。

---

## 目录结构

```
blog/
├─ src/
│  ├─ consts.ts              站点全局配置（站名、导航、板块、功能开关）
│  ├─ content.config.ts      内容集合的 schema 定义
│  ├─ content/posts/         所有文章
│  │  ├─ about.md            关于页正文（独立路由 /about/）
│  │  ├─ tech/               技术文章
│  │  └─ tools/              工具分享
│  ├─ layouts/Layout.astro   全站 HTML 骨架
│  ├─ components/            Header / Footer / SEO / 搜索 / 评论 / 目录 …
│  ├─ pages/                 路由
│  │  ├─ index.astro         首页
│  │  ├─ [...slug].astro     文章详情页（catch-all，吃下嵌套路径）
│  │  ├─ [section]/          板块页与分页
│  │  ├─ tags/               标签总览与单个标签页
│  │  ├─ archive.astro       归档
│  │  ├─ about.astro         关于页
│  │  ├─ 404.astro           404（必须叫这个名字，GitHub Pages 才认）
│  │  └─ rss.xml.ts          RSS 端点
│  ├─ scripts/               内联注入的小脚本（防闪白、复制按钮）
│  ├─ styles/                global.css（设计令牌在这里）、katex.css
│  └─ utils/                 日期、URL、文章筛选、列表装配
├─ public/                   静态资源（favicon、头像、OG 图）
├─ scripts/make-assets.py    生成 OG 图与 iOS 图标
└─ astro.config.mjs          站点与 Markdown 配置
```

---

## 改站点信息

绝大部分文案集中在 **`src/consts.ts`**：

- `SITE` —— 站名、标语、描述、作者、每页文章数
- `SECTIONS` —— 板块定义（板块 key 必须与 `content/posts/` 下的目录名一致）
- `NAV` —— 导航栏
- `SOCIALS` —— 页脚的社交链接
- `GISCUS` / `UMAMI` —— 两个可选功能的开关

---

## 开启评论区（Giscus）

代码已就位，但默认关闭 —— 因为 Giscus 需要三个前提条件，
缺任何一个评论区都会**空白且不报错**，排查起来很痛苦。

1. 确认仓库 `feiyuqifei.github.io` 是 **public**
2. 仓库 **Settings → General → Features** → 勾选 **Discussions**
3. 到 <https://github.com/apps/giscus> 安装 Giscus App 并授权该仓库
4. 打开 <https://giscus.app>，填入仓库名，页面会生成 `repo-id` 和 `category-id`
5. 把这四个值填进 `src/consts.ts` 的 `GISCUS`，并把 `enabled` 改成 `true`

## 开启访问统计（Umami）

1. 到 <https://cloud.umami.is> 注册
2. **Add website**，填入 `https://feiyuqifei.github.io`
3. 在网站 **Settings → Tracking code** 里找到 `script src` 和 `data-website-id`
4. 把这两个值填进 `src/consts.ts` 的 `UMAMI`，并把 `enabled` 改成 `true`

---

## 部署

推到 `main` 分支即自动部署，工作流在 `.github/workflows/deploy.yml`。

**首次部署前必须在 GitHub 上做一件事**：

> 仓库 **Settings → Pages → Source** 必须选择 **GitHub Actions**。
> 不设置的话工作流会在部署步骤报权限错误。

以后每次 `git push` 都会自动重新构建并上线，通常 1–2 分钟生效。

---

## 技术选型说明

几个刻意的决定，避免后来的人（包括未来的自己）困惑：

- **不用 Tailwind**。博客的样式量不大，手写 CSS + 自定义属性零依赖零构建风险，
  而且深浅色主题用 CSS 变量表达是最自然的。
- **不用 satteri 处理器**。Astro 7 默认的 Markdown 管线 satteri 不支持
  remark/rehype 生态插件，而 KaTeX 需要它们，所以显式换回 `unified()`。
- **仓库名就是 `feiyuqifei.github.io`**。这样站点挂在域名根部，
  不需要配置 `base` —— 否则所有资源路径都要加前缀，是最经典的 404 来源。
- **日期按 `Asia/Shanghai` 计算**。用 `toISOString()` 取日期会按 UTC 算，
  东八区凌晨发布的文章会被算到前一天。
