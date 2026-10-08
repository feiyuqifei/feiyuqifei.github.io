import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * 文章集合。
 *
 * 目录结构即 URL 结构：
 *   src/content/posts/tech/foo.md  →  entry.id = "tech/foo"  →  /tech/foo/
 *   src/content/posts/tools/bar.md →  entry.id = "tools/bar" →  /tools/bar/
 *
 * 注意两点：
 *  1. Astro 7 用的是 Zod v4（zod ^4.6.5），写法与 v3 有细微差异。
 *  2. `z` 必须从 'astro/zod' 导入，不要从 'astro:content' 导入 ——
 *     后者已标记 deprecated，并将在 Astro 8 中移除。
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    /** 文章标题 */
    title: z.string().max(120),
    /** 列表页摘要与 SEO description */
    description: z.string().max(300).optional(),
    /** 发布日期 */
    pubDate: z.coerce.date(),
    /** 最后更新日期，展示在文章页 */
    updatedDate: z.coerce.date().optional(),
    /** 标签，用于标签页与相关文章推荐 */
    tags: z.array(z.string()).default([]),
    /** 细分类别，独立于目录板块（可选） */
    category: z.string().optional(),
    /** 草稿：true 则不出现在任何列表与构建产物中 */
    draft: z.boolean().default(false),
    /** 是否在首页精选区展示 */
    featured: z.boolean().default(false),
    /** 封面图，放在 src/assets 下可用相对路径以获得图片优化 */
    cover: z.string().optional(),
    /** 覆盖站点默认作者 */
    author: z.string().optional(),
  }),
});

export const collections = { posts };
