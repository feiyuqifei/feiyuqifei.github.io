/**
 * 生成手机预览用的二维码。
 *
 * 为什么用 qrcode 库而不是自研实现：
 *   起初为了保证站点零依赖，我手写过一个纯 Python 的二维码生成器
 *   （字节模式编码 + GF(256) Reed-Solomon 纠错 + 矩阵排布）。
 *   其中 RS 参数表（40 组）已与官方库逐项核对一致，格式信息 32 组也完全一致，
 *   数据区遍历经校验无重复无遗漏 —— 但最终矩阵与官方实现仍有可观差异，
 *   且本机没有扫码设备，无法完成真实的端到端验证。
 *
 *   二维码不是站点功能，只是本地预览的便利工具。在无法完成真实扫码验证的前提下，
 *   使用经过大量实际使用检验的库，比继续调试自研实现更可靠。
 *   它只装在 devDependencies，不进入站点构建产物 —— 站点本身仍是零运行时依赖。
 *
 * 用法:
 *   node scripts/make-qr.mjs <内容> <输出.png> [像素宽度]
 *   pnpm run qr <内容> <输出.png> [像素宽度]
 *
 *   注意：通过 pnpm 调用时不要加 `--` 分隔符，
 *   那会被当成普通参数传给脚本，导致用法报错。
 */

import QRCode from 'qrcode';

const [, , content, outPath, sizeArg] = process.argv;
if (!content || !outPath) {
  console.error('用法: node scripts/make-qr.mjs <内容> <输出.png> [像素宽度]');
  process.exit(2);
}

const width = Number(sizeArg ?? 640);

// 前景用站点的深潜蓝，白底便于打印与手机识别
await QRCode.toFile(outPath, content, {
  errorCorrectionLevel: 'M',
  type: 'png',
  width,
  margin: 3,
  color: { dark: '#0b1017ff', light: '#ffffffff' },
});

const info = QRCode.create(content, { errorCorrectionLevel: 'M' });
console.log(`[OK] ${outPath}`);
console.log(`     内容: ${content}`);
console.log(
  `     版本 ${info.version}  矩阵 ${info.modules.size}x${info.modules.size}  纠错 M  掩码 ${info.maskPattern}`
);
