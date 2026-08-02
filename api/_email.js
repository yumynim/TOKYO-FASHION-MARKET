// ==========================================================
// 注文確認メール送信（Resend HTTP APIを直接fetch。SDK不使用）
//
// 必要な環境変数:
//   RESEND_API_KEY      … Resendダッシュボードで発行
//   RESEND_FROM_EMAIL   … 送信元アドレス。★独自ドメインをResendに接続したら、この値だけ
//                         認証済みドメインのアドレス（例: noreply@example.com）に変更すればよい
//                         （コード側の変更は不要）
//   RESEND_SEND_ENABLED … "true" の時だけ実際に送信する本番スイッチ。それ以外（未設定含む）は
//                         常に送信をスキップする。独自ドメインをResendに接続し、
//                         RESEND_FROM_EMAILを認証済みアドレスに変更した後、
//                         最後に "true" にして本番送信を有効化する
//
// 上記のいずれかが未設定/無効の間は静かに送信をスキップする（決済自体は失敗させない。
// ログにだけ理由を出す＝webhook全体を500で落とすとSquareが再送を繰り返すため）。
// ==========================================================

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const SEND_ENABLED = process.env.RESEND_SEND_ENABLED === "true";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendOrderConfirmationEmail({ to, lineItems, amountTotal, orderNumber, entryCode }) {
  if (!process.env.RESEND_API_KEY || !FROM_EMAIL) {
    console.error("email: RESEND_API_KEY / RESEND_FROM_EMAIL が未設定のため送信をスキップしました");
    return { skipped: true };
  }
  if (!SEND_ENABLED) {
    // ドメイン未接続の間の安全策。RESEND_API_KEY/RESEND_FROM_EMAILが設定済みでも、
    // RESEND_SEND_ENABLED=true にするまでは実際には送信しない。
    console.log("email: RESEND_SEND_ENABLED が true ではないため送信をスキップしました（本番送信は未有効化）。宛先:", to);
    return { skipped: true };
  }
  if (!to) {
    console.error("email: 送信先メールアドレスが不明なため送信をスキップしました");
    return { skipped: true };
  }

  const rows = lineItems
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(i.name)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${i.quantity}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">￥${Number(i.amount).toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;color:#111;max-width:480px;margin:0 auto;">
      <h1 style="font-size:18px;">ご購入ありがとうございました</h1>
      <p style="font-size:14px;line-height:1.6;">TOKYO FASHION MARKET をご利用いただきありがとうございます。<br>以下の内容でお支払いが完了しました。</p>
      ${orderNumber ? `<p style="font-size:13px;color:#444;">ご注文番号: <strong>${esc(orderNumber)}</strong>（お問い合わせの際にお伝えください）</p>` : ""}
      ${entryCode ? `<p style="font-size:15px;color:#111;background:#f5f5f5;padding:10px 14px;border-radius:4px;">当日の受付コード: <strong>${esc(entryCode)}</strong><br><span style="font-size:12px;color:#666;">当日、受付でスタッフにお伝えください。</span></p>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
        <thead>
          <tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #111;">商品</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:2px solid #111;">数量</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:2px solid #111;">金額</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:14px;text-align:right;margin-top:12px;">合計　<strong>￥${Number(amountTotal).toLocaleString("ja-JP")}</strong>（税込）</p>
      <p style="font-size:12px;color:#666;margin-top:24px;">このメールに心当たりがない場合は、恐れ入りますが破棄してください。</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: "【TOKYO FASHION MARKET】ご購入ありがとうございました",
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("email: Resend API error", res.status, body);
    return { skipped: false, ok: false };
  }
  return { skipped: false, ok: true };
}

module.exports = { sendOrderConfirmationEmail };
