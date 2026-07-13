// ==========================================================
// ストア機能 — カート / 商品モーダル / チケットモーダル
// 決済は行わない。カート内容は localStorage に保存。
// ==========================================================

const Store = {
  KEY: "refa_demo_cart",

  // ---------- カートデータ ----------
  read() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch {
      return [];
    }
  },
  write(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateBadge();
    this.renderDrawer();
  },
  add(item, qty = 1) {
    const items = this.read();
    const found = items.find((i) => i.id === item.id);
    if (found) found.qty += qty;
    else items.push({ ...item, qty });
    this.write(items);
  },
  setQty(id, qty) {
    let items = this.read();
    const found = items.find((i) => i.id === id);
    if (!found) return;
    found.qty = qty;
    if (found.qty <= 0) items = items.filter((i) => i.id !== id);
    this.write(items);
  },
  remove(id) {
    this.write(this.read().filter((i) => i.id !== id));
  },
  count() {
    return this.read().reduce((n, i) => n + i.qty, 0);
  },
  subtotal() {
    return this.read().reduce((n, i) => n + i.price * i.qty, 0);
  },

  // ---------- バッジ ----------
  updateBadge() {
    const badge = document.getElementById("cartCount");
    if (!badge) return;
    const n = this.count();
    badge.textContent = n;
    badge.hidden = n === 0;
  },

  // ---------- ドロワー ----------
  setupDrawer() {
    const drawer = document.createElement("aside");
    drawer.className = "cart-drawer";
    drawer.id = "cartDrawer";
    drawer.setAttribute("aria-label", "カート");
    drawer.innerHTML = `
      <div class="cart-drawer-head">
        <h2>カート</h2>
        <button type="button" class="modal-close" id="cartClose" aria-label="カートを閉じる">✕</button>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-foot">
        <div class="cart-subtotal"><span>小計</span><span id="cartSubtotal">￥0</span></div>
        <p class="cart-tax-note">価格はすべて税込です。別途送料がかかる場合があります。</p>
        <button type="button" class="btn btn-solid" id="cartCheckout">ご購入手続きへ</button>
        <p class="cart-checkout-done" id="cartDone" hidden>オンライン決済は現在準備中です。</p>
      </div>`;
    document.body.appendChild(drawer);

    document.getElementById("cartClose").addEventListener("click", () => this.closeDrawer());
    document.getElementById("cartCheckout").addEventListener("click", () => {
      const done = document.getElementById("cartDone");
      done.hidden = false;
      setTimeout(() => (done.hidden = true), 4000);
    });

    const cartBtn = document.getElementById("cartBtn");
    if (cartBtn) cartBtn.addEventListener("click", () => this.openDrawer());

    this.renderDrawer();
    this.updateBadge();
  },
  openDrawer() {
    this.renderDrawer();
    document.getElementById("cartDrawer").classList.add("is-open");
  },
  closeDrawer() {
    document.getElementById("cartDrawer").classList.remove("is-open");
  },
  renderDrawer() {
    const box = document.getElementById("cartItems");
    if (!box) return;
    const items = this.read();
    if (!items.length) {
      box.innerHTML = '<p class="cart-empty">カートは空です。</p>';
    } else {
      box.innerHTML = items
        .map(
          (i) => `
        <div class="cart-row" data-id="${i.id}">
          <div class="cart-thumb">${i.name.charAt(0)}</div>
          <div class="cart-row-body">
            <p class="cart-row-name">${i.name}</p>
            <p class="cart-row-price">￥${i.price.toLocaleString("ja-JP")}</p>
            <div class="cart-qty">
              <button type="button" data-act="dec" aria-label="数量を減らす">−</button>
              <span>${i.qty}</span>
              <button type="button" data-act="inc" aria-label="数量を増やす">＋</button>
            </div>
          </div>
          <button type="button" class="cart-remove" data-act="remove" aria-label="削除">✕</button>
        </div>`
        )
        .join("");

      box.querySelectorAll("[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.closest(".cart-row").dataset.id;
          const item = this.read().find((i) => i.id === id);
          if (!item) return;
          if (btn.dataset.act === "inc") this.setQty(id, item.qty + 1);
          if (btn.dataset.act === "dec") this.setQty(id, item.qty - 1);
          if (btn.dataset.act === "remove") this.remove(id);
        });
      });
    }
    const subtotal = document.getElementById("cartSubtotal");
    if (subtotal) subtotal.textContent = "￥" + this.subtotal().toLocaleString("ja-JP");
  },

  // ---------- 商品詳細モーダル ----------
  openProduct(index) {
    if (typeof GOODS === "undefined" || !GOODS[index]) return;
    const g = GOODS[index];
    const letter = String.fromCharCode(65 + (index % 26));
    let qty = 1;

    const modal = UI.openModal(`
      <div class="modal-product-visual">${letter}</div>
      <h2 class="modal-title">${g.name}</h2>
      <p class="modal-price">￥${g.price.toLocaleString("ja-JP")} <span class="goods-tax">税込</span></p>
      <p class="modal-meta">郵送でお届けします。</p>
      <div class="qty-row">
        <span class="qty-label">数量</span>
        <button type="button" class="qty-btn" data-q="dec" aria-label="数量を減らす">−</button>
        <span class="qty-value" id="pQty">1</span>
        <button type="button" class="qty-btn" data-q="inc" aria-label="数量を増やす">＋</button>
      </div>
      <button type="button" class="btn btn-solid" id="pAdd">カートに追加</button>
      <p class="modal-note">※ オンライン購入は現在準備中です。</p>`);

    const qtyEl = modal.querySelector("#pQty");
    modal.querySelectorAll(".qty-btn").forEach((b) =>
      b.addEventListener("click", () => {
        qty = Math.max(1, Math.min(10, qty + (b.dataset.q === "inc" ? 1 : -1)));
        qtyEl.textContent = qty;
      })
    );
    modal.querySelector("#pAdd").addEventListener("click", () => {
      this.add({ id: "goods-" + index, name: g.name, price: g.price }, qty);
      UI.closeModal();
      this.openDrawer();
    });
  },

  // ---------- チケット購入モーダル ----------
  openTicket(index) {
    if (typeof EVENTS === "undefined" || !EVENTS[index]) return;
    const ev = EVENTS[index];
    const PRICE = 1000; // 一般入場（ダミー価格）
    let qty = 1;

    const modal = UI.openModal(`
      <h2 class="modal-title">チケット購入</h2>
      <p class="modal-meta">${ev.name}<br>${ev.dateLabel}</p>
      <p class="modal-price">一般入場　￥${PRICE.toLocaleString("ja-JP")} <span class="goods-tax">（ダミー価格）</span></p>
      <div class="qty-row">
        <span class="qty-label">枚数</span>
        <button type="button" class="qty-btn" data-q="dec" aria-label="枚数を減らす">−</button>
        <span class="qty-value" id="tQty">1</span>
        <button type="button" class="qty-btn" data-q="inc" aria-label="枚数を増やす">＋</button>
      </div>
      <p class="modal-meta">合計: <strong id="tTotal">￥${PRICE.toLocaleString("ja-JP")}</strong>（税込）</p>
      <button type="button" class="btn btn-solid" id="tBuy">購入する</button>
      <p class="modal-note">※ 支払方法: クレジットカード / コンビニ払い / QRコード決済<br>※ オンライン購入は現在準備中です。</p>`);

    const qtyEl = modal.querySelector("#tQty");
    const totalEl = modal.querySelector("#tTotal");
    modal.querySelectorAll(".qty-btn").forEach((b) =>
      b.addEventListener("click", () => {
        qty = Math.max(1, Math.min(10, qty + (b.dataset.q === "inc" ? 1 : -1)));
        qtyEl.textContent = qty;
        totalEl.textContent = "￥" + (PRICE * qty).toLocaleString("ja-JP");
      })
    );
    modal.querySelector("#tBuy").addEventListener("click", () => {
      modal.innerHTML = `
        <button type="button" class="modal-close" aria-label="閉じる">✕</button>
        <p class="modal-done">チケットのオンライン販売は現在準備中です。<br>最新情報はInstagramをご確認ください。</p>`;
      modal.querySelector(".modal-close").addEventListener("click", () => UI.closeModal());
    });
  },
};

document.addEventListener("DOMContentLoaded", () => Store.setupDrawer());
