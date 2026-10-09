// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * 飞鱼 · Astro 配置
 *
 * 部署目标：GitHub Pages 用户主页仓库（feiyuqifei.github.io）。
 *
 * ── 关于 base（最容易踩的坑）────────────────────────────────
 *   仓库名恰好等于 `<用户名>.github.io` 时，站点挂在域名根部，
 *   访问地址是 https://feiyuqifei.github.io ，**不需要设置 base**。
 *   若以后改成别的仓库名（例如 blog），网站会变成
 *   https://feiyuqifei.github.io/blog/ ，那时必须补上 base: '/blog'，
 *   否则所有 CSS、图片、内链都会 404。
 *
 * ── 关于 Markdown 处理器（Astro 7 的重要变化）──────────────
 *   Astro 6.4 起默认处理器换成了新的原生管线 satteri，
 *   而 satteri 不支持 remark/rehype 生态的插件。
 *   本站需要 KaTeX 数学公式（remark-math + rehype-katex），
 *   因此必须显式配置 processor: unified(...) 换回传统管线。
 *
 *   同时注意：顶层 markdown.remarkPlugins / rehypePlugins 在 Astro 7
 *   已标记 deprecated，插件应传给 processor，不要再写在顶层。
 */
export default defineConfig({
  /** 正式站点地址，用于生成 sitemap、canonical、RSS 的绝对链接 */
  site: 'https://feiyuqifei.github.io',

  /** 静态输出，GitHub Pages 只能托管静态文件 */
  output: 'static',

  /** 站点地图：排除标签聚合页，避免爬虫抓到大量近似页面 */
  integrations: [
    /**
     * MDX 支持。
     *
     * 为什么需要它：文章里要嵌入自定义组件（比如视频播放器 Video.astro），
     * 而 .md 文件不支持 import 组件，必须用 .mdx。
     * 注意 @astrojs/mdx 装了之后**还必须在 integrations 里注册**，
     * 否则构建时只会给一条警告：
     *   [glob-loader] No entry type found for tech/xxx.mdx
     * 然后静默跳过整个文件 —— 页面不生成，也不报错，很容易误判成
     * "草稿没发布"而查错方向。
     */
    mdx(),

    sitemap({
      filter: (page) => !page.includes('/tags/'),
    }),

    /**
     * Pagefind 全文搜索。
     *
     * 这个集成的作用：
     *   1. astro:build:done 时扫描 dist/ 里的 HTML，生成静态搜索索引
     *      写入 dist/pagefind/
     *   2. astro:server:setup 时用 sirv 托管 /pagefind/ 路径，
     *      所以 `astro dev` 下搜索也能用（前提是先成功 build 过一次）
     *
     * 不注册它的后果很隐蔽：页面上的搜索按钮和 <pagefind-modal> 照常渲染，
     * 但它们引用的 /pagefind/*.js 全部 404，点开搜索一片空白且不报错。
     * 所以千万不要漏掉这一行。
     */
    pagefind(),
  ],

  /** Markdown 渲染配置 */
  markdown: {
    /** 换回 remark/rehype 管线，以支持 KaTeX */
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [
          rehypeKatex,
          {
            /**
             * 公式渲染出错时不要把异常抛到页面上，而是把源码原样输出，
             * 这样一篇公式写错的文章不会导致整站构建失败。
             */
            throwOnError: false,
            /** 关闭严格模式，容许一些不规范的写法 */
            strict: false,
            /** 信任 \htmlClass 之类的扩展命令，便于高级排版 */
            trust: false,
            /** 中文文档里公式不要被挤得太紧 */
            output: 'html',
          },
        ],
      ],
      /** 保留 GFM（表格、任务列表、自动链接），中文技术文章离不开表格 */
      gfm: true,
      /**
       * SmartyPants 会把直引号转成弯引号。
       * 中文排版里这个转换只在英文语境下有益，而技术文章大量出现
       * 代码和命令行参数，转换容易误伤，所以关闭。
       */
      smartypants: false,
    }),

    /**
     * 代码高亮：Shiki 内置，深浅色双主题。
     * themes 双主题模式会为每个 token 输出 --shiki-light / --shiki-dark
     * 两个 CSS 变量，需要在 global.css 里按 data-theme 切换（见该文件）。
     */
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
      wrap: false,
    },
  },

  /** 构建时为图片生成优化格式与尺寸（Sharp 是 Astro 默认服务） */
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
});
