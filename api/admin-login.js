// ==========================================================
// POST /api/admin-login
// ---------------------------------------------------------
// /console と /checkin の合言葉を検証し、トークンを発行する。
// ADMIN_CONSOLE_PASSWORD をVercelの環境変数に設定してから使うこと。
// 当日スタッフ用の合言葉（CHECKIN_PASSWORD）は /checkin だけに通す
// （未設定なら従来通り ADMIN_CONSOLE_PASSWORD だけで両方使える）。
// ==========================================================
const crypto = require("crypto");
const { issueAdminToken } = require("./_adminAuth");
const { isRateLimited } = require("./_rateLimit");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    // 値は返さず「設定されているかどうか」だけを返す診断用
    res.status(200).json({ configured: !!process.env.ADMIN_CONSOLE_PASSWORD });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  // 合言葉の総当たり対策。ここが破られると顧客情報の閲覧・全会員へのメール送信まで通ってしまう。
  if (isRateLimited("admin-login", req, { windowMs: 5 * 60 * 1000, max: 10 })) {
    res.status(429).json({ error: "試行回数が多すぎます。しばらく時間をおいてからお試しください" });
    return;
  }

  const expected = process.env.ADMIN_CONSOLE_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "サーバー側でパスワードが設定されていません（ADMIN_CONSOLE_PASSWORD）" });
    return;
  }

  const { password } = req.body || {};
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "パスワードを入力してください" });
    return;
  }

  // 長さが違うと timingSafeEqual が例外を投げるため、先に長さを確認してから比較する
  const matches = (candidate) => {
    if (!candidate) return false;
    const a = Buffer.from(password);
    const b = Buffer.from(candidate);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  if (matches(expected)) {
    res.status(200).json({ token: issueAdminToken("admin"), scope: "admin" });
    return;
  }
  if (matches(process.env.CHECKIN_PASSWORD)) {
    res.status(200).json({ token: issueAdminToken("checkin"), scope: "checkin" });
    return;
  }

  res.status(401).json({ error: "パスワードが違います" });
};
