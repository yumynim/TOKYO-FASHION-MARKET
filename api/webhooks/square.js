// ==========================================================
// POST /api/webhooks/square
//
// Squareからの決済結果通知（payment.updated）を受け取り、
//   1. 署名を検証（なりすまし・改ざん防止。必ず行う）
//   2. 支払いが完了（status: COMPLETED）していれば、
//      square_order_id で orders テーブルの該当行を pending → paid に更新
//   3. 更新できた場合のみ（＝初めて paid にした場合のみ）確認メールとアプリ内通知(notifications)を送信
//      （Webhookは同じイベントが複数回届くことがあるため、
//        「status='pending' の行を更新できた時だけ送る」ことで二重送信を防いでいる）
//   4. 支払いが失敗/キャンセル（status: FAILED / CANCELED）なら pending → failed に更新し、
//      購入者へ「お支払いが完了しませんでした」の通知・メールを送る
//   5. 支払い確定/キャンセル時は運営宛て（CONTACT_TO_EMAIL）にも通知メールを送る（見逃し防止）
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
//   CONTACT_TO_EMAIL（任意。運営宛ての購入/キャンセル通知メールの宛先）
// ==========================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { sendOrderConfirmationEmail } = require("../_email");
const { sendEmail } = require("../_mailer");

// 署名検証には生のリクエストボディが必須（JSON.parse後の再シリアライズはバイト単位で一致しない）。
// Vercel の Node.js Functions はこの config でボディの自動パースを止められる。
module.exports.config = {
  api: { bodyParser: false },
};

// チャンクをBufferのまま集めてから最後に文字列化する。
// `data += chunk` のように1チャンクずつ文字列化すると、日本語などのマルチバイト文字が
// チャンクの境目で分断されたときに文字化けし、署名計算の対象がSquareの送った本文と
// 変わってしまう（＝正規の通知なのに署名不一致で弾かれ、決済が反映されなくなる）。
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
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

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 受付コードのQR画像URL。外部の無料サービス（api.qrserver.com）に生成を任せる
// （追加のライブラリ・課金なしで済ませるため）。渡すのは受付コードの文字列だけで、
// 氏名・メールアドレス等の個人情報は含まない。
// サイト内表示にも使うため、vercel.json の CSP img-src にこのドメインを許可してある。
function entryCodeQrUrl(code, size) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size || 240}x${size || 240}&data=${encodeURIComponent(code)}`;
}

// 当日の入場受付コード。「TFM-支払い確定日-ランダム4文字」の形式（例: TFM-20260802-7K4M）。
// 見間違い・聞き見間違いしやすい文字（0/O, 1/I/L, U/V等）を除いた文字セットから選ぶ。
// order_number（注文作成時に発行、問い合わせ用）とは別物 —
// こちらは支払いが確定した時点で、チケットを含む注文にだけ発行する。
const ENTRY_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTWXYZ";
function generateEntryCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ENTRY_CODE_CHARS[crypto.randomInt(ENTRY_CODE_CHARS.length)];
  return `TFM-${y}${m}${d}-${suffix}`;
}

// orders.entry_code はユニーク制約があるため、衝突したら別の値で数回だけ再試行する
// （1日あたりランダム部分だけで約70万通りあるため、実際に衝突することはほぼ無い）。
async function assignEntryCode(supabaseAdmin, orderId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateEntryCode();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ entry_code: code })
      .eq("id", orderId)
      .select("entry_code")
      .single();
    if (!error) return data.entry_code;
    if (error.code !== "23505") { console.error("entry_code assign failed:", error.message); return null; }
  }
  console.error("entry_code assign failed: 衝突が続いたため断念しました orderId=", orderId);
  return null;
}

// アプリ内通知（notifications テーブル）用の本文組み立て
function buildOrderNotification(lineItems, amountTotal, orderNumber, entryCode) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const total = `￥${Number(amountTotal).toLocaleString("ja-JP")}`;
  const body =
    items.length <= 1
      ? `${(items[0] && items[0].name) || "ご注文"}（合計 ${total}）のお支払いが完了しました。`
      : `${items[0].name} ほか${items.length - 1}点（合計 ${total}）のお支払いが完了しました。`;
  const withOrderNumber = orderNumber ? `${body}\nご注文番号: ${orderNumber}` : body;
  const withEntryCode = entryCode ? `${withOrderNumber}\n当日の受付コード: ${entryCode}` : withOrderNumber;
  return { title: "ご購入ありがとうございました", body: withEntryCode };
}

// 運営宛ての通知メール。お問い合わせと同じ宛先（CONTACT_TO_EMAIL）に送る。
// 未設定でもエラーにせず静かにスキップする（購入者本人への通知は別途送信済みのため、
// これが失敗しても決済処理には支障がない）。
async function notifyAdmin(order, newStatus) {
  const adminTo = process.env.CONTACT_TO_EMAIL;
  if (!adminTo) {
    console.warn("square webhook: CONTACT_TO_EMAIL が未設定のため運営宛て通知はスキップします");
    return;
  }
  const isPaid = newStatus === "paid";
  const items = Array.isArray(order.line_items) ? order.line_items : [];
  // 件名に改行が混ざらないようにする（商品名はカタログ由来だが、念のため）
  const safeName = String((items[0] && items[0].name) || "ご注文").replace(/[\r\n]+/g, " ");
  const subject = isPaid ? `【購入通知】${safeName}` : `【キャンセル通知】${safeName}`;
  const lines = [
    ...items.map((i) => `${i.name} × ${i.quantity} … ￥${Number(i.amount).toLocaleString("ja-JP")}`),
    `合計: ￥${Number(order.amount_total || 0).toLocaleString("ja-JP")}`,
    `購入者: ${order.buyer_email || "（不明）"}`,
    ...(order.order_number ? [`注文番号: ${order.order_number}`] : []),
    ...(isPaid && order.entry_code ? [`受付コード: ${order.entry_code}`] : []),
  ];
  try {
    await sendEmail({ to: adminTo, subject, text: lines.join("\n") });
  } catch (e) {
    console.error("square webhook: 運営宛て通知メールの送信に失敗しました", e);
  }
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

  // 決済結果イベント以外は受理だけして何もしない（200を返さないとSquareが再送し続ける）。
  // payment.status: 'COMPLETED'（支払い完了）| 'FAILED' / 'CANCELED'（不成立）| その他（途中経過）
  const payment = event && event.data && event.data.object && event.data.object.payment;
  const paymentStatus = payment && payment.status;
  const newStatus =
    paymentStatus === "COMPLETED" ? "paid" : paymentStatus === "FAILED" || paymentStatus === "CANCELED" ? "failed" : null;
  if (event.type !== "payment.updated" || !payment || !newStatus) {
    res.status(200).send("ignored");
    return;
  }

  const squareOrderId = payment.order_id;
  if (!squareOrderId) {
    res.status(200).send("no order_id");
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // pending の行だけを対象に更新 → 既に確定済みなら0件更新になり、再送でもメール・通知が重複しない
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      status: newStatus,
      square_payment_id: payment.id,
      ...(newStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
    })
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
    // 該当行が無い（見つからない注文）か、既に確定済み（重複通知）のどちらか。後者は正常。
    res.status(200).send("no pending order matched");
    return;
  }

  // ---------- 支払い不成立（FAILED / CANCELED） ----------
  // 購入者に「完了しなかった」ことを通知し、運営にも知らせて終了する。
  // 以前は完了以外を無視していたため、注文が pending のまま残り購入者にも何も伝わらなかった。
  if (newStatus === "failed") {
    const failedItems = Array.isArray(updated.line_items) ? updated.line_items : [];
    const firstName = (failedItems[0] && failedItems[0].name) || "ご注文";
    const failedBody =
      `${firstName}${failedItems.length > 1 ? ` ほか${failedItems.length - 1}点` : ""}のお支払いがキャンセル、` +
      `または失敗しました。お手数ですが再度お手続きください。` +
      (updated.order_number ? `\nご注文番号: ${updated.order_number}` : "");

    const { error: failNotifError } = await supabaseAdmin.from("notifications").insert({
      user_id: updated.user_id,
      type: "order_failed",
      title: "お支払いが完了しませんでした",
      body: failedBody,
      related_order_id: updated.id,
    });
    if (failNotifError) console.error("square webhook: キャンセル通知の作成に失敗しました", failNotifError);

    if (updated.buyer_email) {
      await sendEmail({
        to: updated.buyer_email,
        subject: "お支払いが完了しませんでした",
        text: failedBody,
        ctaLabel: "サイトに戻る",
        ctaUrl: process.env.SITE_URL,
      });
    }
    await notifyAdmin(updated, "failed");

    res.status(200).send("ok (failed)");
    return;
  }

  // チケットを含む注文にだけ、当日の入場受付コードを発行する（グッズのみの注文には不要）。
  // この処理自体が「status='pending'→'paid' の更新が成功した時だけ」実行されるブロック内にあるため、
  // Webhookの重複配信があってもentry_codeが上書き・再発行されることはない
  // （2回目以降は`updated`がnullになりここまで到達しない）。
  const items = Array.isArray(updated.line_items) ? updated.line_items : [];
  const hasTicket = items.some((i) => i.type === "ticket");
  const entryCode = hasTicket ? await assignEntryCode(supabaseAdmin, updated.id) : null;

  const result = await sendOrderConfirmationEmail({
    to: updated.buyer_email,
    lineItems: updated.line_items,
    amountTotal: updated.amount_total,
    orderNumber: updated.order_number,
    entryCode,
  });
  if (result && result.ok === false) {
    // メール送信に失敗しても決済確定自体は成功しているので200を返す（Squareの再送対象にはしない）。
    console.error("square webhook: 確認メール送信に失敗しました。orderId:", updated.id);
  }

  // アプリ内通知を1件作成（失敗してもメールと同様に決済確定自体は成功扱いのまま続行）。
  // この insert 自体が「status='pending'→'paid' の更新が成功した時だけ」実行される上のブロック内にあるため、
  // Webhookの重複配信があっても通知が二重に作られることはない。
  // 受付コードがある場合は、通知ベル・マイページでQR画像もその場で見られるようにする
  // （body_html。メールと同じQRを表示する）。
  const notif = buildOrderNotification(updated.line_items, updated.amount_total, updated.order_number, entryCode);
  const bodyHtml = entryCode
    ? `<p>${escHtml(notif.body).replace(/\n/g, "<br>")}</p>` +
      `<img src="${entryCodeQrUrl(entryCode, 140)}" alt="受付QRコード ${escHtml(entryCode)}" width="140" height="140" style="margin-top:8px;">`
    : null;
  const { error: notifError } = await supabaseAdmin.from("notifications").insert({
    user_id: updated.user_id,
    type: "order_paid",
    title: notif.title,
    body: notif.body,
    body_html: bodyHtml,
    related_order_id: updated.id,
  });
  if (notifError) {
    console.error("square webhook: 通知の作成に失敗しました。orderId:", updated.id, notifError);
  }

  // 運営にも購入があったことを知らせる（見逃し防止。CONTACT_TO_EMAIL未設定ならスキップ）
  await notifyAdmin({ ...updated, entry_code: entryCode }, "paid");

  res.status(200).send("ok");
};
