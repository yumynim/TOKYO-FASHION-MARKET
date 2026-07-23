// ==========================================================
// POST /api/checkout
//
// カート（またはチケット1件）の内容を受け取り、
//   1. Supabaseのアクセストークンでログイン状態をサーバー側で再検証
//   2. 金額は必ずサーバー側カタログ（_catalog.js）から取得（クライアントの金額は無視）
//   3. Squareの決済リンク（Payment Link）を作成
//   4. { url } を返す → フロントはそのURLへ window.location.href で遷移
//
// 必要な環境変数（Vercel Project Settings → Environment Variables）:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← 絶対に公開しない
//   SQUARE_ACCESS_TOKEN         ← 絶対に公開しない
//   SQUARE_LOCATION_ID
//   SQUARE_ENVIRONMENT          ← "sandbox" または "production"
//   SITE_URL                    ← 例: https://tokyo-fashion-market.vercel.app
// ==========================================================

const { createClient } = require("@supabase/supabase-js");
const { GOODS, EVENTS } = require("./_catalog");

const MAX_QTY_PER_LINE = 30; // お一人様の購入上限（サイトのFAQ表記に合わせる）
// Square API のバージョン。意図的に固定し、更新する時だけ手動で変更する運用にしています。
const SQUARE_VERSION = "2024-01-18";

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "許可されていないメソッドです。" });
    return;
  }

  // ---------- 1. ログイン確認（フロント側のチェックは信用せず、必ずここで再検証） ----------
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("checkout: Supabaseの環境変数が未設定です");
    res.status(500).json({ error: "サーバー側の設定が完了していません。" });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    res.status(401).json({ error: "ログインが必要です。再度ログインしてください。" });
    return;
  }
  const user = userData.user;

  // ---------- 2. 注文内容を検証（価格は必ずサーバー側カタログから取得） ----------
  const body = readJsonBody(req);
  if (!body) {
    res.status(400).json({ error: "不正なリクエストです。" });
    return;
  }

  const lineItems = [];

  if (body.type === "ticket") {
    const ev = EVENTS[body.eventIndex];
    if (!ev) {
      res.status(400).json({ error: "対象のイベントが見つかりません。" });
      return;
    }
    const qty = Math.max(1, Math.min(MAX_QTY_PER_LINE, parseInt(body.qty, 10) || 1));
    lineItems.push({
      name: ev.name + "（チケット）",
      quantity: String(qty),
      base_price_money: { amount: ev.price, currency: "JPY" },
    });
  } else {
    const items = Array.isArray(body.items) ? body.items : [];
    for (const it of items) {
      if (typeof it.id !== "string" || !it.id.startsWith("goods-")) continue;
      const idx = parseInt(it.id.slice("goods-".length), 10);
      const product = GOODS[idx];
      if (!product) continue;
      const qty = Math.max(1, Math.min(MAX_QTY_PER_LINE, parseInt(it.qty, 10) || 1));
      lineItems.push({
        name: product.name,
        quantity: String(qty),
        base_price_money: { amount: product.price, currency: "JPY" },
      });
    }
    if (!lineItems.length) {
      res.status(400).json({ error: "カートが空か、購入できる商品がありません。" });
      return;
    }
  }

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.error("checkout: Squareの環境変数が未設定です");
    res.status(500).json({ error: "現在お支払い機能をご利用いただけません。しばらくお待ちください。" });
    return;
  }

  // ---------- 3. Squareの決済リンクを作成 ----------
  try {
    const squareRes = await fetch(`${squareBaseUrl()}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        idempotency_key: `${user.id}-${Date.now()}`,
        order: {
          location_id: process.env.SQUARE_LOCATION_ID,
          // ここに購入者のSupabaseユーザーIDを残しておくと、
          // Square側の注文とサイト側の会員を後から突き合わせられる
          reference_id: user.id,
          line_items: lineItems,
        },
        checkout_options: {
          redirect_url: `${process.env.SITE_URL || ""}/checkout-complete.html`,
        },
        pre_populated_data: user.email ? { buyer_email: user.email } : undefined,
      }),
    });

    const squareData = await squareRes.json();

    if (!squareRes.ok) {
      console.error("Square API error:", JSON.stringify(squareData));
      res.status(502).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
      return;
    }

    const url = squareData.payment_link && squareData.payment_link.url;
    if (!url) {
      console.error("Square API: payment_link.url がレスポンスにありません", JSON.stringify(squareData));
      res.status(502).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
      return;
    }

    res.status(200).json({ url });
  } catch (err) {
    console.error("checkout: 予期しないエラー", err);
    res.status(500).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
  }
};
