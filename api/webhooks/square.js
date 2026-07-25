// ==========================================================
// POST /api/webhooks/square
//
// Squareからの決済確定通知（payment.updated）を受け取り、
//   1. 署名を検証（なりすまし・改ざん防止。必ず行う）
//   2. 支払いが完了（status: COMPLETED）していれば、
//      square_order_id で orders テーブルの該当行を pending → paid に更新
//   3. 更新できた場合のみ（＝初めて paid にした場合のみ）確認メールとアプリ内通知(notifications)を送信
//      （Webhookは同じイベントが複数回届くことがあるため、
//        「status='pending' の行を更新できた時だけ送る」ことで二重送信を防いでいる）
//
// Square Developer Dashboard での設定:
//   Webhook の Notification URL: {SITE_URL}/api/webhooks/square
//   購読イベント: payment.updated
//   → 発行される Signature Key を SQUARE_WEBHOOK_SIGNATURE_KEY に設定
//
// 必要な環境変数:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   SQUARE_WEBHOOK_SIGNATURE_KEY
//   SITE_URL（署名検証の対象URLの組み立てに使用。Dashboardの設定と完全一致させること）
//   RESEND_API_KEY / RESEND_FROM_EMAIL（_email.js 参照）
// ==========================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { sendOrderConfirmationEmail } = require("../_email");

// 署名検証には生のリクエストボディが必須（JSON.parse後の再シリアライズはバイト単位で一致しない）。
// Vercel の Node.js Functions はこの config でボディの自動パースを止められる。
module.exports.config = {
  api: { bodyParser: false },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidSignature(rawBody, signatureHeader, notificationUrl, signatureKey) {
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
  const a = Buffer.from(hmac);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// アプリ内通知（notifications テーブル）用の本文組み立て
function buildOrderNotification(lineItems, amountTotal) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const total = `￥${Number(amountTotal).toLocaleString("ja-JP")}`;
  const body =
    items.length <= 1
      ? `${(items[0] && items[0].name) || "ご注文"}（合計 ${total}）のお支払いが完了しました。`
      : `${items[0].name} ほか${items.length - 1}点（合計 ${total}）のお支払いが完了しました。`;
  return { title: "ご購入ありがとうございました", body };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || !process.env.SITE_URL) {
    console.error("square webhook: SQUARE_WEBHOOK_SIGNATURE_KEY / SITE_URL が未設定です");
    res.status(500).send("Server not configured");
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("square webhook: Supabaseの環境変数が未設定です");
    res.status(500).send("Server not configured");
    return;
  }

  const rawBody = await readRawBody(req);
  const notificationUrl = `${process.env.SITE_URL}/api/webhooks/square`;
  const signatureHeader = req.headers["x-square-hmacsha256-signature"];

  if (!isValidSignature(rawBody, signatureHeader, notificationUrl, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)) {
    console.error("square webhook: 署名検証に失敗しました");
    res.status(401).send("Invalid signature");
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).send("Invalid JSON");
    return;
  }

  // 支払い完了以外のイベントは受理だけして何もしない（200を返さないとSquareが再送し続ける）
  const payment = event && event.data && event.data.object && event.data.object.payment;
  if (event.type !== "payment.updated" || !payment || payment.status !== "COMPLETED") {
    res.status(200).send("ignored");
    return;
  }

  const squareOrderId = payment.order_id;
  if (!squareOrderId) {
    res.status(200).send("no order_id");
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // pending の行だけを対象に更新 → 既に paid 済みなら0件更新になり、再送でもメールが重複送信されない
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("orders")
    .update({ status: "paid", square_payment_id: payment.id, paid_at: new Date().toISOString() })
    .eq("square_order_id", squareOrderId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (updateError) {
    console.error("square webhook: orders更新に失敗しました", updateError);
    // Squareに再送させて後で拾えるように500を返す
    res.status(500).send("update failed");
    return;
  }

  if (!updated) {
    // 該当行が無い（見つからない注文）か、既にpaid済み（重複通知）のどちらか。後者は正常。
    res.status(200).send("no pending order matched");
    return;
  }

  const result = await sendOrderConfirmationEmail({
    to: updated.buyer_email,
    lineItems: updated.line_items,
    amountTotal: updated.amount_total,
  });
  if (result && result.ok === false) {
    // メール送信に失敗しても決済確定自体は成功しているので200を返す（Squareの再送対象にはしない）。
    console.error("square webhook: 確認メール送信に失敗しました。orderId:", updated.id);
  }

  // アプリ内通知を1件作成（失敗してもメールと同様に決済確定自体は成功扱いのまま続行）。
  // この insert 自体が「status='pending'→'paid' の更新が成功した時だけ」実行される上のブロック内にあるため、
  // Webhookの重複配信があっても通知が二重に作られることはない。
  const notif = buildOrderNotification(updated.line_items, updated.amount_total);
  const { error: notifError } = await supabaseAdmin.from("notifications").insert({
    user_id: updated.user_id,
    type: "order_paid",
    title: notif.title,
    body: notif.body,
    related_order_id: updated.id,
  });
  if (notifError) {
    console.error("square webhook: 通知の作成に失敗しました。orderId:", updated.id, notifError);
  }

  res.status(200).send("ok");
};
