/**
 * 列表页共用的数据装配层。
 *
 * 为什么单独抽出来：首页、板块页、标签页、归档页都在做
 * "取集合 → 过滤草稿 → 排序 → 映射成卡片数据"这同一件事。
 * 写九遍必然会有一处漏掉草稿过滤——这类 bug 很隐蔽，
 * 只在线上表现为"草稿文章被人看到了"。
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { filterPublished, sortByDateDesc } from './posts';
import { readingTimeMinutes, readingTimeLabel } from './date';

export type PostEntry = CollectionEntry<'posts'>;

/** 列表卡片需要的字段，刻意与组件解耦，不直接暴露 collection entry */
export interface PostCardData {
  id: string;
  title: string;
  description: string;
  pubDate: Date;
  tags: string[];
  /** 所属板块 key，用于卡片上的板块徽标 */
  section: string;
}

/**
 * 取全部已发布文章，按时间倒序。
 * 所有列表页都必须走这里，不要在页面里直接调 getCollection。
 */
export async function getPublishedPosts(): Promise<PostEntry[]> {
  return sortByDateDesc(filterPublished(await getCollection('posts')));
}

/** 把 entry 映射成卡片数据，顺便取出板块名 */
export function toCardData(post: PostEntry): PostCardData {
  const index = post.id.indexOf('/');
  return {
    id: post.id,
    title: post.data.title,
    description: post.data.description ?? '',
    pubDate: post.data.pubDate,
    tags: post.data.tags ?? [],
    // 没有斜杠说明是根级页面（如 about），不属于任何板块
    section: index === -1 ? '' : post.id.slice(0, index),
  };
}

/**
 * 估算阅读时长。
 *
 * 注意这里做了一次粗略的 Markdown 清理：去掉代码块、行内代码、
 * 图片和链接语法后再交给字数统计，否则代码块会让"阅读时间"虚高。
 * 不需要非常精确——读者只是想要个量级感。
 */
export function estimateReading(post: PostEntry): string {
  const body = post.body ?? '';
  const cleaned = body
    // 去掉围栏代码块（含内容）
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // 去掉行内代码
    .replace(/`[^`]*`/g, ' ')
    // 去掉图片
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // 去掉链接，保留链接文字
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 去掉标题符号、引用符号、列表符号
    .replace(/^[>#\-*+\d.\s]+/gm, ' ')
    // 去掉 HTML 标签
    .replace(/<[^>]+>/g, ' ');

  return readingTimeLabel(cleaned);
}

/** 只要分钟数（用于列表页紧凑展示） */
export function readingMinutes(post: PostEntry): number {
  return readingTimeMinutes(post.body ?? '');
}

/**
 * 分页工具：把数组切成页。
 * 返回 null 表示页码越界，调用方应据此过滤掉该页（返回 404）。
 */
export function paginate<T>(items: T[], page: number, perPage: number): T[] | null {
  if (page < 1 || !Number.isInteger(page)) return null;
  const start = (page - 1) * perPage;
  if (start >= items.length && !(page === 1 && items.length === 0)) return null;
  return items.slice(start, start + perPage);
}

/** 计算总页数，至少为 1（空列表也应该有一页） */
export function totalPages(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}
