// ==========================================================
// /api/admin-inquiries
// ---------------------------------------------------------
// /console の「お問い合わせ」タブから使う。
//   GET  : 一覧取得（新しい順）
//   POST : 1件に返信する
//            → api/_mailer.js 経由で問い合わせ者本人にメール送信
//            → 送信できたら inquiries.status を 'replied' に更新し、
//              返信内容・日時を記録する
//
// 認証はお知らせ投稿と同じ、共通パスワード方式（api/_adminAuth.js）。
// ==========================================================
const { createClient } = require("@supabase/supabase-js");
const { sendEmail, INQUIRY_FROM_EMAIL } = require("./_mailer");
const { verifyAdminToken } = require("./_adminAuth");

const MAX_REPLY_LEN = 4000;

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  // GETのトークンはヘッダーのみで受け取る（URLの ?token= はアクセスログに残るため受け付けない）
  const token = req.method === "GET" ? req.headers["x-admin-token"] : (req.body || {}).token;
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data, error } = await serviceClient
      .from("inquiries")
      .select("id, reason, name, email, message, status, reply_body, replied_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { res.status(500).json({ error: "読み込みに失敗しました" }); return; }
    res.status(200).json({ inquiries: data || [] });
    return;
  }

  // ---------- POST: 返信 ----------
  const { id, replyBody } = req.body || {};
  const cleanReply = String(replyBody || "").trim().slice(0, MAX_REPLY_LEN);
  if (!id || !cleanReply) {
    res.status(400).json({ error: "返信内容を入力してください" });
    return;
  }

  const { data: inquiry, error: fetchErr } = await serviceClient
    .from("inquiries")
    .select("id, reason, name, email")
    .eq("id", id)
    .single();
  if (fetchErr || !inquiry) {
    res.status(404).json({ error: "対象のお問い合わせが見つかりませんでした" });
    return;
  }

  try {
    await sendEmail({
      to: inquiry.email,
      subject: `お問い合わせへの返信（${inquiry.reason}）`,
      from: INQUIRY_FROM_EMAIL,
      blocks: [
        { type: "paragraph", text: `${inquiry.name} 様` },
        { type: "paragraph", text: cleanReply },
      ],
      // 返信の返信が来た場合は CONTACT_TO_EMAIL（運営の普段のメール）に届くようにする
      replyTo: process.env.CONTACT_TO_EMAIL || undefined,
      footerNote: "TOKYO FASHION MARKET へのお問い合わせにご返信いたしました。",
    });
  } catch (err) {
    console.error("inquiry reply email failed:", err);
    res.status(500).json({ error: "返信メールの送信に失敗しました" });
    return;
  }

  const { error: updateErr } = await serviceClient
    .from("inquiries")
    .update({ status: "replied", reply_body: cleanReply, replied_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) console.error("inquiries update failed:", updateErr.message);

  res.status(200).json({ ok: true });
};
