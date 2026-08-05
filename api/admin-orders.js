// ==========================================================
// /api/admin-orders
// ---------------------------------------------------------
// /console の「決済未完了の注文」セクションから使う。
//   GET    : status='pending'の注文を一覧取得（新しい順）
//   DELETE : 1件削除する（Square側で放置され、二度と支払われる見込みが無いものの掃除用）
//
// 認証はお知らせ投稿と同じ、共通パスワード方式（api/_adminAuth.js）。
//
// 削除してもSquare Webhookが後から届いた場合、square_order_idで該当行を探せず
// 「no pending order matched」として静かに無視されるだけなので安全（api/webhooks/square.js参照）。
// ==========================================================
const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken } = require("./_adminAuth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  // GETのトークンはヘッダーのみで受け取る（URLの ?token= はアクセスログに残るため受け付けない）
  const token = req.method === "GET" ? req.headers["x-admin-token"] : (req.body || {}).token;
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data, error } = await serviceClient
      .from("orders")
      .select("id, buyer_email, line_items, amount_total, created_at, order_number")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { res.status(500).json({ error: "読み込みに失敗しました" }); return; }
    res.status(200).json({ orders: data || [] });
    return;
  }

  // DELETE
  const { id } = req.body || {};
  if (!id) { res.status(400).json({ error: "idが必要です" }); return; }
  const { error } = await serviceClient.from("orders").delete().eq("id", id).eq("status", "pending");
  if (error) { res.status(500).json({ error: "削除に失敗しました" }); return; }
  res.status(200).json({ ok: true });
};
