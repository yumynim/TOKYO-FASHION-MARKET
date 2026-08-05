// ==========================================================
// GET /api/order-status?order=<orders.id>
//
// 購入完了ページ（checkout-complete.html）が、Square Webhookでの
// 支払い確認が完了したかをポーリングして確認するための読み取り専用API。
//
// orders テーブルは anon/authenticated からは一切参照できない（RLSで全拒否）ため、
// このAPI（service_role）を経由してのみ、該当注文の最小限の情報を返す。
// id は推測困難な UUID のため、認証なしでの参照を許容している
// （Stripeのcheckout session確認ページ等と同様の設計）。
//
// 必要な環境変数: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ==========================================================

const { createClient } = require("@supabase/supabase-js");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "許可されていないメソッドです。" });
    return;
  }

  const orderId = req.query && req.query.order;
  if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
    res.status(400).json({ error: "不正な注文IDです。" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("order-status: Supabaseの環境変数が未設定です");
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("status, line_items, amount_total, order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("order-status: 取得に失敗しました", error);
    res.status(500).json({ error: "注文の確認に失敗しました。" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "注文が見つかりません。" });
    return;
  }

  // 受付コードは1人1コード（entry_passesテーブル）。まとめ買いなら人数分返る。
  let entryCodes = [];
  if (data.status === "paid") {
    const { data: passes, error: passErr } = await supabaseAdmin
      .from("entry_passes")
      .select("code")
      .eq("order_id", orderId)
      .eq("status", "valid");
    if (passErr) console.error("order-status: 受付コードの取得に失敗しました", passErr);
    // 連番の数字順（文字列順だと 10 が 2 より前に来てしまうため長さ→辞書順で並べる）
    entryCodes = (passes || []).map((p) => p.code).sort((a, b) => a.length - b.length || a.localeCompare(b));
  }

  res.status(200).json({
    status: data.status,
    lineItems: data.line_items,
    amountTotal: data.amount_total,
    orderNumber: data.order_number,
    entryCodes,
  });
};
