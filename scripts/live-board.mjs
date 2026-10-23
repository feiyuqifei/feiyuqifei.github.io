#!/usr/bin/env node
/**
 * 课堂排行榜实时同步（ntfy 推送 + 签名）。
 *
 * 工作方式：
 *   1. 每 5 秒从 LimeCTF 平台拉一次 /export（教师 token，本机密钥文件里读）；
 *   2. 榜单（前 5 名 + 总人数/总解出）有变化时，用 ECDSA P-256 私钥签名；
 *   3. 把 {v,d,s} 信封 POST 到 ntfy.sh 的私有 topic；
 *   4. 首页用 EventSource 订阅同一个 topic，验签后渲染 —— 变化后 1~2 秒到浏览器。
 *
 * 为什么用 ntfy：
 *   GitHub Pages 是静态托管，raw/Pages 都有几分钟 CDN 缓存，做不到实时；
 *   ntfy 的 SSE 是长连接，消息到达即推送，且支持 CORS，不需要账号。
 *
 * 安全：
 *   topic 名会出现在页面源码里，任何人理论上都能往里发消息；首页只接受
 *   用私钥签名的信封，伪造的 JSON 验签失败会被直接丢弃。私钥只存在
 *   _tools/lab-secrets/live-board-key.json，不进仓库、不进页面。
 *
 * 用法：
 *   node scripts/live-board.mjs --url http://10.10.122.50:18089
 *   node scripts/live-board.mjs --url http://127.0.0.1:18089 --interval 5000
 *   node scripts/live-board.mjs --once --dry-run      # 排查用
 */
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  buildPayload,
  discoverToken,
  fetchBoard,
  localIso,
  playersFingerprint,
} from './lime-board-lib.mjs';

const { subtle } = webcrypto;

const DEFAULTS = {
  server: process.env.LIME_NTFY_SERVER || 'https://ntfy.sh',
  topic: process.env.LIME_NTFY_TOPIC || 'limefeiyu-board-c3375f08e2a0',
  interval: 5000,
  maxMessageBytes: 3900,
};

function parseArgs(argv) {
  const opts = {
    url: process.env.LIMECTF_URL || 'http://127.0.0.1:18089',
    token: process.env.LIMECTF_TOKEN || '',
    secrets: '',
    key: '',
    server: DEFAULTS.server,
    topic: DEFAULTS.topic,
    interval: DEFAULTS.interval,
    once: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--url') opts.url = argv[++i];
    else if (key === '--token') opts.token = argv[++i];
    else if (key === '--secrets') opts.secrets = argv[++i];
    else if (key === '--key') opts.key = argv[++i];
    else if (key === '--server') opts.server = argv[++i].replace(/\/+$/, '');
    else if (key === '--topic') opts.topic = argv[++i];
    else if (key === '--interval') opts.interval = Math.max(2000, Number(argv[++i]) || 5000);
    else if (key === '--once') opts.once = true;
    else if (key === '--dry-run') opts.dryRun = true;
    else if (key === '--help' || key === '-h') {
      console.log('用法: node scripts/live-board.mjs [--url URL] [--topic TOPIC] [--server URL] [--key FILE] [--interval MS] [--once] [--dry-run]');
      process.exit(0);
    }
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const log = (...args) => console.log(`[${stamp()}]`, ...args);
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 私钥只在教师机上：先看 --key，再找两种目录布局。 */
function loadKey(explicit) {
  const candidates = explicit
    ? [explicit]
    : [
        join(ROOT, '..', 'limeMart', '_tools', 'lab-secrets', 'live-board-key.json'),
        join(ROOT, '..', '_tools', 'lab-secrets', 'live-board-key.json'),
        join(ROOT, '..', '..', '_tools', 'lab-secrets', 'live-board-key.json'),
      ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.privateJwk && data.publicSpki) return { file, ...data };
  }
  throw new Error('找不到 live-board-key.json；用 --key 指定，或重新生成密钥并更新组件里的公钥');
}

/** 只发首页需要的字段：前 20 名 + 总人数/总解出，控制 ntfy 单条 4KB 限制。 */
function compactPayload({ source, players }) {
  const top = players.slice(0, 20);
  return {
    v: 1,
    generatedAt: localIso(),
    source,
    playerCount: players.length,
    solveCount: players.reduce((n, p) => n + p.solved, 0),
    players: top,
  };
}

async function signPayload(payload, key) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = await subtle.importKey(
    'jwk',
    key.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data));
  return { data, sig };
}

async function publish(payload, key, opts) {
  const { data, sig } = await signPayload(payload, key);
  const envelope = JSON.stringify({ v: 1, d: b64url(data), s: b64url(sig) });
  const bytes = Buffer.byteLength(envelope, 'utf8');
  if (bytes > DEFAULTS.maxMessageBytes) {
    throw new Error(`消息 ${bytes}B 超过 ntfy 限制，减少展示人数`);
  }
  const res = await fetch(`${opts.server}/${encodeURIComponent(opts.topic)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8', Accept: 'application/json' },
    body: envelope,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ntfy 返回 HTTP ${res.status}`);
  const info = await res.json();
  return { id: info.id, bytes };
}

function acquireLock() {
  const lock = join(ROOT, '.git', 'lime-live.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8').trim());
    if (pid && pid !== process.pid) {
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (err) {
        alive = err.code === 'EPERM';
      }
      if (alive) throw new Error(`已有 live-board 在运行（PID ${pid}）`);
    }
  }
  writeFileSync(lock, String(process.pid), 'utf8');
  return () => rmSync(lock, { force: true });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = await discoverToken({ token: opts.token, secrets: opts.secrets });
  const key = loadKey(opts.key);
  const release = acquireLock();

  let lastFingerprint = '';
  let failures = 0;

  const stop = () => {
    release();
    log('已停止');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log(`实时榜：${opts.url} → ${opts.server}/${opts.topic}（每 ${opts.interval / 1000}s 检查）`);
  log(`签名密钥：${key.file}`);

  for (;;) {
    try {
      const { source, players } = await fetchBoard({ url: opts.url, token, timeout: 10000 });
      const payload = compactPayload({ source, players });
      const fingerprint = `${playersFingerprint(players)}:${payload.playerCount}:${payload.solveCount}`;

      if (fingerprint !== lastFingerprint) {
        if (opts.dryRun) {
          log(`[dry-run] ${payload.playerCount} 人 / ${payload.solveCount} 次解出，未发布`);
        } else {
          const { id, bytes } = await publish(payload, key, opts);
          log(`已发布 ${id} · ${payload.playerCount} 人 / ${payload.solveCount} 次解出 · ${bytes}B`);
        }
        lastFingerprint = fingerprint;
      }
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures === 1 || failures % 12 === 0) log(`同步失败（第 ${failures} 次）：${err.message}`);
      if (opts.once) {
        release();
        process.exitCode = 1;
        return;
      }
    }

    if (opts.once) break;
    await sleep(opts.interval);
  }

  release();
  log('结束');
}

main().catch((err) => {
  console.error(`[${stamp()}] 启动失败：${err.message}`);
  process.exit(1);
});
