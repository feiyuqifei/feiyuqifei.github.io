/**
 * 飞鱼 · 站点全局配置
 * ------------------------------------------------------------------
 * 这个文件是整站的「控制台」。改这里就能改全站文案、导航、开关。
 * 部署上线地址：https://feiyuqifei.github.io
 */

export const SITE = {
  /** 站点名称（显示在 Header、SEO title 后缀） */
  name: '飞鱼',
  /** 英文名 / 站点 ID，用于 logo 副标、meta */
  nameEn: 'FEIYU',
  /** 主标语 */
  tagline: '潜得够深，才能跃出水面。',
  /** 站点描述，用于 SEO description 与 RSS */
  description:
    '飞鱼的技术自留地 —— 记录 Web 安全与 CTF 实战、硬件与嵌入式折腾、以及那些真正好用的工具。',
  /** 正式域名。改自定义域名时，这里和 astro.config.mjs 的 site 要一起改 */
  url: 'https://feiyuqifei.github.io',
  /** 作者信息 */
  author: {
    name: '飞鱼',
    /** 关于页与文章页脚展示的一句话 */
    bio: '安全 / 硬件 / 工具，三条线并行折腾。',
    email: '',
  },
  /** 语言 */
  lang: 'zh-CN',
  /** 每页文章数（分页用） */
  postsPerPage: 10,
} as const;

/**
 * 三大板块定义。
 * key 必须与 src/content/posts/ 下的目录名一致，目录名即 URL 前缀。
 *   例：src/content/posts/tech/hello.md  →  /tech/hello
 */
export const SECTIONS = {
  tech: {
    key: 'tech',
    name: '技术文章',
    short: '文章',
    desc: '网络工程、安全研究、CTF 复盘、硬件与嵌入式、踩坑记录',
    icon: '◆',
  },
  tools: {
    key: 'tools',
    name: '工具分享',
    short: '工具',
    desc: '真正用得上的软件、脚本与配置，带下载与避坑',
    icon: '▲',
  },
} as const;

export type SectionKey = keyof typeof SECTIONS;

/** 导航栏 */
export const NAV = [
  { text: '首页', href: '/' },
  { text: '技术文章', href: '/tech/' },
  { text: '工具分享', href: '/tools/' },
  { text: '标签', href: '/tags/' },
  { text: '归档', href: '/archive/' },
  { text: '关于', href: '/about/' },
] as const;

/** 页脚社交链接 —— 把 href 换成你自己的，留空字符串则不显示该图标 */
export const SOCIALS = [
  { name: 'GitHub', href: 'https://github.com/feiyuqifei', icon: 'github' },
  { name: 'RSS', href: '/rss.xml', icon: 'rss' },
] as const;

/**
 * ────────────────────────────────────────────────────────────────
 * 功能开关与占位配置
 * 拿到真实值之前，enabled 保持 false，页面上不会出现空壳。
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Giscus 评论（基于 GitHub Discussions，无后端）
 * 开启步骤：
 *   1. 确认仓库 feiyuqifei.github.io 是 public
 *   2. 仓库 Settings → General → Features → 勾选 Discussions
 *   3. 安装 Giscus App：https://github.com/apps/giscus
 *   4. 打开 https://giscus.app ，填入仓库名，复制下面 4 个值
 */
export const GISCUS = {
  enabled: false,
  repo: 'feiyuqifei/feiyuqifei.github.io',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
  mapping: 'pathname',
  lang: 'zh-CN',
} as const;

/**
 * Umami Cloud 访问统计（无 Cookie、不采集个人数据）
 *
 * 隐私说明（写在配置里，避免日后自己都忘了）：
 *   - Umami 不使用 Cookie，不跨站跟踪，不做指纹识别
 *   - 它记录的是页面浏览量、来源、国家/地区、设备类型这类聚合指标
 *   - 因此本站不需要 Cookie 同意弹窗
 *   - 唯一被加载的第三方脚本就是它（见下方 scriptSrc），
 *     除此之外页面不引用任何外部 JS
 *
 * 开启步骤（已完成，留档备查）：
 *   1. https://cloud.umami.is 注册
 *   2. Add website，填入 https://feiyuqifei.github.io
 *   3. 在网站 Settings → Tracking code 里拿到 script src 和 data-website-id
 */
export const UMAMI = {
  enabled: true,
  scriptSrc: 'https://cloud.umami.is/script.js',
  websiteId: '69ad8fb5-fa2e-4bd7-923a-7a5fdc97f8e0',
} as const;
