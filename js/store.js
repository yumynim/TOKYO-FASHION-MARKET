// ==========================================================
// ストア機能 — カート / 商品モーダル / チケットモーダル
// 決済はSquareの決済ページ（Payment Link）へ遷移して行う。
// カート内容は localStorage に保存。決済にはログインが必須。
//
// ★ 決済への入口を新設する場合は、必ずこのファイルの checkout()（カート）／
// openTicket()の購入ボタン（チケット）のように、実際に決済に進む前に
// Auth.getSession()が無ければログインを要求する作りにすること。
// 「未ログインのまま決済できてしまう経路を作らない」がこのサイトの恒久ルール。
// ==========================================================

const Store = {
  KEY: "tfm_cart",
  PENDING_KEY: "tfm_pending_checkout", // Googleログインの画面遷移をまたいで決済を再開するためのフラグ
  MAX_QTY: 30, // お一人様の購入上限。api/checkout.js の MAX_QTY_PER_LINE と必ず一致させる

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
    found.qty = Math.min(qty, this.MAX_QTY);
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

  // 未ログインの場合、ボタンを押す前から「ログインが必要」と分かるようにする
  // （チケットの購入モーダルと同じ考え方。購入不可の仕様自体は変えない）
  async updateCheckoutLabel() {
    const btn = document.getElementById("cartCheckout");
    if (!btn) return;
    const user = await Auth.getUser();
    btn.textContent = user ? "ご購入手続きへ" : "ログインしてご購入手続きへ";
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
        <p class="cart-checkout-done" id="cartDone" hidden></p>
      </div>`;
    document.body.appendChild(drawer);

    document.getElementById("cartClose").addEventListener("click", () => this.closeDrawer());
    document.getElementById("cartCheckout").addEventListener("click", () => this.checkout());

    const cartBtn = document.getElementById("cartBtn");
    if (cartBtn) cartBtn.addEventListener("click", () => this.openDrawer());

    this.renderDrawer();
    this.updateBadge();
    this.updateCheckoutLabel();
    Auth.onChange(() => this.updateCheckoutLabel());

    // Googleログインの画面遷移から戻ってきた直後は、続きから決済を再開する
    if (localStorage.getItem(this.PENDING_KEY) === "1") {
      Auth.getSession().then((session) => {
        if (session && this.read().length) {
          this.openDrawer();
          this.checkout();
        } else {
          localStorage.removeItem(this.PENDING_KEY);
        }
      });
    }
  },

  // ---------- ご購入手続き（ログイン確認 → Square決済ページへ） ----------
  async checkout() {
    const items = this.read();
    if (!items.length) return;

    const session = await Auth.getSession();
    if (!session) {
      // 未ログイン: ログイン/新規登録してから、成功時に自動でチェックアウトへ戻る
      localStorage.setItem(this.PENDING_KEY, "1");
      UI.openLogin({ onSuccess: () => this.checkout() });
      return;
    }

    await this._payWithSquare(
      session,
      { type: "cart", items: items.map((i) => ({ id: i.id, qty: i.qty })) },
      { btn: document.getElementById("cartCheckout"), doneEl: document.getElementById("cartDone") }
    );
  },

  // ---------- Square決済リンクを作成してリダイレクト ----------
  // ui: { btn: 押されたボタン要素, doneEl: エラー/完了メッセージを出す要素 }
  async _payWithSquare(session, payload, ui = {}) {
    const { btn, doneEl: done } = ui;
    const original = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "処理中…";
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "決済ページの作成に失敗しました。");

      localStorage.removeItem(this.PENDING_KEY);
      window.location.href = data.url; // Squareの決済ページへ
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
      const message = err.message || "決済ページの作成に失敗しました。時間をおいて再度お試しください。";
      if (done) {
        done.textContent = message;
        done.hidden = false;
      } else {
        alert(message);
      }
    }
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
      <p class="modal-note">※ ご購入手続きにはログインが必要です。</p>`);

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
    const price = ev.price || 1000; // ★ 価格は js/data.js の EVENTS で編集（api/_catalog.js にも同じ値を反映すること）
    let qty = 1;

    const modal = UI.openModal(`
      <h2 class="modal-title">チケット購入</h2>
      <p class="modal-meta">${ev.name}<br>${ev.dateLabel}</p>
      <p class="modal-price">一般入場　￥${price.toLocaleString("ja-JP")} <span class="goods-tax">税込</span></p>
      <div class="qty-row">
        <span class="qty-label">枚数</span>
        <button type="button" class="qty-btn" data-q="dec" aria-label="枚数を減らす">−</button>
        <span class="qty-value" id="tQty">1</span>
        <button type="button" class="qty-btn" data-q="inc" aria-label="枚数を増やす">＋</button>
      </div>
      <p class="modal-meta">合計: <strong id="tTotal">￥${price.toLocaleString("ja-JP")}</strong>（税込）</p>
      <button type="button" class="btn btn-solid" id="tBuy">購入する</button>
      <p class="modal-note" id="ticketError" hidden></p>
      <p class="modal-note" id="ticketLoginNote" hidden>※ ご購入にはログインが必要です</p>
      <p class="modal-note">※ 支払方法: クレジットカード / コンビニ払い / QRコード決済</p>`);

    // 未ログインの場合、押した瞬間に初めてログインを求めるのではなく、
    // ボタンの文言・注意書きで最初からログインが必要なことが分かるようにする
    // （購入できない仕様自体は変えず、分かりやすさだけ改善する）
    const buyBtn = modal.querySelector("#tBuy");
    const loginNote = modal.querySelector("#ticketLoginNote");
    Auth.getUser().then((user) => {
      if (!user) {
        buyBtn.textContent = "ログインして購入する";
        loginNote.hidden = false;
      }
    });

    const qtyEl = modal.querySelector("#tQty");
    const totalEl = modal.querySelector("#tTotal");
    modal.querySelectorAll(".qty-btn").forEach((b) =>
      b.addEventListener("click", () => {
        qty = Math.max(1, Math.min(10, qty + (b.dataset.q === "inc" ? 1 : -1)));
        qtyEl.textContent = qty;
        totalEl.textContent = "￥" + (price * qty).toLocaleString("ja-JP");
      })
    );

    modal.querySelector("#tBuy").addEventListener("click", async () => {
      const session = await Auth.getSession();
      if (!session) {
        // 未ログイン: チケットはページ遷移をまたげないため、ログイン後はカートを開いて案内する
        UI.openLogin({
          onSuccess: () => {
            UI.closeModal();
            this._payTicketAfterLogin(index, qty);
          },
        });
        return;
      }
      this._payWithSquare(
        session,
        { type: "ticket", eventIndex: index, qty },
        { btn: modal.querySelector("#tBuy"), doneEl: modal.querySelector("#ticketError") }
      );
    });
  },

  async _payTicketAfterLogin(index, qty) {
    const session = await Auth.getSession();
    if (session) this._payWithSquare(session, { type: "ticket", eventIndex: index, qty });
  },
};

document.addEventListener("DOMContentLoaded", () => Store.setupDrawer());
