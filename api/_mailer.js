// ==========================================================
// お知らせ配信・お問い合わせ返信で使う共通メール送信処理（Resend HTTP APIを直接fetch）
// ---------------------------------------------------------
// api/admin-announcements.js（お知らせ配信）と api/admin-inquiries.js（返信）、
// api/contact.js（受付通知・自動返信）から使う。
//
// 購入確認メール（api/_email.js の sendOrderConfirmationEmail）とは意図的に別経路にしている。
// 動作確認済みの決済フローに影響を与えないため。
//
// 必要な環境変数（api/_email.js と共通のゲートをそのまま踏襲）:
//   RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_SEND_ENABLED（"true"の時だけ実送信）
// 上記のいずれかが未設定/無効の間は静かに送信をスキップする。
// ==========================================================

const SITE_URL = (process.env.SITE_URL || "https://tokyofashionmarket.com").replace(/\/$/, "");

// お問い合わせへの返信専用の送信元にしたい場合はこちらを使う（未設定ならRESEND_FROM_EMAILを使う）。
// ドメイン接続後、返信専用アドレスを分けたくなったら環境変数化を検討する。
const INQUIRY_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

const MAX_BLOCKS = 30;
const MAX_PARAGRAPH_LEN = 4000;
const MAX_LABEL_LEN = 40;
const MAX_ALT_LEN = 140;

// TFMのモノクロ基調（css/style.css の :root トークンに合わせる）
const TEXT_COLORS = { default: "#3a3a3a", ink: "#0d0d0d", muted: "#757575", accent: "#0d0d0d" };
function resolveColor(key, fallback) {
  return TEXT_COLORS[key] || TEXT_COLORS[fallback] || TEXT_COLORS.default;
}
const HEADING_SIZES = { lg: "24px", md: "19px", sm: "16px" };

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// href に javascript: 等が紛れ込まないよう、http(s)以外は既定のサイトURLに差し替える
function sanitizeUrl(url) {
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  return SITE_URL;
}

function textToHtmlParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function buttonHtml(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
    <tr><td>
      <a href="${escapeHtml(sanitizeUrl(url))}" style="display:inline-block; background:#0d0d0d; color:#ffffff; text-decoration:none; font-size:14px; letter-spacing:0.02em; padding:14px 28px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/* /console の配信エディタが送ってくる「ブロック」配列を、
   メール本文のHTML／プレーンテキストの両方に変換する。
   ブロックの種類:
     - heading:  { type: 'heading', text, size: 'lg'|'md'|'sm', color }
     - paragraph:{ type: 'paragraph', text, color }
     - callout:  { type: 'callout', text }
     - image:    { type: 'image', url, alt }
     - divider:  { type: 'divider' }
     - button:   { type: 'button', label, url } */
function renderBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks.slice(0, MAX_BLOCKS) : [];
  const htmlParts = [];
  const textParts = [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.type === "heading") {
      const text = String(raw.text || "").slice(0, MAX_PARAGRAPH_LEN).trim();
      if (!text) continue;
      const size = HEADING_SIZES[raw.size] || HEADING_SIZES.md;
      const color = resolveColor(raw.color, "ink");
      htmlParts.push(`<h2 style="margin:0 0 14px; font-size:${size}; line-height:1.5; font-weight:700; color:${color};">${escapeHtml(text)}</h2>`);
      textParts.push(`■ ${text}`);
    } else if (raw.type === "paragraph") {
      const text = String(raw.text || "").slice(0, MAX_PARAGRAPH_LEN).trim();
      if (!text) continue;
      const color = resolveColor(raw.color, "default");
      htmlParts.push(`<p style="margin:0 0 16px; color:${color};">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`);
      textParts.push(text);
    } else if (raw.type === "callout") {
      const text = String(raw.text || "").slice(0, MAX_PARAGRAPH_LEN).trim();
      if (!text) continue;
      htmlParts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#f5f5f5; border-left:3px solid #0d0d0d; padding:14px 16px; font-size:14px; line-height:1.8; color:#3a3a3a;">${escapeHtml(text).replace(/\n/g, "<br>")}</td></tr></table>`);
      textParts.push(`※ ${text}`);
    } else if (raw.type === "image") {
      if (!isHttpUrl(raw.url)) continue;
      const url = raw.url.trim();
      const alt = String(raw.alt || "").slice(0, MAX_ALT_LEN).trim();
      htmlParts.push(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="536" style="display:block; width:100%; max-width:536px; height:auto; margin:0 0 20px;">`);
      textParts.push(alt ? `[画像: ${alt}]` : `[画像: ${url}]`);
    } else if (raw.type === "divider") {
      htmlParts.push('<div style="height:1px; background:#e4e4e4; margin:24px 0;"></div>');
      textParts.push("----------");
    } else if (raw.type === "button") {
      const label = String(raw.label || "").slice(0, MAX_LABEL_LEN).trim();
      if (!label) continue;
      const url = sanitizeUrl(raw.url);
      htmlParts.push(buttonHtml(label, url));
      textParts.push(`▶ ${label}: ${url}`);
    }
  }

  return { html: htmlParts.join(""), text: textParts.join("\n\n") };
}

/* 黒白ベースのシンプルなメールテンプレート。CSSはすべてインラインで書く
   （メールクライアントのCSS対応差異に耐えるため）。 */
function buildEmailHtml({ heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const cta = ctaLabel && ctaUrl ? buttonHtml(ctaLabel, ctaUrl) : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOKYO FASHION MARKET</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN',-apple-system,BlinkMacSystemFont,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; background:#ffffff;">
          <tr>
            <td style="padding:32px 32px 24px; text-align:center; border-bottom:1px solid #0d0d0d;">
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:20px; letter-spacing:0.06em; color:#0d0d0d; font-weight:700;">TOKYO FASHION MARKET</div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px 8px;">
              <h1 style="margin:0 0 20px; font-size:19px; font-weight:600; color:#0d0d0d; letter-spacing:0.02em;">${escapeHtml(heading)}</h1>
              <div style="font-size:15px; line-height:1.9; color:#3a3a3a;">
                ${bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px; background:#f5f5f5; border-top:1px solid #e4e4e4;">
              <p style="margin:0 0 4px; font-size:12px; color:#757575;">TOKYO FASHION MARKET</p>
              <p style="margin:0; font-size:12px; color:#757575;">${escapeHtml(footerNote || "このメールに心当たりがない場合は破棄してください。")}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * @param {object} params
 * @param {string|string[]} params.to      宛先。カンマ区切りの文字列も複数宛先として扱う
 * @param {string} params.subject
 * @param {string} [params.text]           プレーンテキスト本文（blocksを渡さない場合）
 * @param {string} [params.ctaLabel]
 * @param {string} [params.ctaUrl]
 * @param {Array}  [params.blocks]         /console 配信エディタのブロック配列。指定時は text/ctaLabel/ctaUrl より優先
 * @param {string} [params.footerNote]
 * @param {string} [params.replyTo]
 * @param {string} [params.from]           送信元を差し替えたいときに指定（未指定なら RESEND_FROM_EMAIL）
 */
async function sendEmail({ to, subject, text, ctaLabel, ctaUrl, blocks, footerNote, replyTo, from: fromOverride }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromOverride || process.env.RESEND_FROM_EMAIL;
  const sendEnabled = process.env.RESEND_SEND_ENABLED === "true";

  if (!apiKey || !from) {
    console.error("mailer: RESEND_API_KEY / RESEND_FROM_EMAIL が未設定のため送信をスキップしました");
    return { skipped: true };
  }
  if (!sendEnabled) {
    console.log("mailer: RESEND_SEND_ENABLED が true ではないため送信をスキップしました。宛先:", to);
    return { skipped: true };
  }
  if (!to) return { skipped: true };

  const toList = Array.isArray(to) ? to : String(to).split(",").map((s) => s.trim()).filter(Boolean);
  if (!toList.length) return { skipped: true };

  let bodyHtml;
  let plainText;
  if (Array.isArray(blocks) && blocks.length) {
    const rendered = renderBlocks(blocks);
    bodyHtml = rendered.html;
    plainText = rendered.text;
  } else {
    bodyHtml = textToHtmlParagraphs(text);
    plainText = text;
  }

  const html = buildEmailHtml({
    heading: subject,
    bodyHtml,
    ctaLabel: Array.isArray(blocks) && blocks.length ? undefined : ctaLabel,
    ctaUrl: Array.isArray(blocks) && blocks.length ? undefined : ctaUrl,
    footerNote,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: toList,
        subject: `【TOKYO FASHION MARKET】${subject}`,
        text: plainText,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) console.error("mailer: Resend API error", await res.text());
    return { skipped: false, ok: res.ok };
  } catch (e) {
    console.error("mailer: email send failed", e);
    return { skipped: false, ok: false };
  }
}

module.exports = { sendEmail, buildEmailHtml, textToHtmlParagraphs, renderBlocks, SITE_URL, INQUIRY_FROM_EMAIL };
