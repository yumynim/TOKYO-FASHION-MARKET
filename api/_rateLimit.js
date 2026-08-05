// ==========================================================
// 簡易レート制限（/api 共通）
// ---------------------------------------------------------
// もともと api/contact.js の中だけにあった仕組みを、他のエンドポイント
// （管理コンソールのログイン試行など）からも使えるように切り出したもの。
//
// ■ 限界をはっきりさせておく
// Vercel Functions は関数インスタンスが使い回されている間だけメモリが残り、
// 同時アクセスが増えるとインスタンス自体が複数に増える。つまりこの制限は
// 「1インスタンスあたり」であって、全体の上限にはならない（＝本気で並列に
// 攻撃されると抜けられる）。それでも、
//   ・素朴な連投スクリプト
//   ・1つのIPからの総当たり
// はこれで大幅に減らせるので、何も無いよりはるかにましという位置づけ。
// 本格的に守るならUpstash等の共有ストアが要る（今は依存を増やさない方針のため見送り）。
// ==========================================================

// キーごと（用途ごと）に独立したカウンターを持つ
const buckets = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "";
}

/**
 * @param {string} name    用途名（'admin-login' 等）。用途ごとに別カウンターにする
 * @param {object} req
 * @param {object} opts    { windowMs, max }
 * @returns {boolean}      true なら制限に引っかかっている（＝リクエストを弾くべき）
 */
function isRateLimited(name, req, opts) {
  const windowMs = (opts && opts.windowMs) || 60 * 1000;
  const max = (opts && opts.max) || 10;
  const ip = clientIp(req);
  if (!ip) return false; // IPが取れない環境では制限しない（正規の利用を止めないため）

  if (!buckets.has(name)) buckets.set(name, new Map());
  const bucket = buckets.get(name);

  const now = Date.now();
  const hits = (bucket.get(ip) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  bucket.set(ip, hits);

  // Mapが無限に増えないよう、たまに古いエントリを掃除する
  if (bucket.size > 500) {
    for (const [key, times] of bucket) {
      if (!times.some((t) => now - t < windowMs)) bucket.delete(key);
    }
  }

  return hits.length > max;
}

module.exports = { isRateLimited, clientIp };
