/**
 * URL 拼接工具
 * ------------------------------------------------------------------
 * 全站内部链接都必须经过 withBase()，这样部署到 GitHub Pages 子路径
 * （例如 /blog/）时不会 404。BASE_URL 来自 astro.config.mjs 的 base 配置，
 * 由 Vite 在构建时注入。
 *
 * BASE_URL 的形态并不统一：
 *   base: '/'      → '/'
 *   base: '/blog'  → '/blog'（trailingSlash: 'never' 时没有尾斜杠）
 *   base: '/blog/' → '/blog/'
 * 所以这里统一规整成「有且只有首尾各一个斜杠」的前缀再拼接。
 */

import { SITE } from '../consts';

/** 规整后的 base 前缀，一定是 `/` 或 `/xxx/` 的形式 */
const BASE: string = (() => {
  // Astro 里 import.meta.env 一定有值，但脱离 Vite（如 Node 单测）时可能缺失，
  // 这里显式标注为可能 undefined，既能安全兜底，也不会触发 TS 的「多余可选链」报错
  const env = import.meta.env as ImportMetaEnv | undefined;
  const raw = (env?.BASE_URL ?? '/').trim();
  if (raw === '' || raw === '/') return '/';
  // 先去掉所有首尾斜杠，再统一补上，避免出现 //blog// 这种畸形前缀
  return `/${raw.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
})();

/** 站点根 URL，去掉结尾斜杠，便于与以 / 开头的路径拼接 */
const SITE_ORIGIN: string = SITE.url.replace(/\/+$/, '');

/**
 * 把站内相对路径拼上 base。
 *   withBase('tags')     → '/tags'      （base 为 '/'）
 *   withBase('/tags')    → '/blog/tags' （base 为 '/blog/'）
 *   withBase('')         → '/' 或 '/blog/'
 * 保证不出现 `//`，也不会丢掉 base。
 */
export function withBase(path: string): string {
  // 去掉入参的起始斜杠，统一由 BASE 提供分隔斜杠
  const clean = path.replace(/^\/+/, '');
  if (clean === '') return BASE;
  return BASE + clean;
}

/**
 * 生成绝对 URL（用于 canonical、RSS、og:url）。
 * SITE.url 已去掉尾斜杠，withBase 必以 / 开头，所以不会出现双斜杠。
 */
export function absoluteUrl(path: string): string {
  return SITE_ORIGIN + withBase(path);
}

/**
 * 由 content collection 的 id 生成文章 URL。
 *   postUrl('tech/hello') → '/tech/hello/'（base 为 '/'）
 * 去掉 id 首尾多余斜杠，保证结果只以单个 / 收尾。
 */
export function postUrl(id: string): string {
  const clean = id.replace(/^\/+/, '').replace(/\/+$/, '');
  if (clean === '') return BASE;
  return `${withBase(clean)}/`;
}
