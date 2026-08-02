// ==========================================================
// POST /api/admin-preview-email
// ---------------------------------------------------------
// /console の配信エディタが、実際に届くメールの見た目をリアルタイムプレビューするための
// エンドポイント。送信は行わない（renderBlocks + buildEmailHtml でHTMLを組み立てて返すだけ）。
// ==========================================================
const { buildEmailHtml, renderBlocks } = require("./_mailer");
const { verifyAdminToken } = require("./_adminAuth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  const { token, title, blocks } = req.body || {};
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
    return;
  }

  const rendered = renderBlocks(blocks);
  const html = buildEmailHtml({
    heading: (title && String(title).trim()) || "（タイトル未入力）",
    bodyHtml: rendered.html || "<p style=\"color:#757575;\">（本文未入力）</p>",
  });

  res.status(200).json({ html });
};
