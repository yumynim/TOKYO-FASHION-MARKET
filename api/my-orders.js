// ==========================================================
// GET /api/my-orders
// ---------------------------------------------------------
// マイページ（members.html）の購入履歴表示用。ログイン中の本人の注文だけを返す。
//
// orders テーブルは anon/authenticated からは一切参照できない（RLSで全拒否）ため、
// api/checkout.js と同じ方式でSupabaseのアクセストークンをサーバー側で再検証し、
// 検証できたユーザー自身の注文のみを service_role 経由で返す
// （フロントから user_id を指定させない＝他人の注文を覗き見できないようにする）。
//
// 必要な環境変数: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ==========================================================
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "許可されていないメソッドです。" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("my-orders: Supabaseの環境変数が未設定です");
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    res.status(401).json({ error: "ログインが必要です。再度ログインしてください。" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, line_items, amount_total, created_at, paid_at, order_number")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("my-orders: 取得に失敗しました", error);
    res.status(500).json({ error: "購入履歴の取得に失敗しました。" });
    return;
  }

  const orders = data || [];

  // 受付コードは1人1コード（entry_passesテーブル）。注文ごとにまとめて付ける。
  // 無効化済み（revoked）は除く。連番の数字順に並べる。
  if (orders.length) {
    const { data: passes, error: passErr } = await supabaseAdmin
      .from("entry_passes")
      .select("order_id, code, checked_in_at")
      .eq("user_id", userData.user.id)
      .eq("status", "valid");
    if (passErr) {
      console.error("my-orders: 受付コードの取得に失敗しました", passErr);
    } else {
      const byOrder = new Map();
      for (const p of passes || []) {
        if (!byOrder.has(p.order_id)) byOrder.set(p.order_id, []);
        byOrder.get(p.order_id).push({ code: p.code, checked_in_at: p.checked_in_at });
      }
      for (const list of byOrder.values()) {
        list.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      }
      for (const o of orders) o.entry_passes = byOrder.get(o.id) || [];
    }
  }

  res.status(200).json({ orders });
};
