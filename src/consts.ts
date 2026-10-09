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
      '⚠️ 仅限天津市、北京市、河北省【普通本科高校】全日制本科在校生，无专业限制 —— 专科生与外省学生均不能参加',
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
    desc: '已办至第十届。聚焦人工智能、物联网、车联网、云计算、大数据，设夺旗赛、综合防御赛、靶场渗透赛。资格赛约前 55 支队伍晋级。Q 组对学生最友好 —— 不需要学校推荐即可报名。',
    url: 'http://www.whwx.gov.cn/',
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

  /* ─────── 以下时间多为推断，需逐个核实 ─────── */
  {
    name: '网鼎杯 网络安全大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '已办至第四届',
    location: '待确认（2024 年决赛在贵阳）',
    organizer: '公安部',
    desc: '公安部主办的全国性网络安全赛事，以行业分组对抗著称。⚠️ 官网返回 403，规则为 PDF 无法读取，时间与学历要求均未查证 —— 请自行查阅官网规则文件。',
    url: 'https://www.wangdingcup.com/',
  },
  {
    name: '古剑山 全国大学生网络攻防大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '已办至第三届',
    location: '重庆',
    organizer: '重庆移通学院等',
    desc: '第三届 1191 支战队参赛。名称即「全国」，无地域限制。⚠️ 具体报名月份未查证。',
    eligibility: '全国大学生',
  },
  {
    name: '数字中国创新大赛·数字安全赛道（含红明谷杯）',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '红明谷杯历届初赛在 3 月、决赛在 4 月（2026 年数据）',
    location: '福建（数字中国建设峰会）',
    organizer: '数字中国建设峰会组委会',
    desc: '数字中国建设峰会配套赛事，含网络和数据安全产业赛、红明谷杯等子赛事。政府背景，认可度较高。⚠️ 报名月份未查证。',
  },
  {
    name: '数信杯 数据安全大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '已办至第三届',
    location: '待确认',
    organizer: '工业和信息化主管部门',
    desc: '面向数据安全方向的专项赛事，各省工信主管部门组织参与。⚠️ 时间与资格均未查证。',
  },
  {
    name: '广西大学生「英招杯」网络安全技能大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认（首届）',
    when: '待确认',
    location: '广西',
    organizer: '广西相关部门（待确认）',
    desc: '广西首届大学生网络安全技能大赛。新赛事通常竞争较小，值得优先关注。⚠️ 首届时间与主办单位未查证。',
    eligibility: '广西高校在校学生（待确认）',
  },
  {
    name: '中国（广西）—东盟人工智能安全攻防大赛',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '待确认',
    location: '广西',
    organizer: '广西大数据发展局',
    desc: '面向中国与东盟国家的人工智能安全攻防赛事，可能有国际赛道。是广西本地少见的具国际性质的赛事。⚠️ 报名月份未查证。',
    url: 'http://dsjfzj.gxzf.gov.cn/dz/',
  },
  {
    name: '广西教育系统网络安全攻防演习',
    group: 'infosec',
    status: 'recurring',
    registerAt: '待确认',
    when: '待确认',
    location: '广西',
    organizer: '广西教育厅',
    desc: '面向广西教育系统的攻防演习，分攻击队与防守队。适合在校学生组队参与，实战性强。⚠️ 时间与参与方式未查证。',
    eligibility: '广西教育系统（待确认）',
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
