// ==========================================================
// POST /api/admin-login
// ---------------------------------------------------------
// /console の合言葉を検証し、トークンを発行する。
// ADMIN_CONSOLE_PASSWORD をVercelの環境変数に設定してから使うこと。
// ==========================================================
const crypto = require("crypto");
const { issueAdminToken } = require("./_adminAuth");

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

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  // 長さが違うと timingSafeEqual が例外を投げるため、先に長さを揃えてから比較する
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    res.status(401).json({ error: "パスワードが違います" });
    return;
  }

  res.status(200).json({ token: issueAdminToken() });
};
