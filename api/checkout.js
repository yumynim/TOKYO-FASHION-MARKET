// ==========================================================
// POST /api/checkout
//
// カート（またはチケット1件）の内容を受け取り、
//   1. Supabaseのアクセストークンでログイン状態をサーバー側で再検証
//   2. 金額は必ずサーバー側カタログ（_catalog.js）から取得（クライアントの金額は無視）
//   3. Squareの決済リンク（Payment Link）を作成
//   4. { url } を返す → フロントはそのURLへ window.location.href で遷移
//
// 加えて、注文確認メール・購入完了ページでの状態表示のために、
// 決済リンク作成時点で Supabase の orders テーブルに status='pending' の行を作成する
// （supabase/schema.sql を参照）。実際にメールを送るのは api/webhooks/square.js。
//
// 必要な環境変数（Vercel Project Settings → Environment Variables）:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← 絶対に公開しない
//   SQUARE_ACCESS_TOKEN         ← 絶対に公開しない
//   SQUARE_LOCATION_ID
//   SQUARE_ENVIRONMENT          ← "sandbox" または "production"
//   SITE_URL                    ← 例: https://tokyofashionmarket.com
// ==========================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { GOODS, EVENTS } = require("./_catalog");

const MAX_QTY_PER_LINE = 30; // お一人様の購入上限（サイトのFAQ表記に合わせる）
// Square API のバージョン。意図的に固定し、更新する時だけ手動で変更する運用にしています。
const SQUARE_VERSION = "2024-01-18";

// 購入者が問い合わせ時に口頭/メールで伝えやすい短い識別番号（内部的にはordersのUUIDが正）。
// 例: TFM-20260802-A1B2。日付＋4桁のランダム英数字で、この規模なら衝突はほぼ起こらない
// （万一UNIQUE制約に引っかかっても、呼び出し側でリトライする）。
function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(4).toString("hex").slice(0, 4).toUpperCase();
  return `TFM-${date}-${rand}`;
}

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
  const orderLineItems = []; // orders テーブル保存・確認メール表示用（数量は数値、金額は行合計）

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
    orderLineItems.push({ name: ev.name + "（チケット）", quantity: qty, amount: ev.price * qty, type: "ticket" });
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
      orderLineItems.push({ name: product.name, quantity: qty, amount: product.price * qty, type: "goods" });
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

  const amountTotal = orderLineItems.reduce((n, i) => n + i.amount, 0);

  // ---------- 3. 注文レコードを先に作成（Webhook到達時の突合・メール送信に使う） ----------
  // order_numberはUNIQUE制約があるため、万一の衝突時は1回だけ番号を振り直して再試行する。
  let orderRow;
  let orderInsertError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: user.id,
        buyer_email: user.email || null,
        line_items: orderLineItems,
        amount_total: amountTotal,
        status: "pending",
        order_number: generateOrderNumber(),
      })
      .select()
      .single();
    orderRow = result.data;
    orderInsertError = result.error;
    if (orderRow || orderInsertError?.code !== "23505") break; // 23505 = unique_violation以外は再試行しない
  }

  if (orderInsertError || !orderRow) {
    console.error("checkout: orders テーブルへの作成に失敗しました", orderInsertError);
    res.status(500).json({ error: "注文の作成に失敗しました。時間をおいて再度お試しください。" });
    return;
  }

  // ---------- 4. Squareの決済リンクを作成 ----------
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
          // ?order=<orders.id> で購入完了ページが該当注文のステータスを問い合わせる
          redirect_url: `${process.env.SITE_URL || ""}/checkout-complete.html?order=${orderRow.id}`,
        },
        pre_populated_data: user.email ? { buyer_email: user.email } : undefined,
      }),
    });

    const squareData = await squareRes.json();

    if (!squareRes.ok) {
      console.error("Square API error:", JSON.stringify(squareData));
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderRow.id);
      res.status(502).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
      return;
    }

    const url = squareData.payment_link && squareData.payment_link.url;
    const squareOrderId = squareData.payment_link && squareData.payment_link.order_id;
    if (!url || !squareOrderId) {
      console.error("Square API: payment_link.url / order_id がレスポンスにありません", JSON.stringify(squareData));
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderRow.id);
      res.status(502).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
      return;
    }

    // Webhook到達時に square_order_id で突合できるように保存
    const { error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ square_order_id: squareOrderId })
      .eq("id", orderRow.id);
    if (linkError) {
      // ここが失敗すると webhook 側で突合できず注文が「支払い済み未検知」のままになりうる。
      // 決済自体は継続させ、ログに残して手動対応できるようにする。
      console.error("checkout: square_order_id の保存に失敗しました", linkError, "orderId:", orderRow.id, "squareOrderId:", squareOrderId);
    }

    res.status(200).json({ url });
  } catch (err) {
    console.error("checkout: 予期しないエラー", err);
    await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderRow.id);
    res.status(500).json({ error: "決済ページの作成に失敗しました。時間をおいて再度お試しください。" });
  }
};
