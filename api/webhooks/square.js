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
const { qrDataUri } = require("../_qr");

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

// 受付コードのイベント識別部分。CURRENT_EVENT_ID（例: 0927）が設定されていればそれを、
// 未設定なら支払い確定日（YYYYMMDD）を使う（設定し忘れても発行自体は止まらない）。
// /checkin はこのプレフィックスで「今回のイベントのコードか」を判定するため、
// イベントが決まったら CURRENT_EVENT_ID を設定する運用を推奨（README参照）。
function currentEventId() {
  const explicit = String(process.env.CURRENT_EVENT_ID || "").trim();
  if (explicit) return explicit;
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

// 受付コードの発行。1コード＝1人＝1回入場（数量2で買ったら別々のコードを2つ発行する）。
// 実際の生成・保存はDB関数 issue_entry_passes（supabase/schema.sql）が行ロック付きで
// 行うので、Squareが同じ通知を再送して同時に2回呼ばれても二重発行にならない
// （2回目は発行済みのコードがそのまま返る）。
async function issueEntryPasses(supabaseAdmin, order) {
  const items = Array.isArray(order.line_items) ? order.line_items : [];
  const quantity = items
    .filter((i) => i.type === "ticket")
    .reduce((n, i) => n + Math.max(1, parseInt(i.quantity, 10) || 1), 0);
  if (quantity < 1) return [];

  const { data, error } = await supabaseAdmin.rpc("issue_entry_passes", {
    p_order_id: order.id,
    p_event: currentEventId(),
    p_quantity: quantity,
  });
  if (error) { console.error("issue_entry_passes failed:", error.message); return []; }
  // returns setof text は文字列の配列で返る（PostgRESTの仕様が変わっても拾えるよう両対応）
  return (data || [])
    .map((r) => (typeof r === "string" ? r : (r && (r.issue_entry_passes || r.code))))
    .filter(Boolean);
}

// 受付コードを発行できなかったときに運営へ知らせる。
// これを出さないと、購入者にはコードの無いメールが届くだけで、
// こちらは当日その人が受付に来るまで気づけない。
async function notifyEntryCodeFailure(order) {
  const adminTo = process.env.CONTACT_TO_EMAIL;
  if (!adminTo) return;
  try {
    await sendEmail({
      to: adminTo,
      subject: "【要対応】受付コードを発行できませんでした",
      text: [
        `注文 ${order.order_number || order.id} の決済は完了しましたが、受付コードを発行できませんでした。`,
        `購入者: ${order.buyer_email || "（不明）"}`,
        "",
        "このままだと当日この方が入場できません。Supabaseで下記を確認し、手動で対応してください。",
        "  select o.id, o.order_number, o.buyer_email, o.created_at from orders o",
        "   where o.status='paid' and not exists (select 1 from entry_passes ep where ep.order_id = o.id);",
        "",
        "よくある原因: supabase/schema.sql の entry_passes 部分の未実行、issue_entry_passes 関数の権限不足。",
      ].join("\n"),
    });
  } catch (e) {
    console.error("entry code failure notify email failed:", e);
  }
}

// アプリ内通知（notifications テーブル）用の本文組み立て
function buildOrderNotification(lineItems, amountTotal, orderNumber, entryCodes) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const codes = Array.isArray(entryCodes) ? entryCodes : [];
  const total = `￥${Number(amountTotal).toLocaleString("ja-JP")}`;
  const body =
    items.length <= 1
      ? `${(items[0] && items[0].name) || "ご注文"}（合計 ${total}）のお支払いが完了しました。`
      : `${items[0].name} ほか${items.length - 1}点（合計 ${total}）のお支払いが完了しました。`;
  const withOrderNumber = orderNumber ? `${body}\nご注文番号: ${orderNumber}` : body;
  const codesText = codes.length
    ? codes.length === 1
      ? `\n当日の受付コード: ${codes[0]}`
      : `\n当日の受付コード: ${codes.join(" / ")}\nコードはお一人につき1つ・1回のみ有効です。ご同行者にはそれぞれのコード（QR）をお渡しください。`
    : "";
  return { title: "ご購入ありがとうございました", body: withOrderNumber + codesText };
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
    ...(isPaid && Array.isArray(order.entry_codes) && order.entry_codes.length
      ? [`受付コード: ${order.entry_codes.join(" / ")}`]
      : []),
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
  // 1コード＝1人＝1回入場なので、チケットの数量分のコードが返る。
  // この処理自体が「status='pending'→'paid' の更新が成功した時だけ」実行されるブロック内にあり、
  // さらにDB関数側でも発行済みならそのまま返す設計のため、Webhookの重複配信があっても
  // 再発行・二重発行されることはない。
  const items = Array.isArray(updated.line_items) ? updated.line_items : [];
  const hasTicket = items.some((i) => i.type === "ticket");
  const entryCodes = hasTicket ? await issueEntryPasses(supabaseAdmin, updated) : [];
  if (hasTicket && !entryCodes.length) await notifyEntryCodeFailure(updated);

  const result = await sendOrderConfirmationEmail({
    to: updated.buyer_email,
    lineItems: updated.line_items,
    amountTotal: updated.amount_total,
    orderNumber: updated.order_number,
    entryCodes,
  });
  if (result && result.ok === false) {
    // メール送信に失敗しても決済確定自体は成功しているので200を返す（Squareの再送対象にはしない）。
    // 届かなかったこと自体には誰も気づけないため、運営に知らせておく
    // （サイト内通知は下で入るので購入者は当日困らないが、「メールが来ない」と
    // 問い合わせが来る前にこちらから対応できるようにする）。
    console.error("square webhook: 確認メール送信に失敗しました。orderId:", updated.id);
    if (process.env.CONTACT_TO_EMAIL) {
      try {
        await sendEmail({
          to: process.env.CONTACT_TO_EMAIL,
          subject: "【要対応】購入確認メールを送信できませんでした",
          text: [
            `注文 ${updated.order_number || updated.id} の購入確認メールを ${updated.buyer_email || "（不明）"} に送信できませんでした（Resendのエラー）。`,
            `受付コード: ${entryCodes.length ? entryCodes.join(" / ") : "（発行なし）"}`,
            "サイト内通知（マイページのお知らせ）には同じ内容が入っています。",
            "必要ならこのお客様に手動でメールしてください。",
          ].join("\n"),
        });
      } catch (e) {
        console.error("square webhook: メール送信失敗の運営通知にも失敗しました", e);
      }
    }
  }

  // アプリ内通知を1件作成（失敗してもメールと同様に決済確定自体は成功扱いのまま続行）。
  // この insert 自体が「status='pending'→'paid' の更新が成功した時だけ」実行される上のブロック内にあるため、
  // Webhookの重複配信があっても通知が二重に作られることはない。
  // 受付コードがある場合は、通知ベル・マイページでQR画像もその場で見られるようにする
  // （body_html。メールと同じQRをその場で生成して埋め込む＝外部サービスへの通信なし）。
  const notif = buildOrderNotification(updated.line_items, updated.amount_total, updated.order_number, entryCodes);
  const bodyHtml = entryCodes.length
    ? `<p>${escHtml(notif.body).replace(/\n/g, "<br>")}</p>` +
      entryCodes
        .map(
          (c, i) =>
            `<p style="margin-top:10px; font-weight:700;">${entryCodes.length > 1 ? `${i + 1}人目：` : ""}${escHtml(c)}</p>` +
            `<img src="${qrDataUri(c, 12)}" alt="受付QRコード ${escHtml(c)}" width="140" height="140" style="margin-top:4px;">`
        )
        .join("")
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
  await notifyAdmin({ ...updated, entry_codes: entryCodes }, "paid");

  res.status(200).send("ok");
};
