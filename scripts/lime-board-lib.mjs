/**
 * LimeCTF 排行榜数据工具：拉取教师导出 CSV、解析、生成首页 JSON。
 *
 * 被两个脚本共用：
 *   sync-lime-board.mjs  一次性同步，写入 src/data/lime-leaderboard.json
 *   live-board.mjs       常驻轮询，数据一变就把 JSON 推到 lab-data 分支
 *
 * 平台的 /export 需要 teacher_token。优先用参数 / 环境变量，其次从
 * 相邻目录的靶场密钥文件里读（本机与旧机器的两种目录布局都覆盖）。
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = join(ROOT, 'src', 'data', 'lime-leaderboard.json');

/** 平台导出的 CSV：支持引号、逗号和换行，别用 split(',')。 */
export function parseCsv(text) {
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

/** 本机时区的 ISO 时间，带 +08:00 偏移；服务器在境外也不会写错时间。 */
export function localIso(date = new Date()) {
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
export function comparePlayers(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.lastSolvedAt || '9999-12-31 23:59:59';
  const bt = b.lastSolvedAt || '9999-12-31 23:59:59';
  return at.localeCompare(bt);
}

/** 只对「会影响榜单的内容」做指纹；时间戳变化不算改榜，避免每轮都推。 */
export function playersFingerprint(players) {
  const normalized = players.map((p) => [
    p.rank,
    p.nickname,
    p.username,
    p.score,
    p.solved,
    p.firstBloods,
    p.lastSolvedAt,
  ]);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/** 依次尝试：环境变量 → 显式 --secrets → 相邻目录的靶场密钥文件。 */
export async function discoverToken({ token = '', secrets = '' } = {}) {
  if (token.trim()) return token.trim();
  if (process.env.LIMECTF_TOKEN?.trim()) return process.env.LIMECTF_TOKEN.trim();

  if (secrets) {
    const data = JSON.parse(await readFile(resolve(ROOT, secrets), 'utf8'));
    return String(data.teacher_token || '').trim();
  }

  const candidates = [
    /* 本机：workspace/limeMart/ctf-lab/limeMart + workspace/blog-src */
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
      if (token) return token;
    } catch {
      /* 密钥文件坏了就继续试下一个，最后统一报错 */
    }
  }
  throw new Error('找不到 teacher_token，请传 --token，或设置环境变量 LIMECTF_TOKEN');
}

/**
 * 从平台导出接口拉一次榜单。
 * @returns {Promise<{source: string, players: Array}>}
 */
export async function fetchBoard({ url, token, timeout = 12000 }) {
  const endpoint = new URL('/export', url);
  endpoint.searchParams.set('public', '1');
  endpoint.searchParams.set('token', token);

  const res = await fetch(endpoint, {
    headers: { Accept: 'text/csv' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    throw new Error(`平台返回 HTTP ${res.status}：token 不对，或 ${url} 不是 LimeCTF 平台`);
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

  return { source: url.replace(/\/+$/, ''), players };
}

/** 首页 JSON 的完整形状。 */
export function buildPayload({ source, players, generatedAt = localIso() }) {
  return {
    generatedAt,
    source,
    playerCount: players.length,
    solveCount: players.reduce((n, p) => n + p.solved, 0),
    players,
  };
}
