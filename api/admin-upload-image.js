// ==========================================================
// POST /api/admin-upload-image
// ---------------------------------------------------------
// /console の配信エディタ「画像」ブロック用。Supabase Storageの
// announcement-images バケット（Public。Supabaseダッシュボードで事前に手動作成が必要）へ
// アップロードし、公開URLを返す。
//
// 対応形式: JPEG / PNG / WebP / GIF、3MBまで。
// ==========================================================
const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken } = require("./_adminAuth");

const BUCKET = "announcement-images";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  const { token, contentType, dataBase64 } = req.body || {};
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
    return;
  }

  const ext = ALLOWED[contentType];
  if (!ext) {
    res.status(400).json({ error: "対応していない画像形式です（JPEG/PNG/WebP/GIFのみ）" });
    return;
  }
  if (!dataBase64 || typeof dataBase64 !== "string") {
    res.status(400).json({ error: "画像データがありません" });
    return;
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length > MAX_BYTES) {
    res.status(400).json({ error: "ファイルが大きすぎます（3MBまで）" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadError } = await serviceClient.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("admin-upload-image: upload failed", uploadError.message);
    res.status(500).json({ error: "アップロードに失敗しました。Supabase Storageに announcement-images バケット（Public）が作成済みか確認してください。" });
    return;
  }

  const { data } = serviceClient.storage.from(BUCKET).getPublicUrl(path);
  res.status(200).json({ url: data.publicUrl });
};
