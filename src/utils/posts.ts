/**
 * 文章数据处理工具
 * ------------------------------------------------------------------
 * 纯函数：只依赖 consts 常量，不 import 任何 Astro 运行时 API，
 * 因此可以直接被单元测试或 Node 脚本调用。
 * 所有函数都不修改传入的数组（需要排序时先浅拷贝）。
 */

import { SECTIONS } from '../consts';
import type { SectionKey } from '../consts';

/**
 * 与 content collection 结构对齐的最小结构类型。
 * 首页、标签页、归档页只需要这些字段，泛型约束用它即可，
 * 这样既不用依赖 Astro 生成的 CollectionEntry 类型，也方便测试。
 */
export interface PostLike {
  id: string;
  data: {
    title: string;
    description?: string;
    pubDate: Date;
    updatedDate?: Date;
    tags?: string[];
    category?: string;
    draft?: boolean;
    featured?: boolean;
    author?: string;
    cover?: string;
  };
}

/** 标签及其出现次数 */
export interface TagCount {
  tag: string;
  count: number;
}

/** 按年分组的归档条目 */
export interface YearGroup<T extends PostLike> {
  year: number;
  posts: T[];
}

/**
 * 上海时区日历字段。归档/排序都按站点的「日历日」算，
 * 不能直接用 Date 的 UTC 字段，否则东八区凌晨的文章会串到前一天。
 */
const SHANGHAI_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 拆出上海时区的年月日；日期无效时返回 null */
function shanghaiParts(date: Date): { year: string; month: string; day: string } | null {
  if (Number.isNaN(date.getTime())) return null;

  let year = '';
  let month = '';
  let day = '';
  for (const part of SHANGHAI_DATE_FORMAT.formatToParts(date)) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }

  if (year === '' || month === '' || day === '') return null;
  return { year, month, day };
}

/** 上海时区的年份，用于归档分组；无效日期返回 0 */
function shanghaiYear(date: Date): number {
  const parts = shanghaiParts(date);
  if (parts === null) return 0;

  const year = Number.parseInt(parts.year, 10);
  return Number.isNaN(year) ? 0 : year;
}

/** 排序用时间戳；无效日期按最旧处理 */
function toTimestamp(date: Date): number {
  const time = date.getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** 是否为已发布文章（draft 未写或为 false） */
function isPublished(post: PostLike): boolean {
  return post.data.draft !== true;
}

/** 规整标签：过滤掉空字符串，保证后面不会被空标签污染 */
function normalizeTags(post: PostLike): string[] {
  const tags = post.data.tags;
  if (!tags) return [];
  return tags.filter((tag) => tag.trim() !== '');
}

/**
 * 按发布时间倒序（新 → 旧）。
 * 先浅拷贝再排序，调用方传入的数组保持原样；无效日期排最后。
 * 只比较「上海日历日」，同一天内用精确时间戳兜底。
 */
export function sortByDateDesc<T extends PostLike>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const yearDiff = shanghaiYear(b.data.pubDate) - shanghaiYear(a.data.pubDate);
    if (yearDiff !== 0) return yearDiff;

    const partsA = shanghaiParts(a.data.pubDate);
    const partsB = shanghaiParts(b.data.pubDate);
    if (partsA === null || partsB === null) {
      // 其中一个是无效日期：无效的排后面
      if (partsA === null && partsB === null) return 0;
      return partsA === null ? 1 : -1;
    }

    const dayA = Number.parseInt(`${partsA.month}${partsA.day}`, 10);
    const dayB = Number.parseInt(`${partsB.month}${partsB.day}`, 10);
    if (dayA !== dayB) return dayB - dayA;

    return toTimestamp(b.data.pubDate) - toTimestamp(a.data.pubDate);
  });
}

/** 过滤掉草稿，只保留可发布的文章 */
export function filterPublished<T extends PostLike>(posts: T[]): T[] {
  return posts.filter((post) => isPublished(post));
}

/** 取 id 的第一段作为板块，例如 `tech/hello` → `tech`；没有 `/` 时返回空串 */
export function getSectionOf(id: string): string {
  const slashIndex = id.indexOf('/');
  if (slashIndex <= 0) return '';
  return id.slice(0, slashIndex);
}

/** 去掉板块前缀，例如 `tech/hello` → `hello`；没有 `/` 时原样返回 */
export function getSlugOf(id: string): string {
  const slashIndex = id.indexOf('/');
  if (slashIndex < 0) return id;
  return id.slice(slashIndex + 1);
}

/**
 * 板块中文名：命中 SECTIONS 返回其 name，否则回退为原始字符串。
 * 用 hasOwnProperty 守卫，避免用任意字符串直接索引常量对象。
 */
export function sectionName(section: string): string {
  if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) {
    return section;
  }

  const key = section as SectionKey;
  const info: { name: string } | undefined = SECTIONS[key];
  return info ? info.name : section;
}

/**
 * 统计标签出现次数：先按次数降序，次数相同按标签名升序（中文用 zh-CN 排序）。
 */
export function collectTags<T extends PostLike>(posts: T[]): TagCount[] {
  const counter = new Map<string, number>();

  for (const post of posts) {
    for (const tag of normalizeTags(post)) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }

  const result: TagCount[] = [];
  for (const [tag, count] of counter) {
    result.push({ tag, count });
  }

  return result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag, 'zh-CN');
  });
}

/**
 * 按年份归档：年份降序，同一年内文章仍是新 → 旧。
 * 年份取上海时区，年末年初不会串年。
 */
export function groupByYear<T extends PostLike>(posts: T[]): YearGroup<T>[] {
  const buckets = new Map<number, T[]>();

  // 先整体排好序再分组，bucket 内自然就是新 → 旧
  for (const post of sortByDateDesc(posts)) {
    const year = shanghaiYear(post.data.pubDate);
    const bucket = buckets.get(year);
    if (bucket) bucket.push(post);
    else buckets.set(year, [post]);
  }

  const result: YearGroup<T>[] = [];
  for (const [year, yearPosts] of buckets) {
    result.push({ year, posts: yearPosts });
  }

  return result.sort((a, b) => b.year - a.year);
}

/** 全部标签名，去重后按中文排序 */
export function getAllTags<T extends PostLike>(posts: T[]): string[] {
  const unique = new Set<string>();
  for (const post of posts) {
    for (const tag of normalizeTags(post)) {
      unique.add(tag);
    }
  }
  return [...unique].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * 相关文章：
 *   1. 先取标签重合数最多的（原始顺序是新 → 旧，重合数相同则更新的在前）；
 *   2. 不足 limit 时用「最近发布的其他文章」补齐；
 *   3. 绝不含自身、不重复，最多 limit 篇。
 *
 * 注意：本函数只按 id 去重、不判断草稿，调用方应先 filterPublished(all) 再传进来。
 */
export function relatedPosts<T extends PostLike>(current: T, all: T[], limit = 3): T[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const currentTags = new Set(normalizeTags(current));
  const rest = sortByDateDesc(all.filter((post) => post.id !== current.id));

  // 先算出每篇的重合标签数，再按重合数做稳定排序（新 → 旧的相对顺序不变）
  const scored = rest.map((post) => {
    let shared = 0;
    for (const tag of normalizeTags(post)) {
      if (currentTags.has(tag)) shared += 1;
    }
    return { post, shared };
  });
  scored.sort((a, b) => b.shared - a.shared);

  const picked: T[] = [];
  const pickedIds = new Set<string>();

  // 第一轮：优先同标签文章
  for (const item of scored) {
    if (picked.length >= max) break;
    if (item.shared === 0) continue;
    picked.push(item.post);
    pickedIds.add(item.post.id);
  }

  // 第二轮：用最新文章补齐（已选中的会被 id 集合跳过）
  for (const item of scored) {
    if (picked.length >= max) break;
    if (pickedIds.has(item.post.id)) continue;
    picked.push(item.post);
    pickedIds.add(item.post.id);
  }

  return picked;
}
