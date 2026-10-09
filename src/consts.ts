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
  { text: '竞赛', href: '/competitions/' },
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

/**
 * 竞赛条目。
 *
 * 用途：把各类竞赛的时间、主办方、官网入口集中记在一处，
 * 报名或查资料时不用每次重新搜索。
 *
 * 字段都做成可选（除名称），因为不同竞赛能拿到的信息差别很大 ——
 * 有的固定每年一届、有的时间待定，有的只有公众号没官网，
 * 强制填全反而会让人写假数据。
 */
export interface CompetitionItem {
  /** 竞赛名称 */
  name: string;
  /**
   * 当前状态，决定它出现在页面的哪一组：
   *   open      —— 报名中（最需要被看到，排最前）
   *   upcoming  —— 即将开始 / 时间已定但未开放报名
   *   recurring —— 常年举办或时间待定（按往届时间参考）
   *   ended     —— 已结束（留档，方便回看赛题）
   */
  status: 'open' | 'upcoming' | 'recurring' | 'ended';
  /** 主办方 */
  organizer?: string;
  /** 一句话简介：考什么、适合谁 */
  desc?: string;
  /**
   * 时间说明。刻意用字符串而不是日期：
   * 竞赛时间往往是"每年 5 月""3 月上旬"这种模糊表述，
   * 强行写成日期反而失真。排序时按字符串倒序即可。
   */
  when?: string;
  /** 报名截止时间，同样是字符串 */
  deadline?: string;
  /** 官网或报名入口 */
  url?: string;
  /** 分类，用于页面分组展示 */
  category?: string;
}

/**
 * 竞赛清单 —— 竞赛页的唯一数据源，增删改都只动这里。
 *
 * 下面两条是示例，换成你真正关注的竞赛即可。
 * 也可以直接删掉，页面会显示空状态提示。
 */
export const COMPETITIONS: CompetitionItem[] = [
  {
    name: '全国大学生信息安全竞赛（CISCN）',
    status: 'recurring',
    organizer: '教育部高等学校信息安全专业教学指导委员会',
    desc: '国内信息安全领域最有分量的赛事之一，分作品赛和技能赛（CTF）。技能赛偏实战，Web、Pwn、逆向、杂项都考。',
    when: '每年上半年，通常 3 月报名、5~6 月比赛',
    url: 'http://www.ciscn.cn/',
    category: 'CTF / 信息安全',
  },
  {
    name: 'CTFHub 技能树 / 竞赛',
    status: 'recurring',
    organizer: 'CTFHub',
    desc: '以技能树闯关形式组织的练习平台，也有定期赛事。适合按知识点系统补漏，HTTP、SQL 注入这类基础题质量不错。',
    when: '技能树常年开放；赛事不定期',
    url: 'https://www.ctfhub.com/',
    category: 'CTF / 练习平台',
  },
];

/** 页脚社交链接 —— 把 href 换成你自己的，留空字符串则不显示该图标 */
export const SOCIALS = [  { name: 'GitHub', href: 'https://github.com/feiyuqifei', icon: 'github' },
  { name: 'RSS', href: '/rss.xml', icon: 'rss' },
] as const;

/**
 * ────────────────────────────────────────────────────────────────
 * 功能开关与占位配置
 * 拿到真实值之前，enabled 保持 false，页面上不会出现空壳。
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Giscus 评论（基于 GitHub Discussions，无后端、无数据库）
 *
 * 已开启。三个前提条件都已满足：
 *   1. 仓库 feiyuqifei.github.io 是 public ✓
 *   2. 仓库设置 → 通用 → 功能 → 勾选「讨论」✓
 *   3. 已安装并授权 Giscus App ✓
 *
 * repoId / categoryId 的来源：
 *   repoId      = 仓库的 node_id（GET /repos/{owner}/{repo} 返回的 node_id）
 *   categoryId  = Discussion 分类的 node id，从 https://giscus.app/zh-CN 生成
 *                 的 <script> 片段里复制（data-category-id 属性）
 *   两者都是 GitHub 的全局唯一 ID（不是名字），仓库改名也不会失效。
 *
 * ⚠️ 换仓库或换分类时，这两个 ID 必须重新获取 —— 它们与名字无关，
 *    改名字段没用，会导致评论框空白且不报错。
 *
 * 关于 category：Announcements 是 Giscus 的惯例选择。
 *   GitHub Discussions 的默认分类名始终显示英文（General / Announcements /
 *   Ideas / Polls / Q&A / Show and tell），即使界面是中文也一样，这是正常的。
 *   若想换成别的分类，需要在 GitHub 侧先建好，再重新取 categoryId。
 */
/**
 * Giscus 配置。
 *
 * ⚠️ 这里刻意**不用 `as const`**。
 * 用 `as const` 会把每个字段收窄成字面量类型，于是
 * `repoId !== ''` 这种"未填写"的运行时校验会被 TS 判定为恒真：
 *   error ts(2367): This comparison appears to be unintentional
 *     because the types '"R_kgDOVBOcQw"' and '""' have no overlap.
 * 显式声明接口既保住可选字段的语义，也让这类校验合法。
 * （同类问题在 VideoItem 上也踩过一次，都是 as const 的收窄副作用。）
 */
export interface GiscusConfig {
  enabled: boolean;
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  /** 页面 ↔ discussion 的映射方式 */
  mapping: 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number';
  /**
   * 严格标题匹配。开启后不再用标题做模糊搜索，
   * 而是计算标题的 SHA-1 哈希、在 discussion 正文里精确查找。
   * 与 mapping: 'og:title' / 'title' 搭配时建议开启。
   */
  strict: boolean;
  lang: string;
}

export const GISCUS: GiscusConfig = {
  enabled: true,
  repo: 'feiyuqifei/feiyuqifei.github.io',
  repoId: 'R_kgDOVBOcQw',
  category: 'Announcements',
  categoryId: 'DIC_kwDOVBOcQ84DHY3i',
  /**
   * 映射方式：用页面的 og:title 匹配 Discussion。
   *
   * 选用 og:title 而不是 pathname 的原因：
   *   pathname 会生成 tools/web-security-toolkit/ 这种标题，
   *   在 GitHub Discussions 列表里既不可读、也无法一眼看出是哪篇文章。
   *   og:title 是「文章标题 | 飞鱼」，检索和管理都直观得多。
   *
   * 注意 og:title 由 SEO.astro 生成，值等于 <title>，
   * 所以改站点名会改变这个值 —— 届时旧 Discussion 会变成孤儿。
   */
  mapping: 'og:title',
  /**
   * 严格标题匹配，必须与 mapping: 'og:title' 搭配使用。
   *
   * GitHub 搜索用的是模糊匹配，标题相近时可能返回错误的 discussion
   * （比如两篇文章标题都含"网络排障"）。开启 strict 后，
   * Giscus 改为计算标题的 SHA-1 哈希、并在 discussion 正文里搜索该哈希，
   * 从而做到精确匹配。
   *
   * ⚠️ 代价：正文里没有该哈希的旧 discussion 将无法被匹配到。
   *    Giscus 新建的 discussion 会自动带上哈希；在此开关之前手工建的
   *    需要在正文里补一行 <!-- sha1: <标题的SHA1> -->。
   *    详见 https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#data-strict
   */
  strict: true,
  lang: 'zh-CN',
};

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
