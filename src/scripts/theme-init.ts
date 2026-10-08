/**
 * 首屏防闪白（FOUC）内联脚本。
 *
 * 为什么必须是内联且同步执行：
 *   主题是写在 <html data-theme> 上的。如果这段逻辑放进外部模块脚本，
 *   浏览器会先按 :root 默认值（浅色）渲染一帧，然后才切成深色，
 *   用户会看到明显的白屏闪烁。内联脚本在 <head> 里同步跑完，
 *   首次绘制前 data-theme 就已就位。
 *
 * 为什么同时写两个属性：
 *   - data-theme    给站内样式用（global.css 的设计令牌）
 *   - data-pf-theme 给 Pagefind Component UI 用，它只认这个属性，
 *     且刻意不跟随 prefers-color-scheme（因为它无法判断宿主站点是否响应系统主题）。
 *   两个一起设置，搜索弹层才不会和全站配色脱节。
 *
 * 三态优先级：localStorage 里的手动选择 > 系统偏好 > 默认深色。
 * 用 try/catch 包住 localStorage：无痕模式或禁用 Cookie 时会抛异常，
 * 不能因此让整站脚本挂掉。
 */
export const THEME_INIT_SCRIPT = `(function () {
  var theme;
  try {
    var stored = localStorage.getItem('feiyu-theme');
    theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
  } catch (e) {
    theme = 'dark';
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-pf-theme', theme);
  root.style.colorScheme = theme;
})();`;
