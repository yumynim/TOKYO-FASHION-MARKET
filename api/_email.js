// ==========================================================
// 注文確認メール送信（Resend HTTP APIを直接fetch。SDK不使用）
//
// 必要な環境変数:
//   RESEND_API_KEY     … Resendダッシュボードで発行
//   RESEND_FROM_EMAIL  … 認証済みドメインの送信元アドレス（例: noreply@example.com）
//
// 未設定の間は静かに送信をスキップする（決済自体は失敗させない。
// ログにだけ警告を出す＝webhook全体を500で落とすとSquareが再送を繰り返すため）。
// ==========================================================

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendOrderConfirmationEmail({ to, lineItems, amountTotal }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error("email: RESEND_API_KEY / RESEND_FROM_EMAIL が未設定のため送信をスキップしました");
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
      from: process.env.RESEND_FROM_EMAIL,
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
