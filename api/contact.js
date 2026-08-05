// ==========================================================
// POST /api/contact
// ---------------------------------------------------------
// トップページ（index.html）のお問い合わせフォーム（#contactForm）の送信先。
// 以前はバックエンド未接続で、フォームは完了メッセージを出すだけで実際には
// 何も送信していなかった（js/main.js の setupContactForm 参照）。
//
// やること:
//   1. 内容を inquiries テーブルに保存する（これが正式な記録。
//      /console の「お問い合わせ」タブから一覧・返信できる）
//   2. 見逃し防止のため、運営の普段のメールアドレス（環境変数 CONTACT_TO_EMAIL）に
//      「届きました」の通知メールを送る（ベストエフォート。RESEND_SEND_ENABLED等が
//      整うまでは静かにスキップされる）
//   3. 問い合わせ者本人に「受け付けました」の自動返信メールを送る（ベストエフォート）
//
// 通知メールにはあえて Reply-To を設定していない。Gmail等で直接返信できてしまうと
// /console での返信と二重に対応してしまう事故が起きるため。
// 返信は必ず /console から行う運用にすることで、どのやり取りが「対応済み」かを
// inquiries.status で一元管理できるようにしている。
//
// 迷惑メール対策:
//   1. honeypot（人には見えない company フィールド）に入力があれば無言で破棄
//   2. 同一IPからの連投を短時間だけブロック（インスタンス内メモリのみの簡易版）
// ==========================================================
const { createClient } = require("@supabase/supabase-js");
const { sendEmail, SITE_URL, INQUIRY_FROM_EMAIL } = require("./_mailer");
const { isRateLimited } = require("./_rateLimit");

const MAX_NAME = 80;
const MAX_EMAIL = 160;
const MAX_MESSAGE = 4000;
const MAX_REASON = 40;

function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  const { category, name, email, message, company } = req.body || {};

  // honeypot: 人間には見えない欄なので、埋まっていたらbot。
  // 相手に対策を教えないよう、エラーではなく成功を装って何もしない。
  if (company) { res.status(200).json({ ok: true }); return; }

  if (isRateLimited("contact", req, { windowMs: 60 * 1000, max: 3 })) {
    res.status(429).json({ error: "送信が集中しています。しばらく時間をおいてから再度お試しください。" });
    return;
  }

  const cleanName = String(name || "").trim().slice(0, MAX_NAME);
  const cleanEmail = String(email || "").trim().slice(0, MAX_EMAIL);
  const cleanMessage = String(message || "").trim().slice(0, MAX_MESSAGE);
  const cleanReason = String(category || "お問い合わせ").trim().slice(0, MAX_REASON) || "お問い合わせ";

  if (!cleanName || !cleanMessage) {
    res.status(400).json({ error: "お名前とお問い合わせ内容をご記入ください" });
    return;
  }
  if (!looksLikeEmail(cleanEmail)) {
    res.status(400).json({ error: "メールアドレスの形式が正しくありません" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("contact: Supabaseの環境変数が未設定です");
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }

  // ---------- 1. inquiries テーブルへ保存（これが正式な記録） ----------
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error: insertErr } = await serviceClient.from("inquiries").insert({
    reason: cleanReason,
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
  });
  if (insertErr) {
    console.error("inquiries insert failed:", insertErr.message);
    res.status(500).json({ error: "送信に失敗しました。時間をおいて再度お試しください。" });
    return;
  }

  // ---------- 2. 運営への通知メール（ベストエフォート） ----------
  const to = process.env.CONTACT_TO_EMAIL;
  if (to) {
    const blocks = [
      { type: "heading", text: `【${cleanReason}】${cleanName} 様よりお問い合わせ`, size: "md" },
      { type: "callout", text: `お名前: ${cleanName}\nメールアドレス: ${cleanEmail}\nご用件: ${cleanReason}` },
      { type: "paragraph", text: cleanMessage },
      { type: "button", label: "コンソールで確認・返信する", url: `${SITE_URL}/console` },
    ];
    try {
      await sendEmail({
        to,
        subject: `お問い合わせ（${cleanReason}）`,
        blocks,
        // 意図的にReply-Toを設定しない。ここに返信しても問い合わせ者には届かない
        footerNote: "このメールに返信しても送信者には届きません。対応は「/console」の「お問い合わせ」から行ってください。",
      });
    } catch (err) {
      console.error("contact notification email failed:", err);
    }
  } else {
    console.warn("contact: CONTACT_TO_EMAIL が未設定のため通知メールは送られません（inquiriesへの保存は成功しています）");
  }

  // ---------- 3. 問い合わせ者本人への自動返信（ベストエフォート） ----------
  try {
    await sendEmail({
      to: cleanEmail,
      subject: `お問い合わせを受け付けました（${cleanReason}）`,
      from: INQUIRY_FROM_EMAIL,
      blocks: [
        { type: "paragraph", text: `${cleanName} 様` },
        { type: "paragraph", text: "このたびはお問い合わせいただき、誠にありがとうございます。以下の内容で受け付けました。追ってご返信させていただきますので、今しばらくお待ちください。" },
        { type: "divider" },
        { type: "callout", text: `ご用件: ${cleanReason}\n\nお問い合わせ内容:\n${cleanMessage}` },
      ],
      replyTo: process.env.CONTACT_TO_EMAIL || undefined,
      footerNote: "このメールは自動送信されています。",
    });
  } catch (err) {
    console.error("contact auto-reply email failed:", err);
  }

  res.status(200).json({ ok: true });
};
