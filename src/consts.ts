/**
 * 飞鱼 · 站点全局配置
 * ------------------------------------------------------------------
 * 这个文件是整站的「控制台」。改这里就能改全站文案、导航、开关。
 *
 * ⚠️ 域名只在这个文件里写一次（SITE.url）。
 *    astro.config.mjs 会从这里读取，不要在两处分别维护 ——
 *    改漏一处会导致 canonical / RSS / sitemap 指向旧域名，
 *    页面本身还能打开，所以很难发现。
 *
 * 换域名的完整步骤：
 *   1. 改下面的 SITE.url
 *   2. 在托管平台绑定新域名、在域名商配置 DNS
 *   3. 重新构建部署
 *   4. 验证：打开任意文章，看源码里的 canonical 是否已是新域名
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
    '飞鱼的技术自留地，记录 Web 安全与 CTF 实战、硬件与嵌入式折腾、以及那些真正好用的工具。',
  /**
   * 站点正式地址。**这是全站唯一的域名来源**。
   *
   * 这个值会被用于：canonical 标签、og:url、结构化数据、
   * RSS 里的文章链接、sitemap。改错或漏改会导致搜索引擎
   * 和订阅者看到的是旧地址。
   *
   * 想换成自有域名时，改成例如 'https://feiyu.me' 即可
   * （https:// 开头，结尾不带斜杠）。见下方"换域名的步骤"。
   */
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
  { text: '视频', href: '/videos/' },
  { text: '标签', href: '/tags/' },
  { text: '归档', href: '/archive/' },
  { text: '关于', href: '/about/' },
] as const;

/**
 * 视频条目。
 *
 * 为什么不用 `as const` 推导：那样数组元素的类型是一个联合类型，
 * 访问可选字段时必须写 `'date' in v ? v.date : undefined` 这类守卫，
 * 而 `in` 只收窄"属性存在"，不保证类型，`v.date` 依然是 unknown，
 * 传给 new Date() 会报错。显式声明接口更省事也更清晰。
 */
export interface VideoItem {
  /** published = 已发布（渲染播放器）；planned = 计划中（只列选题） */
  status: 'published' | 'planned';
  /** 视频标题 */
  title: string;
  /** 一句话说明 */
  desc: string;
  /** 标签，会链接到对应的标签页 */
  tags: string[];
  /**
   * 播放器地址（B 站等平台）。
   * 与 src 二选一，同时提供时优先用 embed。
   */
  embed?: string;
  /** 视频直链（对象存储 / 自建）。与 embed 二选一 */
  src?: string;
  /** 封面图，放 public/videos/ 下 */
  poster?: string;
  /** 时长，例如 "12:34" */
  duration?: string;
  /** 发布日期，格式 YYYY-MM-DD。仅已发布的视频需要 */
  date?: string;
}

/**
 * 视频清单。这是视频区的唯一数据源，加视频只改这里。
 *
 * ⚠️ 用平台嵌入时记得关掉自动播放与弹幕，否则读者一进页面就被打扰。
 */
export const VIDEOS: VideoItem[] = [
  // ── 已发布的视频追加到这里 ──
  // 示例（取消注释并替换成真实数据）：
  // {
  //   status: 'published',
  //   title: '用 Wireshark 定位一次丢包问题',
  //   desc: '从两端同时抓包开始，逐步锁定是哪一跳开始丢的。',
  //   embed: 'https://player.bilibili.com/player.html?bvid=BVxxxxxxxxxx&autoplay=0&danmaku=0',
  //   poster: '/videos/wireshark-cover.jpg',
  //   duration: '12:34',
  //   date: '2026-05-01',
  //   tags: ['网络工程', 'Wireshark'],
  // },

  // ── 计划中的选题 ──
  {
    status: 'planned',
    title: '用 Wireshark 定位一次丢包问题',
    desc: '两端同时抓包，逐步锁定是哪一跳开始丢的。配套文章《抓包分析：从看懂到定位》，可以对着一起看。',
    tags: ['网络工程', 'Wireshark'],
  },
  {
    status: 'planned',
    title: 'VLAN 配置实操：从零配到能通',
    desc: '现场敲一遍 Access、Trunk、Native VLAN，包括几个「配了不通」的典型错误是怎么造成的。',
    tags: ['网络工程', 'VLAN'],
  },
  {
    status: 'planned',
    title: '子网划分手算演示',
    desc: '不讲速记口诀，从头把一个地址规划需求算完，中间故意踩一次坑再纠正。',
    tags: ['网络工程', 'IP'],
  },
  {
    status: 'planned',
    title: 'I2C 传感器读不出数据怎么查',
    desc: '用逻辑分析仪看波形，从 NAK 一路定位到地址左移的问题。配套文章《串口调试从入门到不抓狂》。',
    tags: ['嵌入式', 'I2C', '硬件'],
  },
];

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
