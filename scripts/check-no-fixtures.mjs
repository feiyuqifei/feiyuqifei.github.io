/**
 * 检查数据文件里有没有混进"测试样例数据"。
 *
 * 为什么需要这个脚本（这是一次真实事故的补救）：
 *   test-team-browser.mjs 会临时往 src/consts.ts 里注入几条样例成员、
 *   验证页面渲染，然后恢复原文件。它的恢复逻辑是
 *     「启动时读一份原文 → 结束时写回」
 *   这个设计有个致命缺陷：**如果某次运行被中断（Ctrl+C、超时、报错
 *   没走到 finally），源文件就留着样例；下一次运行时读到的"原文"
 *   就是那份样例，于是样例被当成真实数据固化下来。**
 *
 *   这次真的发生了：提交 b28ad15 把三位真实成员
 *   （黄光辉 / 黄敏修 / 廖祥裕）替换成了样例里的
 *   沙老师 / 张三 / 李四 / 王五，并且部署到了线上，
 *   直到站长说"之前不是告诉你了指导老师、队长、优秀队员吗"才被发现。
 *
 * 所以加这道检查：**任何会把样例写进源码的脚本，都必须在动手前
 * 先确认源码是干净的。** 同时这个脚本可以独立运行，作为提交前的手动检查。
 *
 * 用法: node scripts/check-no-fixtures.mjs
 * 退出码非 0 表示发现样例数据。
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * 样例数据特征。
 * 只列**样例独有**的名字 —— 像「张三」这种在文档注释的填写示例里
 * 也会出现，所以检查时要排除注释行，否则天天误报。
 */
const FIXTURE_NAMES = [
  '沙老师',      // 样例里的指导老师
  '王五',        // 样例里的已毕业成员
  'definitely-missing.jpg', // 样例里故意指向一个不存在的头像文件
];

/** 会被注入样例的数据文件（相对仓库根） */
const WATCHED = ['src/consts.ts'];

/** 去掉注释行，只留代码 */
function stripComments(text) {
  return text
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
    })
    .join('\n');
}

let bad = 0;

for (const rel of WATCHED) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) {
    console.log(`  [跳过] ${rel} 不存在`);
    continue;
  }
  const code = stripComments(readFileSync(file, 'utf8'));

  for (const name of FIXTURE_NAMES) {
    if (code.includes(name)) {
      bad += 1;
      console.log(`  [!!] ${rel} 的代码区含样例数据「${name}」`);
      // 打印上下文，方便直接定位
      const lines = code.split('\n');
      lines.forEach((l, i) => {
        if (l.includes(name)) console.log(`       L${i + 1}: ${l.trim()}`);
      });
    }
  }
}

console.log('');
if (bad > 0) {
  console.log(`  发现 ${bad} 处测试样例数据混在源码里。`);
  console.log('  处理办法：把真实数据写回去，或从上一个干净的提交里恢复：');
  console.log('    git show <干净的提交>:src/consts.ts > src/consts.ts');
  console.log('  然后用 git diff 确认。');
  process.exit(1);
}
console.log('  OK 源码里没有测试样例数据');
