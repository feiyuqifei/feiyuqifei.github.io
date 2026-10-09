/**
 * 探测 Umami Cloud 是否有免登录（公开）的数据查询途径。
 *
 * 背景：浏览量数据存在 Umami Cloud 账号里，网页端要登录。
 * 但 Umami 有几种可能绕过登录的方式，需要实测确认哪一种真的可用：
 *   1. 公开分享链接（网站设置里生成 Share URL，带 token）
 *   2. 公开 API（用 API Key）
 *   3. 某些端点对匿名请求放行（不太可能，但要试）
 *
 * 本脚本只做探测，不做任何写入。
 *
 * 用法: node scripts/probe-umami-api.mjs [shareToken] [apiKey]
 */

const HOST = 'https://api.umami.is';
const CLOUD = 'https://cloud.umami.is';
const WID = '69ad8fb5-fa2e-4bd7-923a-7a5fdc97f8e0';

const shareToken = process.argv[2] ?? null;
const apiKey = process.argv[3] ?? null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 发一个请求，返回状态码与响应体摘要 */
async function probe(url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        ...(opts.headers || {}),
      },
      redirect: 'follow',
    });
    const text = await res.text();
    let kind = 'text';
    let preview = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      kind = 'json';
      preview = JSON.stringify(j).slice(0, 200);
    } catch { /* 不是 JSON */ }
    return { status: res.status, kind, preview, len: text.length };
  } catch (e) {
    return { status: 0, kind: 'error', preview: e.message, len: 0 };
  }
}

/** 常见的时间范围参数 */
const RANGES = ['24h', '7d', '30d', '1y'];

async function main() {
  console.log('==== 1. 匿名访问 v1 API（预期 401） ====');
  const cases = [
    [`${HOST}/v1/websites/${WID}/stats?startAt=0&endAt=${Date.now()}`, {}],
    [`${HOST}/v1/websites/${WID}/pageviews?startAt=0&endAt=${Date.now()}`, {}],
    [`${HOST}/v1/websites/${WID}`, {}],
    [`${HOST}/v1/websites`, {}],
    [`${HOST}/v1/auth/verify`, {}],
  ];
  for (const [url, opts] of cases) {
    const r = await probe(url, opts);
    const tag = r.status === 200 ? '[OK]' : '[--]';
    console.log(`  ${tag} HTTP ${String(r.status).padEnd(4)} ${url.replace(HOST, '').slice(0, 60)}`);
    if (r.status === 200) console.log(`        ${r.preview}`);
    await sleep(250);
  }

  console.log('\n==== 2. cloud.umami.is 的 API 代理路径 ====');
  const cloudCases = [
    `${CLOUD}/api/websites/${WID}/stats`,
    `${CLOUD}/api/share/${WID}`,
    `${CLOUD}/api/share`,
  ];
  for (const url of cloudCases) {
    const r = await probe(url);
    console.log(`  ${r.status === 200 ? '[OK]' : '[--]'} HTTP ${String(r.status).padEnd(4)} ${url.replace(CLOUD, '')}`);
    if (r.status === 200) console.log(`        ${r.preview}`);
    await sleep(250);
  }

  console.log('\n==== 3. 若提供了 share token，尝试用它查数据 ====');
  if (!shareToken) {
    console.log('  未提供 share token，跳过。');
    console.log('  （从 Umami 网站的设置里生成 Share URL 后，把其中的 token 传进来）');
  } else {
    /* Share URL 形如 https://cloud.umami.is/share/<token> */
    const shareEndpoints = [
      `${HOST}/v1/share/${shareToken}`,
      `${HOST}/v1/share/${shareToken}/stats?startAt=0&endAt=${Date.now()}`,
      `${CLOUD}/api/share/${shareToken}`,
    ];
    for (const url of shareEndpoints) {
      const r = await probe(url);
      console.log(`  ${r.status === 200 ? '[OK]' : '[--]'} HTTP ${String(r.status).padEnd(4)} ${url.slice(0, 90)}`);
      if (r.status === 200) console.log(`        ${r.preview}`);
      await sleep(250);
    }
  }

  console.log('\n==== 4. 若提供了 API Key，尝试带鉴权查数据 ====');
  if (!apiKey) {
    console.log('  未提供 API Key，跳过。');
    console.log('  （Umami 设置 → API Keys 里可以创建一个）');
  } else {
    const now = Date.now();
    const authHeaders = { Authorization: `Bearer ${apiKey}`, 'x-umami-api-key': apiKey };
    for (const range of RANGES) {
      const start = now - ({ '24h': 864e5, '7d': 6048e5, '30d': 2592e6, '1y': 31536e6 }[range]);
      const url = `${HOST}/v1/websites/${WID}/stats?startAt=${start}&endAt=${now}`;
      const r = await probe(url, { headers: authHeaders });
      console.log(`  ${r.status === 200 ? '[OK]' : '[--]'} HTTP ${String(r.status).padEnd(4)} 范围 ${range.padEnd(5)}`);
      if (r.status === 200) console.log(`        ${r.preview}`);
      await sleep(250);
    }
  }

  console.log('\n==== 结论 ====');
  console.log('  若第 1、2 组全部非 200，说明没有免登录途径，');
  console.log('  必须由账号持有者登录 cloud.umami.is，或提供 Share token / API Key。');
}

main().catch((e) => {
  console.error('探测出错:', e.message);
  process.exitCode = 1;
});
