// ==========================================================
// /console（お知らせ配信・問い合わせ対応）と /checkin（当日の入場確認）で
// 使う合言葉認証ヘルパー
// ---------------------------------------------------------
// Supabaseの個人アカウントではなく、合言葉を共有する方式。
// api/admin-login.js が合言葉を検証してトークンを発行し、
// api/admin-*.js がそのトークンを検証する。
//
// ■ 権限を2種類に分けている
//   scope 'admin'   … ADMIN_CONSOLE_PASSWORD で発行。/console と /checkin の両方。
//   scope 'checkin' … CHECKIN_PASSWORD で発行。/checkin だけ。
// 当日のボランティアには CHECKIN_PASSWORD だけを渡す運用にすれば、
// お問い合わせの内容を読んだり、会員全員にメールを送ったり、購入者の一覧を
// まとめて見たりはできなくなる（合言葉が1つだけだと、入場確認を手伝って
// もらうだけで顧客情報の全権を渡すことになってしまう）。
// ただし入場確認そのものに本人確認が要るため、checkin 権限でも
// 「受付に来た人の氏名・メールアドレス」と「チェックイン済み一覧」は見える。
// CHECKIN_PASSWORD が未設定なら、ADMIN_CONSOLE_PASSWORD だけで両方使える
// （設定し忘れても運用は止まらない）。
//
// ■ トークンの形式
//   「有効期限.権限.署名」
// 署名は「有効期限.権限」に対するHMAC-SHA256。権限も署名対象に含めるので、
// checkin用トークンの文字列をadminに書き換えても署名が合わなくなる。
//
// ■ 署名鍵について（重要）
// 合言葉をそのままHMACの鍵にすると、トークンを1つ入手した人（例: 当日だけ
// 手伝ってもらったボランティア）が手元で合言葉を総当たりできてしまう。
// トークンは「有効期限（平文）.HMAC」という形なので、候補の合言葉でHMACを
// 計算して一致するか試すだけでよく、HMAC-SHA256は非常に高速なため、
// ありがちな合言葉なら短時間で割れる。そこで:
//   1. ADMIN_TOKEN_SECRET があればそれを鍵に使う（合言葉と無関係になる＝最善）
//   2. 無ければ合言葉を scrypt で伸長した値を鍵に使う
//      （1回の試行に時間がかかるようになり、総当たりが現実的でなくなる）
// ==========================================================
const crypto = require("crypto");

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24時間
const SCOPES = ["admin", "checkin"];

// scryptは意図的に重い処理なので、同じ入力に対する結果は使い回す
// （リクエストのたびに計算すると1回あたり100ms前後かかるため）。
let cachedKey = null;
let cachedKeySource = null;

function signingKey() {
  const explicit = process.env.ADMIN_TOKEN_SECRET;
  if (explicit) return explicit;

  const password = process.env.ADMIN_CONSOLE_PASSWORD || "";
  if (cachedKeySource !== password) {
    cachedKey = crypto.scryptSync(password, "tfm-admin-token-v1", 32);
    cachedKeySource = password;
  }
  return cachedKey;
}

function sign(payload) {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function issueAdminToken(scope) {
  const useScope = SCOPES.includes(scope) ? scope : "admin";
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${expiresAt}.${useScope}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * @param {string} token
 * @param {string} [requiredScope]  'admin'（既定）または 'checkin'。
 *   'checkin' を要求した場合、admin権限のトークンでも通す（運営本人も入場確認をするため）。
 *   'admin' を要求した場合、checkin権限のトークンは通さない。
 */
function verifyAdminToken(token, requiredScope) {
  if (!process.env.ADMIN_CONSOLE_PASSWORD || !token || typeof token !== "string") return false;

  const parts = token.split(".");
  // 権限を持たない旧形式（有効期限.署名）は受け付けない。
  // 発行から24時間で自然に消えるものなので、互換のために残すより拒否したほうが安全。
  if (parts.length !== 3) return false;

  const [expiresAtStr, scope, signature] = parts;
  if (!SCOPES.includes(scope)) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = Buffer.from(sign(`${expiresAtStr}.${scope}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  if (!crypto.timingSafeEqual(expected, actual)) return false;

  const needed = requiredScope || "admin";
  if (needed === "admin") return scope === "admin";
  return true; // checkin を要求 → admin でも checkin でも可
}

module.exports = { issueAdminToken, verifyAdminToken };
