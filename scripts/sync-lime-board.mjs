#!/usr/bin/env node
/**
 * 把 LimeCTF 课堂排行榜同步到首页数据文件（一次性）。
 *
 * 数据源是夺旗平台的教师导出接口（/export?token=...），CSV 比抓 HTML 稳，
 * 平台改样式也不会把同步脚本弄坏。
 *
 * 用法（在博客仓库根目录执行）：
 *   node scripts/sync-lime-board.mjs
 *   node scripts/sync-lime-board.mjs --url http://10.10.122.50:18089
 *   node scripts/sync-lime-board.mjs --url http://127.0.0.1:18089 --token 你的teacher_token
 *
 * 不传 --token 时会依次尝试环境变量 LIMECTF_TOKEN、相邻目录里的靶场密钥文件。
 *
 * 同步完记得提交并推送：首页构建时读这份 JSON 作为兜底快照。
 * 如果要实时更新，用 scripts/live-board.mjs 常驻推送 lab-data 分支。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  DATA_FILE,
  ROOT,
  buildPayload,
  discoverToken,
  fetchBoard,
} from './lime-board-lib.mjs';

function parseArgs(argv) {
  const opts = {
    url: process.env.LIMECTF_URL || 'http://127.0.0.1:18089',
    token: process.env.LIMECTF_TOKEN || '',
    secrets: '',
    out: DATA_FILE,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--url') opts.url = argv[++i];
    else if (key === '--token') opts.token = argv[++i];
    else if (key === '--secrets') opts.secrets = argv[++i];
    else if (key === '--out') opts.out = resolve(ROOT, argv[++i]);
    else if (key === '--help' || key === '-h') {
      console.log('用法: node scripts/sync-lime-board.mjs [--url URL] [--token TOKEN] [--secrets FILE] [--out FILE]');
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = await discoverToken({ token: opts.token, secrets: opts.secrets });

  console.log(`[fetch] ${opts.url.replace(/\/+$/, '')}/export`);
  const { source, players } = await fetchBoard({ url: opts.url, token });
  const payload = buildPayload({ source, players });

  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const totalSolves = players.reduce((n, p) => n + p.solved, 0);
  console.log(`[ok] ${players.length} 位选手，${totalSolves} 次解出 → ${opts.out}`);
  console.log('[next] git add src/data/lime-leaderboard.json && git commit && git push');
}

main().catch((err) => {
  console.error(`[error] ${err.message}`);
  process.exit(1);
});
