// ==========================================================
// 注文確認メール送信（Resend HTTP APIを直接fetch。SDK不使用）
//
// メールの外枠（ヘッダー・フッター付きのモノクロテンプレート）は
// api/_mailer.js の buildEmailHtml を共用する（お知らせ配信・お問い合わせ返信と
// 同じ見た目に揃えるため）。送信ゲート（RESEND_SEND_ENABLED等）も共通。
//
// 受付コードのQRはその場で生成してbase64で直接埋め込む（api/_qr.js参照）。
// 外部サービス（api.qrserver.com）から読み込む方式は、複数人分のQRを1通に
// 載せたとき2人目以降が表示されない事故が起きうるためやめた。
//
// 必要な環境変数:
//   RESEND_API_KEY      … Resendダッシュボードで発行
//   RESEND_FROM_EMAIL   … 送信元アドレス（Resendで認証済みのドメインのもの）
//   RESEND_SEND_ENABLED … "true" の時だけ実際に送信する本番スイッチ
// 上記のいずれかが未設定/無効の間は静かに送信をスキップする（決済自体は失敗させない。
// ログにだけ理由を出す＝webhook全体を500で落とすとSquareが再送を繰り返すため）。
// ==========================================================

const { buildEmailHtml, SITE_URL } = require("./_mailer");
const { qrDataUri } = require("./_qr");

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const SEND_ENABLED = process.env.RESEND_SEND_ENABLED === "true";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function yen(n) {
  return `￥${Number(n).toLocaleString("ja-JP")}`;
}

/**
 * @param {object} params
 * @param {string}   params.to
 * @param {Array}    params.lineItems    [{name, quantity, amount}]
 * @param {number}   params.amountTotal
 * @param {string}   [params.orderNumber]
 * @param {string[]} [params.entryCodes] 当日の受付コード（1人1コード。まとめ買いなら人数分）
 */
async function sendOrderConfirmationEmail({ to, lineItems, amountTotal, orderNumber, entryCodes }) {
  if (!process.env.RESEND_API_KEY || !FROM_EMAIL) {
    console.error("email: RESEND_API_KEY / RESEND_FROM_EMAIL が未設定のため送信をスキップしました");
    return { skipped: true };
  }
  if (!SEND_ENABLED) {
    console.log("email: RESEND_SEND_ENABLED が true ではないため送信をスキップしました（本番送信は未有効化）。宛先:", to);
    return { skipped: true };
  }
  if (!to) {
    console.error("email: 送信先メールアドレスが不明なため送信をスキップしました");
    return { skipped: true };
  }

  const codes = Array.isArray(entryCodes) ? entryCodes.filter(Boolean) : [];

  const rows = lineItems
    .map(
      (i) =>
        `<tr><td style="padding:8px; border-bottom:1px solid #e4e4e4;">${esc(i.name)}</td>` +
        `<td style="padding:8px; border-bottom:1px solid #e4e4e4; text-align:right;">${i.quantity}</td>` +
        `<td style="padding:8px; border-bottom:1px solid #e4e4e4; text-align:right;">${yen(i.amount)}</td></tr>`
    )
    .join("");

  // 受付コード欄。1人1コードなので、まとめ買いのときは「◯人目」のラベルを付けて
  // 人数分のQRを全部載せる（ご同行者にそれぞれのQRを転送してもらう想定）。
  const codesHtml = codes.length
    ? `<div style="background:#f5f5f5; border-left:3px solid #0d0d0d; padding:16px; margin:0 0 20px;">
        <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#0d0d0d;">当日の受付コード</p>
        ${codes.length > 1 ? `<p style="margin:0 0 12px; font-size:13px; color:#3a3a3a;">コードはお一人につき1つ・1回のみ有効です。ご同行者にはそれぞれのコード（QR）をお渡しください。</p>` : ""}
        ${codes
          .map(
            (c, i) =>
              `${codes.length > 1 ? `<p style="margin:12px 0 4px; font-size:14px; font-weight:700; color:#0d0d0d;">── ${i + 1}人目 ──</p>` : ""}` +
              `<p style="margin:0 0 6px; font-size:16px; font-weight:700; letter-spacing:0.04em; color:#0d0d0d;">${esc(c)}</p>` +
              `<img src="${qrDataUri(c, 12)}" alt="受付QRコード ${esc(c)}" width="180" height="180" style="display:block; margin:0 0 8px;">`
          )
          .join("")}
        <p style="margin:8px 0 0; font-size:12px; color:#757575;">当日、受付でこのQRコードをご提示いただくか、コードをスタッフにお伝えください。</p>
      </div>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;">TOKYO FASHION MARKET をご利用いただきありがとうございます。<br>以下の内容でお支払いが完了しました。</p>
    ${orderNumber ? `<p style="margin:0 0 16px; font-size:13px; color:#3a3a3a;">ご注文番号: <strong>${esc(orderNumber)}</strong>（お問い合わせの際にお伝えください）</p>` : ""}
    ${codesHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:13px; margin:0 0 12px;">
      <thead>
        <tr><th style="text-align:left; padding:8px; border-bottom:2px solid #0d0d0d;">商品</th>
            <th style="text-align:right; padding:8px; border-bottom:2px solid #0d0d0d;">数量</th>
            <th style="text-align:right; padding:8px; border-bottom:2px solid #0d0d0d;">金額</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0 0 24px; font-size:14px; text-align:right;">合計　<strong>${yen(amountTotal)}</strong>（税込）</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
      <tr><td>
        <a href="${esc(SITE_URL)}/members.html" style="display:inline-block; background:#0d0d0d; color:#ffffff; text-decoration:none; font-size:14px; letter-spacing:0.02em; padding:14px 28px;">マイページで確認する</a>
      </td></tr>
    </table>`;

  const html = buildEmailHtml({
    heading: "ご購入ありがとうございました",
    bodyHtml,
    footerNote: "このメールに心当たりがない場合は、恐れ入りますが破棄してください。",
  });

  // HTMLを表示できないメールソフト向けのプレーンテキスト版
  const textLines = [
    "TOKYO FASHION MARKET をご利用いただきありがとうございます。以下の内容でお支払いが完了しました。",
    ...(orderNumber ? [`ご注文番号: ${orderNumber}`] : []),
    ...(codes.length ? [`当日の受付コード: ${codes.join(" / ")}（お一人につき1つ・1回のみ有効）`] : []),
    "",
    ...lineItems.map((i) => `${i.name} × ${i.quantity} … ${yen(i.amount)}`),
    `合計: ${yen(amountTotal)}（税込）`,
  ];

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
      text: textLines.join("\n"),
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
