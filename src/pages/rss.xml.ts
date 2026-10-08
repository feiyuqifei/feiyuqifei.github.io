/**
 * RSS 订阅源。
 *
 * 为什么需要它：技术博客的读者往往用阅读器（Feedly、Inoreader、
 * Follow、NetNewsWire）订阅，RSS 是最长寿、最不依赖平台的订阅方式。
 * 而且它零成本——静态构建时生成一个 XML 文件。
 *
 * 路径 /rss.xml 与 Layout.astro 里 <link rel="alternate"> 声明的地址必须一致。
 *
 * 注意这个文件在 src/pages/ 下，但扩展名是 .ts 而不是 .astro，
 * Astro 会把这类文件当作"端点（endpoint）"，直接输出其返回值，
 * 不经过 HTML 模板。
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../consts';
import { sortByDateDesc, filterPublished } from '../utils/posts';

export async function GET(context: APIContext) {
  const posts = sortByDateDesc(filterPublished(await getCollection('posts')))
    // 关于页是常驻页面，不是文章，不应出现在订阅源里
    // （同样原因，[...slug].astro 也把它排除了）
    .filter((post) => post.id !== 'about');

  return rss({
    title: SITE.name,
    description: SITE.description,
    // context.site 来自 astro.config.mjs 的 site 字段
    site: context.site ?? SITE.url,
    items: posts.map((post) => {
      // 板块目录名不入 URL 之外的用途，链接直接用 entry.id
      return {
        title: post.data.title,
        description: post.data.description ?? '',
        pubDate: post.data.pubDate,
        link: `/${post.id}/`,
        categories: post.data.tags ?? [],
        author: post.data.author ?? SITE.author.name,
      };
    }),
    /** 自定义命名空间：给每篇文章带上最后更新时间，阅读器可据此判断是否真的更新过 */
    customData: `<language>${SITE.lang}</language>`,
    trailingSlash: true,
  });
}
