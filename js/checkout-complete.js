// ==========================================================
// 購入完了ページ
//
// Squareの決済完了直後はまだ Webhook（api/webhooks/square.js）が
// 届いていない可能性があるため、/api/order-status を数回ポーリングして
// 実際に支払いが確認できてから内容を表示する（先に「完了」と決め打ちしない）。
// ==========================================================

localStorage.removeItem("tfm_cart");
localStorage.removeItem("tfm_pending_checkout");

const ORDER_POLL_MAX_TRIES = 10;
const ORDER_POLL_INTERVAL_MS = 2000;

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderPaid(box, data) {
  const items = Array.isArray(data.lineItems) ? data.lineItems : [];
  const rows = items
    .map((i) => `<li>${escHtml(i.name)} × ${i.quantity} … ￥${Number(i.amount).toLocaleString("ja-JP")}</li>`)
    .join("");
  box.innerHTML = `
    <p class="section-lead">お支払いが確認できました。ご購入内容の確認メールをお送りしております。届いていない場合は迷惑メールフォルダもご確認ください。</p>
    ${data.orderNumber ? `<p class="order-number">ご注文番号: <strong>${escHtml(data.orderNumber)}</strong>（お問い合わせの際にお伝えください）</p>` : ""}
    <ul class="order-summary">${rows}</ul>
    <p class="order-total">合計　￥${Number(data.amountTotal || 0).toLocaleString("ja-JP")}（税込）</p>
    ${renderEntryCodes(data.entryCodes)}`;
}

// 受付コードは1人1コード（まとめ買いなら人数分）。QR付きの完全版は確認メールと
// マイページの通知に入っているため、ここではコードの文字列と案内だけを表示する。
function renderEntryCodes(codes) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
  if (!list.length) return "";
  const note =
    list.length > 1
      ? "コードはお一人につき1つ・1回のみ有効です。ご同行者にはそれぞれのコード（QR）をお渡しください。QRコードは確認メールとマイページでご確認いただけます。"
      : "当日、受付でQRコード（確認メール・マイページに記載）をご提示いただくか、コードをスタッフにお伝えください。";
  return `<p class="entry-code">当日の受付コード<br>${list
    .map((c, i) => `${list.length > 1 ? `${i + 1}人目： ` : ""}<strong>${escHtml(c)}</strong>`)
    .join("<br>")}<br><span>${note}</span></p>`;
}

function renderFailed(box) {
  box.innerHTML =
    '<p class="section-lead">決済の作成中にエラーが発生した可能性があります。カードの明細等をご確認いただき、お支払いが発生している場合はお手数ですがお問い合わせください。</p>';
}

function renderStillPending(box) {
  box.innerHTML =
    '<p class="section-lead">お支払いの確認に少しお時間がかかっています。決済が完了していれば確認メールをお送りします。しばらくしても届かない場合はお問い合わせください。</p>';
}

function renderNoOrder(box) {
  box.innerHTML = '<p class="section-lead">ご購入内容は確認メールをご確認ください。</p>';
}

async function pollOrderStatus(orderId, box) {
  for (let i = 0; i < ORDER_POLL_MAX_TRIES; i++) {
    try {
      const res = await fetch(`/api/order-status?order=${encodeURIComponent(orderId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "paid") {
          renderPaid(box, data);
          return;
        }
        if (data.status === "failed") {
          renderFailed(box);
          return;
        }
        // status === "pending": 次のポーリングまで待つ
      }
    } catch {
      // ネットワーク瞬断等は無視して次のポーリングへ
    }
    await new Promise((r) => setTimeout(r, ORDER_POLL_INTERVAL_MS));
  }
  renderStillPending(box);
}

document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("orderResult");
  if (!box) return;

  const orderId = new URLSearchParams(window.location.search).get("order");
  if (!orderId) {
    renderNoOrder(box);
    return;
  }
  pollOrderStatus(orderId, box);
});
