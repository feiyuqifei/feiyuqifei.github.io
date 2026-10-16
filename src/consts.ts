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
 * 板块定义。
 *
 * 首页的板块卡片、导航、以及 [section] 动态路由都由这里驱动。
 *
 * 两种板块：
 *   1. **文章板块**（tech / tools）—— key 必须与 src/content/posts/ 下的
 *      目录名一致，目录名即 URL 前缀。
 *        例：src/content/posts/tech/hello.md  →  /tech/hello
 *      列表页由 src/pages/[section]/index.astro 自动生成。
 *
 *   2. **自定义页面板块**（competitions）—— 内容不是文章，
 *      而是自己写的独立页面。这类必须声明 href 指向该页面，
 *      动态路由会跳过它，避免与静态页面争同一路径。
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
  /**
   * 竞赛板块。
   *
   * 与 tech / tools 同级：首页板块卡片、导航、以及访问路径都并列。
   * 区别是它不由 Markdown 文章驱动 —— 内容来自 COMPETITIONS 配置，
   * 页面是手写的 src/pages/competitions.astro。
   *
   * 之所以给 href 而不是靠 key 推导路径：动态路由 [section] 会把
   * key 当路径段，那样会和静态的 competitions.astro 争同一个 URL。
   * 显式声明 href 后，动态路由跳过本板块，两者不冲突。
   */
  competitions: {
    key: 'competitions',
    name: '竞赛',
    short: '竞赛',
    desc: '各类信息安全竞赛的报名时间、地点、主办方与参考题解',
    icon: '★',
    href: '/competitions/',
  },
} as const;

export type SectionKey = keyof typeof SECTIONS;

/**
 * 板块的访问路径。
 *
 * 统一在这里判断，避免「有 href 用 href、否则用 key」的逻辑散落在
 * 首页、导航、分页等多处 —— 一旦散开，以后改规则很容易漏掉某处。
 */
export function sectionHref(section: (typeof SECTIONS)[SectionKey]): string {
  return 'href' in section && section.href ? section.href : `/${section.key}/`;
}

/**
 * 是否由 Markdown 文章驱动（决定要不要生成 [section] 动态路由）。
 * 自定义页面板块返回 false，避免与静态页面争同一路径。
 */
export function isPostSection(section: (typeof SECTIONS)[SectionKey]): boolean {
  return !('href' in section && section.href);
}

/** 导航栏 */
export const NAV = [
  { text: '首页', href: '/' },
  { text: '技术文章', href: '/tech/' },
  { text: '工具分享', href: '/tools/' },
  { text: '视频', href: '/videos/' },
  { text: '竞赛', href: '/competitions/' },
  { text: '成员', href: '/team/' },
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
  /**
   * 锚点 id，用于从文章里直接链到某个视频（/videos/#<id>）。
   * 只给需要被引用的视频加，用短横线分隔的英文，别用中文。
   */
  id?: string;
}

/**
 * 视频清单。这是视频区的唯一数据源，加视频只改这里。
 *
 * ⚠️ 用平台嵌入时记得关掉自动播放与弹幕，否则读者一进页面就被打扰。
 */
export const VIDEOS: VideoItem[] = [
  // ── 已发布的视频追加到这里 ──
  {
    status: 'published',
    id: 'kali-locale',
    title: 'Kali 中文教程',
    desc: '把 Kali 的界面改成中文，全程实录。核心命令是 dpkg-reconfigure locales，它做的是重新配置系统的语言／地区设置：先勾选生成 zh_CN.UTF-8，再把它设为默认 locale，重启后登录界面就变中文了。',
    src: '/videos/kali-chinese-locale.mp4',
    poster: '/videos/kali-chinese-locale-cover.jpg',
    duration: '2:16',
    date: '2026-10-15',
    tags: ['Kali', 'Linux', '虚拟机'],
  },

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
 * 用途：把各类竞赛的时间、地点、主办方、官网入口集中记在一处，
 * 报名或查资料时不用每次重新搜索。
 *
 * 字段都做成可选（除名称与分组），因为不同竞赛能拿到的信息差别很大 ——
 * 有的固定每年一届、有的时间待定，有的只有公众号没官网，
 * 强制填全反而会让人写假数据。
 */
export interface CompetitionItem {
  /** 竞赛名称 */
  name: string;
  /**
   * 所属板块。目前只有一个：
   *   infosec —— 信息安全竞赛
   * 以后要加别的方向（如算法竞赛、机器人大赛），在这里扩展即可。
   */
  group: CompetitionGroupKey;
  /**
   * 当前状态，决定它出现在页面的哪一组：
   *   open      —— 报名中（最需要被看到，排最前）
   *   upcoming  —— 即将开始 / 时间已定但未开放报名
   *   recurring —— 常年举办或时间待定（按往届时间参考）
   *   ended     —— 已结束（留档，方便回看赛题）
   */
  status: 'open' | 'upcoming' | 'recurring' | 'ended';
  /**
   * 报名月份，用于按月分组与排序。取值 1~12。
   *
   * 为什么用"月份"而不是完整日期：
   * 竞赛报名时间每年浮动（今年 3 月、明年可能 4 月），
   * 写死具体日期第二年就错了；而"通常几月报名"这个规律相对稳定，
   * 按月归档既好找又不那么容易过期。
   * 拿不到月份就留空，页面会归入「时间待确认」。
   */
  month?: number;
  /**
   * month 是否经过查证。
   *
   * true  —— 打开过当届通知原文，月份是抄下来的
   * false / 省略 —— 未查证，月份是按常见规律推断的，**可能错**
   *
   * 页面会对未查证的条目显示「月份待核实」标记。
   * 这不是形式主义：竞赛月份报错会让人整年错过报名，
   * 必须让读者一眼看出哪些数字可以信、哪些要自己去核实。
   */
  monthVerified?: boolean;
  /**
   * 报名时间的文字说明，例如「3 月上旬 — 4 月 10 日」。
   * 这是给出具体信息的地方，month 只负责排序。
   */
  registerAt?: string;
  /** 报名截止时间（文字），例如「4 月 10 日 24:00」 */
  deadline?: string;
  /** 比赛时间（文字），例如「5 月 17 日初赛，6 月决赛」 */
  when?: string;
  /** 比赛地点，例如「线上初赛 + 西安线下决赛」 */
  location?: string;
  /** 主办方 */
  organizer?: string;
  /** 指导方 / 支持单位 */
  advisor?: string;
  /** 竞赛简介：考什么、适合谁 */
  desc?: string;
  /** 面向人群与学历要求，例如「全国在校本专科生，含高职高专组」 */
  eligibility?: string;
  /** 官网或报名入口 */
  url?: string;
  /**
   * 参考 writeup（题解）。
   *
   * 设计成数组而不是单个链接，因为一个赛事往往有多届、多篇题解。
   * 同时支持两种来源：
   *   external —— 别人的题解，会标注作者并加外链图标
   *   local    —— 自己写的，走站内链接（本地优先显示在前面）
   *
   * 这样以后自己在博客里写了题解，只要把 url 改成站内路径、
   * 把 kind 改成 'local' 即可，不必改页面结构。
   */
  writeups?: CompetitionWriteup[];
}

/** 参考题解条目 */
export interface CompetitionWriteup {
  /** 题解标题，例如「2026 楚慧杯 Misc Writeup」 */
  title: string;
  /** 链接。外链填完整 URL，站内填 /posts/xxx/ 这类路径 */
  url: string;
  /** external = 他人题解；local = 自己写的 */
  kind: 'external' | 'local';
  /** 作者，仅外链需要 */
  author?: string;
  /** 备注，例如「杂项方向」 */
  note?: string;
}

/**
 * 竞赛板块。竞赛页按板块分节渲染，每节内部再按报名月份分组。
 * 以后加新方向（算法、机器人等）只需在这里加一项。
 */
export const COMPETITION_GROUPS = {
  infosec: {
    key: 'infosec',
    name: '信息安全竞赛',
    desc: '网络安全、CTF、数据安全方向的赛事。按报名月份归档，方便提前安排。',
  },
} as const;

export type CompetitionGroupKey = keyof typeof COMPETITION_GROUPS;

/**
 * 参赛记录（荣誉历史）条目。
 *
 * 与 CompetitionItem 的区别：
 *   CompetitionItem  —— 「有哪些比赛可以参加」，面向未来，是全站共用的信息
 *   CompetitionRecord —— 「我参加过哪些、拿了什么」，面向过去，是个人履历
 * 两者数据来源不同（前者查官网通知，后者靠自己记录），所以分开两个数组，
 * 竞赛页上用标签切换显示，互不干扰。
 *
 * 只有 year 和 name 是必填的，其余按需填。
 * 没有把握的字段宁可留空，也不要写一个看起来具体、实际记不清的值。
 */
export interface CompetitionRecord {
  /** 年份。用于分组与倒序排列（新的在前） */
  year: number;
  /** 赛事名称。建议与 COMPETITIONS 里的名称保持一致，方便对照 */
  name: string;
  /**
   * 奖项等级。用字符串而不是枚举，因为各赛事叫法不统一：
   * 「一等奖」「二等奖」「三等奖」「优胜奖」「银牌」「入围决赛」都可能出现。
   */
  award?: string;
  /**
   * 组别，例如「本科组」「高职高专组」「公开组」「学生组」。
   * 团体赛与个人赛混在一起时，这个字段能说清是哪个赛道的成绩。
   */
  category?: string;
  /**
   * 名次，例如「第 12 名」「全国前 30」。
   * 与 award 分开是因为有的赛事只公布名次不设奖项，反之亦然。
   */
  rank?: string;
  /** 队友。个人赛留空 */
  teammates?: string[];
  /**
   * 证书或官方公示的链接。
   * 放可验证的地址（组委会公示页、证书图片），比只写奖项更有说服力。
   */
  certificate?: string;
  /** 补充说明，例如「首次参赛」「以大一带二」这类值得记一句的话 */
  note?: string;
}

/**
 * 参赛记录清单 —— 竞赛页「荣誉历史」标签的唯一数据源。
 *
 * 目前为空：这些是站长本人的真实经历，只能由他自己填。
 * 留空时页面会显示一段说明而不是空白，避免看起来像坏了。
 *
 * 填写示例（取消注释并改成真实内容即可）：
 *   {
 *     year: 2026,
 *     name: '全国大学生信息安全竞赛·创新实践能力赛',
 *     award: '二等奖',
 *     category: '本科组',
 *     rank: '华南赛区第 8 名',
 *     teammates: ['张三', '李四'],
 *     certificate: 'https://example.com/cert/12345',
 *     note: '第一次打进线下决赛',
 *   },
 */
export const COMPETITION_RECORDS: CompetitionRecord[] = [
  {
    year: 2026,
    name: '信息安全与对抗技术竞赛（ISCC）',
    /*
      600 / 10000 是「排名 / 参赛规模」。
      规模经官网核实：ISCC2026 简况写明「共 12700 余人报名」，
      与站长给的 10000 量级吻合，所以这个解读成立。
      ISCC 由北京理工大学发起，2004 年国内首创，2026 年为第 23 届。
    */
    rank: '600 / 10000',
    note: 'ISCC2026（第 23 届）。官网简况显示本届线上挑战赛共 12700 余人报名，覆盖中小学生、大学生与研究生。',
  },
  {
    year: 2026,
    name: '长城杯 网络安全大赛暨京津冀蒙网络安全技能竞赛（俗称「小长城杯」）',
    /*
      赛事归属要写准：证书名「长城杯安全卫士」对应的是
      京津冀蒙网络安全技能竞赛（俗称小长城杯），
      不是 CISCN 体系下同名的「长城杯 网数智安全大赛·防护赛」。
      本站竞赛库里这两条是分开收录的，不要混。
    */
    rank: '217 / 1500',
    teammates: ['黄光辉', '廖祥裕'],
    note: '获长城杯安全卫士证书。队长黄光辉，队员廖祥裕。',
  },
  {
    year: 2026,
    name: '学校科研项目：计算机网络安全数据防御系统',
    /*
      「第二作者」是身份而不是名次，所以放 award（渲染成徽章）
      而不是 rank（会渲染成「名次 第二作者」，语义不通）。
    */
    award: '第二作者',
    note: '黄光辉为第二作者。',
  },
];

/**
 * 竞赛清单 —— 竞赛页的唯一数据源，增删改都只动这里。
 *
 * 时间信息说明：下面标注的报名时间是**最近一届**的实际时间，
 * 用于推断「通常几月报名」。当届时间务必以官网为准。
 */
export const COMPETITIONS: CompetitionItem[] = [
  /*
   * ⚠️ 关于时间字段的可靠性等级（重要，改数据前先读）
   *
   *   [查证] —— 我打开过通知原文，时间是抄下来的，可信
   *   [推断] —— 只查到届数或大致季节，月份是我按常见规律推的，可能错
   *   [未知] —— 没查到，留空归入「时间待确认」
   *
   * 为什么要标这个：竞赛不比其他内容，月份报错会让人整年错过报名。
   * 宁可显示「待确认」，也不要写一个看起来具体、实际是猜的月份。
   * 你补数据时请优先消灭 [推断]。
   */

  /* ─────── CISCN 体系：这是三个独立赛事，不是一个 ─────── */
  {
    name: '全国大学生信息安全竞赛·创新实践能力赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第十九届官方《参赛规程》：报名截止 12/21，初赛 2025/12/28，半决赛 2026/3/22，总决赛 2026/7 */
    month: 12,
    monthVerified: true,
    registerAt: '11 月上旬 — 12 月 21 日',
    deadline: '12 月下旬（0 时截止）',
    when: '12 月下旬线上初赛 → 次年 3 月下旬分赛区半决赛 → 次年 7 月全国总决赛',
    location:
      '线上初赛 + 六大分赛区线下半决赛 + 总决赛。赛区划分：辽宁赛区（辽吉黑京鲁）、陕西赛区（陕宁青新晋蒙甘）、浙江赛区（沪浙苏皖）、广东赛区（粤桂闽琼港澳赣）、湖北赛区（鄂豫冀津）、重庆赛区（川渝云贵藏湘）',
    organizer: '中国信息安全测评中心、教育部高等学校网络空间安全专业教学指导委员会',
    advisor: '中国互联网发展基金会',
    eligibility:
      '全日制在校学生（含高职高专、本科生、硕士研究生）；每队 ≤4 人，可校内跨年级跨专业，不可跨校；不收报名费',
    desc: 'CISCN 的实战赛道。每家高校最多 2 支队伍晋级分区半决赛（半决赛承办校多 1 个名额），各赛区取不超过 100 支队伍；分区赛前 5 名直接晋级总决赛，总决赛名额约 80 个。半决赛参赛者获 NISP 一级证书，总决赛一等奖获 CISP-PTE 证书。',
    url: 'http://www.ciscn.cn/index.php/competition/securityCompetition?compet_id=44',
    writeups: [
      {
        title: '2024 全国大学生信息安全竞赛初赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/1b1f96e/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: '长城杯 网数智安全大赛·防护赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 与 CISCN 创新实践能力赛合并初赛与半决赛；决赛 2026/4 福州 */
    month: 12,
    monthVerified: true,
    registerAt: '与 CISCN 创新实践能力赛同步（11 月 — 12 月）',
    deadline: '12 月下旬',
    when: '12 月下旬线上初赛 → 次年 3 月下旬半决赛 → 次年 4 月决赛',
    location: '决赛拟于福州，与第九届数字中国建设峰会同期举办',
    organizer: '中国信息安全测评中心等',
    advisor: '教育部高等学校网络空间安全专业教学指导委员会',
    eligibility: '同 CISCN 创新实践能力赛',
    desc: '与 CISCN 创新实践能力赛合并初赛和半决赛，决赛单独举办。各赛区半决赛取前 25 支队伍晋级。决赛一等奖获 CISP-PTE 证书，二等奖与专项奖获 NISP 二级证书。',
    url: 'http://ccb.itsec.gov.cn/',
  },
  {
    name: '全国大学生信息安全竞赛·作品赛（自由作品赛道）',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 竞赛章程第二十三条：报名 3—6 月，决赛 7—8 月，9/1 前完成 */
    month: 3,
    monthVerified: true,
    registerAt: '3 月 — 6 月（章程规定的原则时间）',
    deadline: '6 月下旬（网上报名与作品提交同期截止）',
    when: '6 月底公布初赛名单，7 月线上初评，7—8 月线下决赛',
    location: '线上初评 + 承办高校线下决赛（历届由不同高校承办）',
    organizer: '教育部高等学校网络空间安全专业教学指导委员会',
    advisor: '中国互联网发展基金会',
    eligibility:
      '全国在校全日制本、专科大学生均可参加，专业不限（章程第十二条）；每队 ≤4 人含组长，不允许跨校组队；每队参赛费 200 元',
    desc: '开放式自主命题、自主设计，提交作品与报告，偏创新设计与工程实现，不是 CTF。章程第二十条明确「只接受防御性题目，不接受任何具有攻击性质」的题目。第十九届起与「长城杯」作品赛合并。',
    url: 'http://www.ciscn.cn/index.php/competition/securityCompetition?compet_id=45',
  },
  {
    name: '全国大学生信息安全竞赛·命题挑战赛',
    group: 'infosec',
    status: 'recurring',
    /* [推断] 与作品赛同期，章程未单列；月份沿用作品赛 */
    month: 3,
    registerAt: '与作品赛同期（推断，待查证）',
    when: '与作品赛同期（推断，待查证）',
    location: '见官网',
    organizer: '教育部高等学校网络空间安全专业教学指导委员会',
    advisor: '中国互联网发展基金会',
    desc: 'CISCN 的第三个赛道：主办方给出命题（官方通知附《命题挑战赛赛题》），参赛队按命题完成作品。第十九届起与「长城杯」作品赛合并。⚠️ 时间沿用作品赛，未单独核实。',
    url: 'http://www.ciscn.cn/index.php/competition/securityCompetition?compet_id=46',
  },
  {
    name: '京津冀大学生信息安全网络攻防大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 2026 年官方通知（天津市大学软件学院发布）：报名 7/1—9/10，初赛 9/13，决赛 10/11 */
    month: 7,
    monthVerified: true,
    registerAt: '7 月上旬 — 9 月上旬',
    deadline: '9 月 10 日',
    when: '9 月中旬线上初赛 → 10 月中旬线下决赛',
    location: '线上初赛 + 天津市大学软件学院线下决赛',
    organizer: '天津市教育委员会、北京市教育委员会、河北省教育厅',
    advisor: '承办：天津市大学软件学院（京津冀软件人才培养基地）；协办：天津工业大学；技术支持：奇安信',
    eligibility:
      '⚠️ 仅限天津市、北京市、河北省【普通本科高校】全日制本科在校生，无专业限制。专科生与外省学生均不能参加',
    desc: '初赛为理论知识（30%）+ CTF（70%），理论涵盖信息安全政策法规、密码学、网络与云安全，CTF 涵盖逆向、漏洞挖掘与利用、Web 安全。决赛为「渗透测试（50%）+ 应急响应（50%）」实战赛。不收取任何费用；一等奖团队获奇安信 QCCA 应急响应认证及安全服务团队实习面试资格。入围决赛队伍不超过初赛报名总数的 50%。',
    url: 'https://www.tjise.edu.cn/info/1008/5580.htm',
  },
  {
    name: '强网杯 全国网络安全挑战赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第九届：9—11 月，10 月下旬线上赛，11 月下旬线下赛 */
    month: 9,
    monthVerified: true,
    registerAt: '9 月 — 10 月',
    when: '10 月下旬线上赛，11 月下旬线下赛',
    location: '线上初赛 + 郑州线下决赛',
    organizer:
      '河南省委网信办、河南省教育厅、郑州市人民政府、信息工程大学、郑州大学、中国网络空间安全协会',
    advisor: '中央网信办、河南省人民政府',
    eligibility:
      '国内高校、企业、机构等网络安全力量；须中国国籍（不含港澳台）；线上赛每队 ≤10 人，线下赛每队 ≤4 人',
    desc: '国家级网络安全赛事，含线上赛、线下赛、行业领域专项赛（漏洞智能分析、天基互联网安全、车联网安全）与创新创业专项赛。线下赛取线上排名前 32 支队伍。',
    url: 'https://www.qiangwangbei.com',
    writeups: [
      {
        title: '2023 强网杯全国网络安全挑战赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/5f3fb7a/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
      {
        title: '2025 强网拟态防御国际精英挑战赛线下总决赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/353513a/',
        kind: 'external',
        author: 'Lunatic',
        note: '强网品牌下的另一项赛事',
      },
      {
        title: '2024 强网拟态防御国际精英挑战赛初赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/de8e2be/',
        kind: 'external',
        author: 'Lunatic',
        note: '强网品牌下的另一项赛事',
      },
    ],
  },
  {
    name: '羊城杯 网络安全大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 2025 年：报名 9/15—10/6，初赛 10/11—12，决赛 10/25 */
    month: 9,
    monthVerified: true,
    registerAt: '9 月中旬 — 10 月上旬',
    deadline: '10 月上旬（24:00 截止）',
    when: '10 月中旬线上初赛，10 月下旬线下决赛',
    location: '线上初赛 + 广州线下决赛',
    organizer: '广州市委网信办',
    advisor: '广州市网络安全宣传周系列活动之一',
    eligibility:
      '面向全国。设本科院校组、高职高专组、党政机关及事业单位组、企业组',
    desc: '自 2020 年已连续举办五届，累计 6300 多支队伍、1.3 万余人参赛。初赛为在线 CTF，涵盖 Web 安全、逆向、移动安全、二进制漏洞挖掘、密码学、取证分析、隐写分析。本科组前 24 名、其余各组前 12 名进决赛。',
    url: 'https://ycb.dasctf.com',
    writeups: [
      {
        title: '2024 羊城杯网络安全大赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/4a27616/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
      {
        title: '2023 羊城杯网络安全大赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/940b876/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: '楚慧杯 网络与数据安全实践能力竞赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第十届：报名截止 2026/1 下旬，资格赛 3 月上旬，挑战赛 3 月下旬 */
    month: 1,
    monthVerified: true,
    registerAt: '12 月下旬 — 次年 1 月下旬',
    deadline: '1 月下旬',
    when: '3 月上旬资格赛，3 月下旬挑战赛',
    location: '线上资格赛 + 武汉国家网安基地线下挑战赛',
    organizer:
      '湖北省委网信办、湖北省教育厅、湖北省公安厅、湖北省数据局、湖北省通信管理局',
    advisor:
      '国家计算机网络应急技术处理协调中心湖北分中心、武汉市委网信办、国家网安基地',
    eligibility:
      '面向中华人民共和国境内合法组织与公民。分 W 组（机关企事业单位）、L 组（院校学生，含中等/高等/职业院校）、A 组（安全专业机构）、Q 组（技术爱好者，无挂靠单位可自由组队）',
    desc: '已办至第十届。聚焦人工智能、物联网、车联网、云计算、大数据，设夺旗赛、综合防御赛、靶场渗透赛。资格赛约前 55 支队伍晋级。Q 组对学生最友好，不需要学校推荐即可报名。',
    url: 'http://www.whwx.gov.cn/',
    writeups: [
      {
        title: '2026 楚慧杯湖北省网络与数据安全实践能力竞赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/59dcb62/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
      {
        title: '2024 楚慧杯网络与数据安全实践能力竞赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/69e332a/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
      {
        title: '2023 楚慧杯网络空间安全实践能力竞赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/fde34a9/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: 'HKCERT CTF 香港网安夺旗赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] CTFtime 记录 2026 资格赛 11/6—11/7 */
    month: 11,
    monthVerified: true,
    registerAt: '10 月下旬 — 11 月上旬',
    when: '11 月上旬资格赛，决赛 12 月',
    location: '线上',
    organizer:
      '香港特区政府数字政策办公室、香港生产力促进局、香港网络保安事故协调中心（HKCERT）',
    desc: '香港官方网安夺旗赛，已办至第六届，CTFtime 权重 10.31。公开报名，港澳台及境外选手均可参加，地理上离广西近。',
    eligibility: '公开赛，无学历与地域限制',
  },

  /* ─────── 以下均为查证过的其他赛事 ─────── */
  {
    name: '网鼎杯 网络安全大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第四届：报名截止 2024/10/20 17 时，资格赛 10 月下旬，半决赛与决赛 11 月下旬于贵阳 */
    month: 10,
    monthVerified: true,
    registerAt: '10 月上旬 — 10 月 20 日',
    deadline: '10 月 20 日 17 时',
    when: '10 月下旬线上官方资格赛 → 11 月下旬半决赛与总决赛（线下）',
    location: '线上资格赛 + 贵阳线下半决赛与总决赛',
    organizer: '贵阳市人民政府、贵州省公安厅',
    advisor: '公安部、教育部共同指导；国家网络与信息安全信息通报中心、教育部教育管理信息中心、网络空间安全专业教学指导委员会支持；公安部第一研究所承办',
    eligibility:
      '面向重要行业部门、科研机构、高等院校、网络安全企业、互联网企业和网络安全从业人员；每队 1—4 人（可另设 1 名领队），可以个人名义参赛。经高校通道报名者一般限在校本科生、研究生',
    desc: '预计 600 支队伍晋级半决赛、60 支晋级总决赛。赛题覆盖人工智能、车联网、物联网、5G，设夺旗赛、综合防御赛、靶场渗透赛三类。以行业分组对抗著称。',
    url: 'https://www.wangdingcup.com/',
    writeups: [
      {
        title: '2024 网鼎杯网络安全大赛青龙组 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/1a285be/',
        kind: 'external',
        author: 'Lunatic',
        note: '青龙组 · 杂项方向',
      },
    ],
  },
  {
    name: '古剑山 全国大学生网络攻防大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第三届：报名 9/15—11/15，省赛 11/29，决赛 2026/4/11 */
    month: 9,
    monthVerified: true,
    registerAt: '9 月中旬 — 11 月中旬',
    deadline: '11 月中旬',
    when: '11 月下旬线上省赛（CTF）→ 次年 4 月线下决赛（AWD 攻防对抗）',
    location: '线上省赛 + 重庆移通学院綦江校区线下决赛',
    organizer: '重庆移通学院',
    eligibility:
      '面向全国高校信息安全、计算机、大数据等相关专业在校生，也欢迎其他专业对网络安全感兴趣的在校大学生；每队 3 人，须来自同一单位，每人限报一队',
    desc: '2023 年创办，规模逐年扩大：首届 740 支战队，第二届 1164 支，第三届 1191 支。参赛高校涵盖清华、复旦、国防科技大学、北邮等。省赛各省单独排名，全国综合前 20 名晋级决赛。团体奖总奖金 40 万元。',
    url: 'https://www.datacon.org.cn/gujianshan2025',
    writeups: [
      {
        title: '2025 古剑山全国大学生网络攻防大赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/380aa02/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
      {
        title: '2024 古剑山全国大学生网络攻防大赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/1618f6c/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: '蓝桥杯·网络安全赛项',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 官网：报名 2026/10/8 10:00 — 2026/12/18 14:00 */
    month: 10,
    monthVerified: true,
    registerAt: '10 月上旬 — 12 月中旬',
    deadline: '12 月 18 日 14:00',
    when: '省赛 → 决赛（分赛区制，具体日期见官网准考证）',
    location: '省赛与决赛均分赛区，按准考证指定考点',
    organizer: '蓝桥杯全国大学生软件和信息技术大赛组委会',
    advisor: '中国软件行业协会（指导单位）；国信蓝桥教育科技股份有限公司（承办）',
    eligibility:
      '具有正式学籍的在校全日制研究生、本科及高职高专学生（以报名时状态为准）。网络安全赛项只设「大学组」，但组别说明写明「高职高专院校可报大学C组/职业院校组或自行选择任意组别」，专科生可以参加',
    desc: '以个人为单位参赛，须以学校为单位报名、由院校配备指导教师。网络安全赛项考察信息安全综合能力。⚠️ 报名费 300 元/人，是清单里少数收费的赛事。研究生只能报研究生组；985/211 本科生只能报大学 A 组及以上，其它院校本科生可选大学 B 组及以上。',
    url: 'https://dasai.lanqiao.cn',
  },
  {
    /* 俗称「小长城杯」—— 圈内常用这个叫法，官方全名很长。
       两个名字都写上，是为了以后搜任一个都能命中。 */
    name: '长城杯 网络安全大赛暨京津冀蒙网络安全技能竞赛（俗称「小长城杯」）',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第六届通知（燕山大学 2026/9/8 转发）：报名至 9/12，初赛 9/13，决赛 9/18 */
    month: 9,
    monthVerified: true,
    registerAt: '8 月下旬 — 9 月 12 日',
    deadline: '9 月 12 日',
    when: '9 月中旬线上初赛（4 小时）→ 9 月下旬线下决赛（6 小时）',
    location: '线上初赛 + 北京丰台区国联股份数字经济总部线下决赛',
    organizer:
      '北京市、天津市、河北省、内蒙古自治区四省（市、自治区）互联网信息办公室、教委（教育厅）共同举办',
    advisor: '北京市网信办发布官方报名公告（经各地网信办转载）',
    eligibility:
      '设高校组与社会组两个组别。高校组面向【全国高校（包括职业院校）学生】，不限学历专业；社会组面向网络安全从业人员与技术爱好者。每队 1—3 人，须来自同一学校，可另设 1 名领队（须为本校老师）',
    desc: '⚠️ 俗称「**小长城杯**」，与 CISCN 体系下的长城杯（网数智安全大赛）是不同赛事，别混。虽由京津冀蒙四地主办，但**面向全国**，且外省名额更多：四省高校各晋级 10 支，全国其他地区高校共晋级 30 支。同一学校最多晋级 3 支。赛道聚焦「AI + 网络安全」：初赛线上 CTF + 靶场渗透（允许使用 AI 工具与自研智能体辅助解题），决赛线下人机协同渗透对抗。考察方向含 AI 辅助逆向、智能生成 payload、自动绕过 WAF、训练数据投毒、模型提取、提示词注入越狱、深度伪造识别等。两个组别排名前 30% 均获「长城杯安全卫士」称号与证书；决赛设一等奖 2 支、二等奖 8 支、三等奖 10 支。进决赛者可获京津冀蒙互联网企业直通终面、免试入职、纳入人才重点培养计划等激励。',
    url: 'https://endbm.ichunqiu.com/ccb2026',
  },
  {
    name: '数字中国创新大赛·数字安全赛道（网络和数据安全产业赛）',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 2026 年官方通知：报名自 3/12 起，积分赛预赛 4/12、决赛 4/20；案例赛报名至 4/6，预赛 4/12、决赛 4/16—17 */
    month: 3,
    monthVerified: true,
    registerAt: '3 月中旬起',
    deadline: '积分赛：3 月起报名；优秀案例征集赛：4 月 6 日截止',
    when: '4 月中旬预赛，4 月下旬决赛（与第九届数字中国建设峰会同期）',
    location: '福建福州为主，赛事平台线上进行',
    organizer: '福建省通信管理局、福建省总工会',
    advisor: '数字中国建设峰会组委会（指导）；中国软件评测中心（工信部软件与集成电路促进中心）、福建师范大学、北京信息科技大学、福州市数字福州集团有限公司（承办）',
    eligibility:
      '全国电信、互联网、金融、医疗、工业、能源、政务、交通等重要行业单位和院校、科研机构、安全厂商及数据安全个人爱好者',
    desc: '设五大赛题方向：网络和数据安全积分争夺个人赛、团队赛，以及网络和数据安全 / 移动互联网（APP）安全 / 新质生产力安全三个优秀案例征集赛。积分赛分网络安全与数据安全两个专业组，按选手所在地分十个赛区。征集方向含大模型安全、智能网联汽车安全、低空经济安全、新能源安全、智能体安全、5G-A 或 6G 安全。⚠️ 注意：这是数字中国旗下的赛事，与三明市「红明谷杯」是两个不同比赛（此前本文档曾把两者混为一条）。',
    url: 'https://www.dcic-china.com/',
  },
  {
    name: '红明谷杯 网络安全大赛',
    group: 'infosec',
    status: 'recurring',
    /*
      [查证] 第六届：初赛 2026/3/26、决赛 2026/4/10（据 i春秋赛事页）。
      注意这里 month 指的是**比赛月份**而不是报名月份 ——
      本站其他条目按报名月份归档，但这条只查到比赛时间，
      为了不让它落进「时间待确认」，用比赛月份占位。
      所以 monthVerified 为 true 指的是比赛时间可信，
      registerAt 仍待确认，两者不要混为一谈。
    */
    month: 3,
    monthVerified: true,
    registerAt: '待确认（只查到初赛时间 3 月 26 日，报名窗口未找到原文）',
    when: '3 月下旬线上初赛，4 月中旬线下决赛',
    location: '福建三明（赛事由三明市承办）',
    organizer: '三明市（具体主办单位待确认）',
    desc: '以三明「红明谷」命名的网络安全赛事，已办至第六届。⚠️ 与数字中国创新大赛的数字安全赛道是两个不同比赛，此前本文档曾把两者混写为一条，现拆分。本条按**比赛月份**归档（3 月），因为只查到初赛时间、没查到报名窗口；主办单位亦未找到官方通知原文。',
    writeups: [
      {
        title: '2023&2024 红明谷初赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/e49ecc5/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: '长城杯 信息安全铁人三项赛',
    group: 'infosec',
    status: 'recurring',
    /*
      [部分查证] 用浏览器渲染官网后可确认的事实：
        - 官网有「六大赛区」的说法，2026-03-20 发布过《六大赛区即将开赛》
        - 站点栏目含「赛事章程 / 赛事指南 / 赛事新闻 / 赛事实况 / 竞赛报名」
      但各栏目的具体内容页面渲染后为空（需登录或改用别的路由），
      所以报名时间与参赛资格仍未拿到原文，不猜、继续留「待确认」。
    */
    registerAt: '待确认（官网可查，需从「竞赛报名」栏目进入）',
    when: '待确认（2026-03-20 官网发布过「六大赛区即将开赛」）',
    location: '按赛区划分，官网称设六大赛区',
    organizer: '中国信息安全测评中心',
    advisor: '技术支持：北京西普阳光科技股份有限公司',
    desc: '「长城杯」品牌下的独立赛事，与网数智安全大赛（防护赛/作品赛）、京津冀蒙网络安全技能竞赛是不同比赛。官网确认设六大赛区，栏目含赛事章程、赛事指南、竞赛报名。⚠️ 各栏目内容页需要登录或走别的路由，报名时间与参赛资格仍未查证，请以官网「竞赛报名」栏目为准。',
    eligibility: '待确认',
    url: 'http://ccb.itsec.gov.cn/',
    writeups: [
      {
        title: '2024 长城杯信息安全铁人三项赛 Misc Writeup',
        url: 'https://goodlunatic.github.io/posts/bd957c3/',
        kind: 'external',
        author: 'Lunatic',
        note: '杂项方向',
      },
    ],
  },
  {
    name: '数信杯 数据安全大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第三届通知：报名 2025/10/20—12/15 */
    month: 10,
    monthVerified: true,
    registerAt: '10 月下旬 — 12 月中旬',
    deadline: '12 月 15 日',
    when: '区域赛 → 全国总决赛（具体时间见官网）',
    location: '区域赛线上，分九个赛区；广西属【南二区】（黔、滇、桂、琼）',
    organizer:
      '中国电子信息产业发展研究院、中国信息通信研究院、国家工业信息安全发展研究中心、中国软件评测中心（工信部软件与集成电路促进中心）',
    advisor: '工业和信息化主管部门、各省通信管理局',
    eligibility:
      '全国电信、互联网、金融、医疗、工业、能源、政务等重要行业单位和院校、科研机构、安全厂商及数据安全个人爱好者；分学生组与非学生组',
    desc: '国内数据安全领域标杆赛事，前两届累计参赛万余人。设四个赛道：数据安全个人赛、AI 安全团队综合赛（8 人/队）、产品能力评比赛、优秀案例征集赛。学生组理论题 + 实践操作题，含数据全生命周期安全、逆向分析、AI 模型数据安全等。',
    url: 'https://shuxinbei.china-ds.org.cn',
  },
  {
    name: '中国（广西）—东盟人工智能安全攻防大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 2026 年：报名截止 2026/8/15 */
    month: 8,
    monthVerified: true,
    registerAt: '7 月 — 8 月中旬',
    deadline: '8 月 15 日',
    when: '分初赛、决赛两阶段（具体时间见官网）',
    location: '广西',
    organizer: '广西壮族自治区大数据发展局',
    desc: '主题「智防大模型，共治新安全」。三大赛道：① 大模型底层安全（知识库投毒、恶意文档植入、向量库污染）；② AWD-plus 攻防（每队配独立智能体靶场）；③ 多模态伪造检测（深度伪造识别）。面向全国及东盟高校、科研院所、企业、科创团队。优胜队伍产品有机会落地广西政务大模型试点，并对接东盟市场；高校参赛成果可用于学分认定、教师职称评审。',
    eligibility: '全国及东盟范围内高校、科研院所、行业企业、科创团队',
    url: 'http://dsjfzj.gxzf.gov.cn/dz/',
  },
  {
    name: '广西教育系统网络安全攻防演习',
    group: 'infosec',
    status: 'recurring',
    /*
      [查证] 2026 年：132 支涵盖本、专科院校的攻击队伍参赛，
      获奖名单由自治区教育厅于 2026 年 7 月下旬公布。
      2025 年为 74 支攻击队、154 个防守单位、6 月组织。
      主办方与规模两届都查到了原文，但**报名方式仍未查到**。
    */
    month: 6,
    monthVerified: false,
    registerAt: '待确认（未查到公开报名入口，多为教育厅向高校下发）',
    when: '2025 年 6 月组织；2026 年规模扩大到 132 支攻击队，7 月下旬公布获奖名单',
    location: '广西',
    organizer: '广西壮族自治区教育厅',
    desc: '面向全区教育系统的攻防演习，设「优秀攻击队」等奖项。规模在扩大：2025 年 74 支高校攻击队、154 个防守单位；2026 年攻击队增至 132 支（涵盖本科与专科院校）。⚠️ 未查到公开报名入口，通常由教育厅向各高校下发组织，需通过学校渠道参加。',
    eligibility: '广西高校师生（攻击队由高校组队，本专科均有一等奖记录）',
  },
  {
    name: '全国数据安全职业技能竞赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第四届通知：选拔赛与预赛 2025/12 — 2026/10，总决赛分赛项在 2026/1、9、10、11 月 */
    month: 12,
    monthVerified: true,
    registerAt: '12 月起（选拔赛与预赛阶段：2025 年 12 月 — 2026 年 10 月）',
    when: '总决赛分赛项：数据安全管理员 2026/1；无人机驾驶员 2026/9；安全防范系统安装维护员 2026/10；网络安全管理员 2026/11',
    location: '各省选拔赛 + 全国总决赛',
    organizer: '中国安全防范产品行业协会、中国就业培训技术指导中心',
    advisor: '人力资源和社会保障部（全国行业职业技能竞赛序列）',
    eligibility:
      '分职工组与学生组。学生组面向「高等职业院校、职业院校、本科院校等在校在籍学生」（含高职、专科）；须为中华人民共和国公民',
    desc: '全国行业职业技能竞赛序列，设四个职业赛项。理论考试占 20%、技能操作占 80%。⚠️ 亮点是**职业技能等级晋升**：总决赛前 3 名可晋升技师/高级技师职业技能等级，第 4—15 名可晋升高级工/技师。获奖比例为一等奖 10%、二等奖 15%、三等奖 25%。另与第 48 届世界技能大赛练兵相关。',
    url: 'https://js.afdata.org.cn',
  },
  {
    name: '广西网络知识大赛',
    group: 'infosec',
    status: 'recurring',
    /* [查证] 第十一届：2025/12/30 — 2026/1/8，共 10 天 */
    month: 12,
    monthVerified: true,
    registerAt: '12 月下旬 — 次年 1 月上旬（答题期即参赛期）',
    when: '2025 年 12 月 30 日 — 2026 年 1 月 8 日，共 10 天',
    location: '线上，手机答题',
    organizer: '广西壮族自治区党委网信办、共青团广西区委、自治区教育厅、自治区数据局',
    desc: '主题「守护网络信息安全，拥抱人工智能时代」。**知识竞答形式，不是 CTF**。手机关注「网信广西」「八桂教育」「广西青年圈」「广西日报」任一微信公众号即可答题。题库 1500 题，每次随机抽 10 道判断 + 5 道单选，每题限时 3 秒、总时长 150 秒。奖品含手机、平板、移动硬盘等，总积分前 225 名获电子证书。⚠️ 门槛极低、耗时短，适合顺手参加。',
    eligibility: '面向全区，高校师生员工均可参加（不限学生）',
  },
  {
    name: '广西民族大学「金汤杯」网络安全攻防竞赛',
    group: 'infosec',
    status: 'recurring',
    /*
      [查证] 第三届：教务〔2026〕38 号通知 2026-04-09 发布（附件为报名二维码），
      初赛 4/18、决赛 4/25，全程两周，32 支队伍 92 名学生参赛，
      20 支晋级决赛，最终 10 支获奖。
    */
    month: 4,
    monthVerified: true,
    registerAt: '4 月上旬（第三届通知 4 月 9 日发布，附报名二维码）',
    when: '第三届：4 月 18 日初赛 → 4 月 25 日决赛，全程历时两周',
    location: '广西民族大学',
    organizer: '广西民族大学（教务处发文，人工智能学院承办）',
    advisor: '支持单位：北京神州绿盟科技有限公司、广西等保安全测评有限公司',
    eligibility: '广西民族大学在校学生（校赛，全校各学院均可报名）',
    desc: '**校级赛事**，已办至第三届。采用 CTF 夺旗赛制，分初赛与决赛：第三届 32 支队伍 92 人参赛，初赛后 20 支晋级，决赛题目难度升级、侧重综合实战，最终 10 支队伍分获一二三等奖。校赛门槛最低，也是进入省赛与国赛的常见通道。',
  },
  {
    name: 'CTFHub 技能树与平台赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '技能树常年开放；平台赛事不定期',
    when: '常年',
    location: '线上',
    organizer: 'CTFHub',
    desc: '**练习平台**，不是定期赛事。放在这里是因为它比列赛事更实用：技能树按知识点闯关（HTTP、SQL 注入、信息泄露、SSRF、XSS、文件上传等），适合系统补漏。平台上也不定期有赛事。⚠️ 官网为 JS 应用，赛事排期未能抓取，请以站内公告为准。',
    eligibility: '无限制',
    url: 'https://www.ctfhub.com/',
  },
  {
    name: '广西大学生「英招杯」网络安全技能大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认（首届，通知仅见微信公众号）',
    when: '待确认',
    location: '广西',
    organizer: '待确认',
    desc: '广西首届大学生网络安全技能大赛。⚠️ 官方通知仅发布在微信公众号，未能读取正文，因此主办单位、报名时间、参赛资格均未查证，请以官方微信通知为准。首届赛事通常竞争较小，值得关注。',
    eligibility: '待确认（应为广西高校在校学生）',
  },
];

/**
 * 团队基本信息。
 *
 * 三个名字的区别（改之前先读，别混）：
 *   飞鱼          —— **这个博客**的名字（见 SITE），站长的个人技术站
 *   飞鱼网络安全实验组 —— **组织**的名字，学校里的兴趣团体
 *   ENIAC Zero    —— **战队**的名字，代表实验组出去打比赛时的队名
 * 三者不是一回事：博客是个人站，实验组是组织，战队是参赛身份。
 * 所以分开配置，而不是共用 SITE.name。
 */
export const TEAM_INFO = {
  /** 组织名（实验室/实验组） */
  name: '飞鱼网络安全实验组',
  /**
   * 战队名。代表实验组参加比赛时用的名字，
   * 很多赛事要求填队伍名，与组织名不一定相同。
   */
  teamName: 'ENIAC Zero',
  /**
   * 完整称呼，用于正式场合（比赛报名、证书抬头）。
   */
  fullName: '广西英华国际职业学院 飞鱼网络安全实验组（ENIAC Zero 战队）',
  /** 所属单位 */
  school: '广西英华国际职业学院',
  /**
   * 团队介绍。一段话，说清"我们是谁、做什么方向、参加什么比赛"。
   *
   * 文字基于站长提供的原文，只把组织名改成实验组的正式叫法。
   * 其中「多次挖掘并公开开源软件漏洞」是实验组自己的陈述，
   * 本站未逐条核实，按原文保留。
   */
  intro:
    '飞鱼网络安全实验组是由广西英华国际职业学院一群对信息安全感兴趣的年轻人组成的兴趣团体，战队名 ENIAC Zero。成员研究方向包括但不限于逆向工程、软件破解、Web 安全研究、前后端开发、移动安全、密码学研究，多次挖掘并公开开源软件漏洞。实验组目前除了做成员独自感兴趣方向的研究之外，同时积极参与国内外 CTF（电子竞技）比赛，学习新姿势。',
} as const;

/**
 * 团队公告条目。
 *
 * 用来发布获奖报道、招新通知、赛事动态这类时效性内容 ——
 * 相当于站内的"新闻栏"。与 COMPETITION_RECORDS 的区别：
 *   记录（荣誉历史）—— 结构化战绩，一条一个名次，用于长期展示
 *   公告（本数组）  —— 可长可短的报道，带日期，用于按时间发布
 * 同一件事可以两处都有：记录里是一行战绩，公告里是一篇报道。
 */
export interface TeamNotice {
  /** 发布日期，格式 YYYY-MM-DD。列表按此倒序 */
  date: string;
  /** 标题 */
  title: string;
  /**
   * 分类标签，例如「荣誉」「通知」「赛事」。
   * 会在标题上方显示，也方便以后按分类筛选。
   */
  tag?: string;
  /** 正文，一段或几段。支持简单的纯文本 */
  body?: string;
  /** 相关链接，例如赛事官网、公示页 */
  url?: string;
}

/**
 * 团队公告列表。
 *
 * 目前为空：这些都是队伍的真实动态，只能由队里提供。
 * 留空时页面会显示一段说明，而不是一片空白。
 */
export const TEAM_NOTICES: TeamNotice[] = [];

/**
 * 团队成员角色。
 *
 * 顺序即页面上的显示顺序：创始人 → 指导老师 → 队长 → 队员 → 已毕业。
 *
 * 为什么创始人排最前：队伍介绍通常从"谁发起的"讲起，
 * 这比指导老师和现任队长更靠前。
 * 若同一人既是创始人又是队长，取更靠前的角色（创始人），
 * 另一个身份写在 title 里 —— 例如 title 用「队长兼创始人」。
 *
 * 已毕业的放最后：访客先关心"现在有谁"，历届属于查阅性质的内容。
 */
export const TEAM_ROLES = [
  { key: 'founder', name: '创始人', desc: '发起并组建这支队伍的人。' },
  { key: 'advisor', name: '指导老师', desc: '负责技术方向把关与参赛事务协调。' },
  { key: 'captain', name: '队长', desc: '负责组队、赛程安排与对外联络。' },
  { key: 'member', name: '队员', desc: '' },
  {
    key: 'alumni',
    name: '已毕业',
    desc: '曾经在队里的成员。留着是为了记录，也方便后来的人找到他们。',
  },
] as const;

export type TeamRoleKey = (typeof TEAM_ROLES)[number]['key'];

/**
 * 团队成员条目。
 *
 * 与 CompetitionRecord 一样，这些是真人信息，只能由本人填写。
 * 只留 name 与 role 必填，其余按需 —— 队友未必愿意公开真名或联系方式，
 * 所以 handle（代号）单独一个字段，可以和 name 不同。
 */
export interface TeamMember {
  /** 姓名或常用称呼 */
  name: string;
  /** 角色，决定归到哪一组 */
  role: TeamRoleKey;
  /**
   * 代号 / ID。留空则不显示。
   * 单独一个字段是因为：站长的博客用网名，但队里可能习惯叫真名，
   * 两者可以不一致，也可以只填其一。
   * CTF 圈里 ID 往往比真名更有辨识度，两个都显示最有用。
   */
  handle?: string;
  /** 一句话身份，例如「2023 级网络工程」 */
  title?: string;
  /**
   * 届次 / 年级，例如 2023。用于组内排序（新的在前）与已毕业的标注。
   */
  year?: number;
  /**
   * 擅长方向，例如 ['Web', 'Misc', '取证']。
   * 页面会把它链接到站内对应的标签页 —— 这是一个本站独有的优势：
   * 点「Misc」就能直接看到该方向的题解与工具文章。
   */
  focus?: string[];
  /**
   * 荣誉称号，例如 ['优秀队员', '最佳新人']。
   *
   * 为什么与 role 分开：role 决定归到哪一组，是**结构**；
   * 荣誉是**评价**，一个人仍是队员，只是拿了称号。
   * 把「优秀队员」当角色会让它变成一个只有一人的分组，
   * 既不像角色也不像荣誉。放在这里则能和届次、身份并列展示。
   */
  honors?: string[];
  /** 两三句自我介绍 */
  bio?: string;
  /** 头像，放 public/team/ 下。留空则显示姓名首字占位 */
  avatar?: string;
  /** 相关链接，例如 GitHub、博客、B 站 */
  links?: { label: string; href: string }[];
}

/**
 * 团队成员清单 —— 成员页的唯一数据源。
 *
 * ⚠️ 这些是真人信息，只写本人愿意公开的部分。
 * 只填 name 与 role 也能正常显示，其余字段留空不占位。
 *
 * 填写示例：
 *   {
 *     name: '张三',
 *     role: 'captain',
 *     handle: 'ENIAC',
 *     title: '2023 级网络工程',
 *     year: 2023,
 *     focus: ['Web', 'Misc'],
 *     bio: '负责 Web 方向，喜欢从源码里找问题。',
 *     avatar: '/team/zhangsan.jpg',
 *     links: [{ label: 'GitHub', href: 'https://github.com/xxx' }],
 *   },
 *
 * 关于「成员 → 站内文章」的关联：
 *   文章 frontmatter 里的 author 字段如果等于某个成员的 name 或 handle，
 *   该成员卡片上就会出现"在本站写过 N 篇文章"的入口。
 *   这不需要额外维护映射表，填 author 即可。
 */
export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: '沙老师',
    role: 'advisor',
    title: '信息安全系教授',
    bio: '负责方向把关。',
  },
  {
    name: '张三',
    role: 'captain',
    handle: 'ENIAC',
    title: '2023 级网络工程',
    year: 2023,
    focus: ['网络工程', 'Kali'],
    bio: '负责 Web 方向。',
    links: [{ label: 'GitHub', href: 'https://github.com/example' }],
  },
  {
    name: '李四',
    role: 'member',
    title: '2024 级计算机',
    year: 2024,
    focus: ['Misc'],
    avatar: '/team/definitely-missing.jpg',
  },
  { name: '王五', role: 'alumni', title: '2021 级', year: 2021 },
];

/**
 * 招新信息。
 *
 * 为什么留成一个独立对象而不是写死在页面里：
 *   招新是有时效的 —— 开放期、考核方式、联系方式每年都会变。
 *   独立出来以后，改招新只需动这几行，不会碰到页面结构。
 *
 * ⚠️ 默认 enabled: false。
 *   没有真实招新通道时不要把这段显示出来 ——
 *   挂一个点不动的「加入我们」比不挂更糟。
 *   要开放时把 enabled 改成 true 并填上真实内容。
 */
export const RECRUITMENT = {
  enabled: false,
  /** 一句话说明现在招不招、招什么方向 */
  headline: '',
  /** 招收方向，例如 ['Web', 'Misc', '逆向'] */
  tracks: [] as string[],
  /** 面向谁，例如「本校在读学生，年级专业不限」 */
  who: '',
  /** 怎么加入：流程说明，一行为一步 */
  steps: [] as string[],
  /** 联系方式，例如 [{ label: '邮箱', value: 'xxx@example.com' }] */
  contacts: [] as { label: string; value: string; href?: string }[],
};

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
