/**
 * 日期与阅读时长工具
 * ------------------------------------------------------------------
 * 约定：站点的「日历日」一律按 Asia/Shanghai 计算。
 * 关键坑：new Date() 内部是 UTC 时间戳，toISOString() 取到的是 UTC 日期，
 * 东八区凌晨 0:00–8:00 的文章会被算到前一天。所以这里全部用
 * Intl.DateTimeFormat 指定 timeZone 后再取各字段，不碰 toISOString()。
 */

/** 站点时区，统一在这里定义，方便以后换时区 */
const TIME_ZONE = 'Asia/Shanghai';

/** 中文阅读速度：字/分钟 */
const CJK_CHARS_PER_MINUTE = 300;
/** 西文阅读速度：词/分钟 */
const WORDS_PER_MINUTE = 200;

/** 中文（含扩展 A 区）字符 */
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
/** 连续的字母数字视作一个西文词 */
const WORD_PATTERN = /[A-Za-z0-9]+/g;

/**
 * 只用来「读字段」的格式化器。
 * 固定 en-US：它输出的年月日一定是 ASCII 数字（zh-CN 在 small-icu 运行时会退化，
 * 且非拉丁数字系统可能给出 ٢٠٢٦ 这类字符，解析会出错）。时区才是关键，语言无所谓。
 * 提到模块级复用，避免每次调用都新建 Intl 实例。
 */
const SHANGHAI_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 判断日期是否可用。
 * 无效日期（Invalid Date）参与任何格式化都会抛 RangeError，必须先挡掉。
 */
function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * 把日期拆成上海时区下的日历字段。
 * 返回 null 表示日期无效。
 */
function shanghaiParts(date: Date): { year: string; month: string; day: string } | null {
  if (!isValidDate(date)) return null;

  // formatToParts 比 format 可靠：不用猜 locale 的拼接顺序，直接按字段取值
  const parts = SHANGHAI_PARTS_FORMAT.formatToParts(date);

  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }

  // 理论上不会缺字段，缺了就当无效处理，保证返回类型不含 undefined
  if (year === '' || month === '' || day === '') return null;
  return { year, month, day };
}

/**
 * 格式化日期。
 * - `'long'`：`2026年3月14日`
 * - `'short'`：`2026-03-14`
 * 日期无效时返回空字符串，绝不抛异常。
 */
export function formatDate(date: Date, style: 'long' | 'short' = 'long'): string {
  if (!isValidDate(date)) return '';

  if (style === 'short') {
    return toISODate(date);
  }

  /*
   * 长格式刻意手写中文年月日，而不是交给 Intl 拼 zh-CN：
   * 部分 Node 运行时是 small-icu（只有 en 数据），此时 zh-CN 会静默降级成 en，
   * 输出 `2026/3/14`，构建产物会不一致。手写可保证任何运行时都是「2026年3月14日」，
   * 而月份和日期按中文习惯不做补零。
   */
  const parts = shanghaiParts(date);
  if (parts === null) return '';
  return `${parts.year}年${Number.parseInt(parts.month, 10)}月${Number.parseInt(parts.day, 10)}日`;
}

/**
 * 输出 `YYYY-MM-DD`（上海日历日），用于 `<time datetime="...">` 与 RSS。
 * 刻意不用 toISOString().slice(0,10)——那是 UTC 日期，会错一天。
 */
export function toISODate(date: Date): string {
  const parts = shanghaiParts(date);
  if (parts === null) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 上海时区下的年份；日期无效时返回 0 */
export function getYear(date: Date): number {
  const parts = shanghaiParts(date);
  if (parts === null) return 0;

  const year = Number.parseInt(parts.year, 10);
  return Number.isNaN(year) ? 0 : year;
}

/**
 * 估算阅读时长（分钟）：中文按 300 字/分钟，西文按 200 词/分钟，最后向上取整。
 * 至少返回 1，避免出现「约 0 分钟」。
 */
export function readingTimeMinutes(text: string): number {
  if (text.trim() === '') return 1;

  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  // 先把中文抠掉，剩下的字母数字序列才算西文词，避免中英混排被重复计数
  const rest = text.replace(CJK_PATTERN, ' ');
  const wordCount = rest.match(WORD_PATTERN)?.length ?? 0;

  const minutes = cjkCount / CJK_CHARS_PER_MINUTE + wordCount / WORDS_PER_MINUTE;
  return Math.max(1, Math.ceil(minutes));
}

/** 阅读时长的展示文案，例如 `约 5 分钟` */
export function readingTimeLabel(text: string): string {
  return `约 ${readingTimeMinutes(text)} 分钟`;
}
