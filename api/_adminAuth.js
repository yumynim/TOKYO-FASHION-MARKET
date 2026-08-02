// ==========================================================
// /console（管理コンソール）用の共通パスワード認証ヘルパー
// ---------------------------------------------------------
// Supabaseの個人アカウントではなく、運営チームで1つの合言葉
// （ADMIN_CONSOLE_PASSWORD）を共有する方式。
// api/admin-login.js がパスワードを検証してトークンを発行し、
// api/admin-announcements.js / api/admin-inquiries.js / api/admin-upload-image.js が
// そのトークンを検証する。
//
// トークンは「有効期限.署名」の単純な形式。
// パスワードをローテーションすると、発行済みトークンは全て自動的に無効になる
// （＝別の鍵で署名し直されるため）。
// ==========================================================
const crypto = require("crypto");

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

function sign(expiresAt) {
  return crypto.createHmac("sha256", process.env.ADMIN_CONSOLE_PASSWORD || "").update(String(expiresAt)).digest("hex");
}

function issueAdminToken() {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifyAdminToken(token) {
  if (!process.env.ADMIN_CONSOLE_PASSWORD || !token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = Buffer.from(sign(expiresAtStr));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = { issueAdminToken, verifyAdminToken };
