#!/usr/bin/env node
/**
 * 把 LimeCTF 课堂排行榜同步到首页数据文件。
 *
 * 数据源是夺旗平台的教师导出接口（/export?token=...），CSV 比抓 HTML 稳，
 * 平台改样式也不会把同步脚本弄坏。
 *
 * 用法（在博客仓库根目录执行）：
 *   node scripts/sync-lime-board.mjs
 *   node scripts/sync-lime-board.mjs --url http://10.10.122.50:18089
 *   node scripts/sync-lime-board.mjs --url http://127.0.0.1:18089 --token 你的teacher_token
 *
 * 不传 --token 时会依次尝试：
 *   1. 环境变量 LIMECTF_TOKEN
 *   2. 相邻目录里的靶场密钥文件（本机 / 旧机器的两种目录布局）
 * 找不到就报错退出，不会把空密码发给平台。
 *
 * 同步完记得提交并推送：首页是构建时读这份 JSON 的，
 * 不 push 就只改了本地文件。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'lime-leaderboard.json');

function parseArgs(argv) {
  const opts = {
    url: process.env.LIMECTF_URL || 'http://127.0.0.1:18089',
    token: process.env.LIMECTF_TOKEN || '',
    secrets: '',
    out: OUT,
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

/** 平台导出的 CSV：支持引号、逗号和换行，别用 split(',')。 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** 本机时区（课堂在上海）的 ISO 时间，带 +08:00 偏移，首页直接格式化。 */
function localIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** 按平台习惯排序：总分降序，同分按最后解出时间升序（没解出的排最后）。 */
function comparePlayers(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.lastSolvedAt || '9999-12-31 23:59:59';
  const bt = b.lastSolvedAt || '9999-12-31 23:59:59';
  return at.localeCompare(bt);
}

async function discoverToken(opts) {
  if (opts.token) return opts.token.trim();
  if (opts.secrets) {
    const data = JSON.parse(await readFile(resolve(ROOT, opts.secrets), 'utf8'));
    return String(data.teacher_token || '').trim();
  }
  const candidates = [
    /* 本机：workspace/limeMart/ctf-lab/limeMart + workspace/blog */
    join(ROOT, '..', 'limeMart', '_tools', 'lab-secrets', 'limeMart.json'),
    /* 旧机器：deepseek工作区/ctf-lab/limeMart + deepseek工作区/blog */
    join(ROOT, '..', '_tools', 'lab-secrets', 'limeMart.json'),
    join(ROOT, '..', '..', '_tools', 'lab-secrets', 'limeMart.json'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      const token = String(data.teacher_token || '').trim();
      if (token) {
        console.log(`[token] 使用密钥文件 ${file}`);
        return token;
      }
    } catch {
      /* 密钥文件坏了就继续试下一个，最后统一报错 */
    }
  }
  throw new Error('找不到 teacher_token，请传 --token，或设置环境变量 LIMECTF_TOKEN');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = await discoverToken(opts);

  const endpoint = new URL('/export', opts.url);
  endpoint.searchParams.set('token', token);

  console.log(`[fetch] ${endpoint.origin}/export`);
  const res = await fetch(endpoint, { headers: { Accept: 'text/csv' } });
  if (!res.ok) {
    throw new Error(`平台返回 HTTP ${res.status}：token 不对，或 ${opts.url} 不是 LimeCTF 平台`);
  }

  const csv = (await res.text()).replace(/^\uFEFF/, '');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('平台返回的 CSV 没有数据行');

  const header = rows[0].map((h) => h.trim());
  const index = (name, fallback) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const col = {
    username: index('用户名', 0),
    nickname: index('昵称', 1),
    score: index('总分', 2),
    solved: index('解出题数', 3),
    firstBloods: index('一血数', 4),
    lastSolvedAt: index('最后解出时间', 5),
  };

  const players = rows
    .slice(1)
    .map((r) => ({
      nickname: (r[col.nickname] || '').trim() || (r[col.username] || '').trim(),
      username: (r[col.username] || '').trim(),
      score: Number.parseInt(r[col.score] || '0', 10) || 0,
      solved: Number.parseInt(r[col.solved] || '0', 10) || 0,
      firstBloods: Number.parseInt(r[col.firstBloods] || '0', 10) || 0,
      lastSolvedAt: (r[col.lastSolvedAt] || '').trim() || null,
    }))
    .sort(comparePlayers)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const payload = {
    /* 首页显示「更新于」，方便读者判断是不是旧数据 */
    generatedAt: localIso(),
    source: opts.url.replace(/\/+$/, ''),
    players,
  };

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
