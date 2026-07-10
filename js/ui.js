// ==========================================================
// UI基盤 — モーダル / ログイン / スクロールリビール / トップへ戻る
// ==========================================================

const UI = {
  // ---------- 汎用モーダル ----------
  openModal(innerHTML) {
    this.closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" aria-label="閉じる">✕</button>
        ${innerHTML}
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeModal();
    });
    overlay.querySelector(".modal-close").addEventListener("click", () => this.closeModal());
    this._escHandler = (e) => { if (e.key === "Escape") this.closeModal(); };
    document.addEventListener("keydown", this._escHandler);

    const firstInput = overlay.querySelector("input, select, textarea, button:not(.modal-close)");
    if (firstInput) firstInput.focus();
    return overlay.querySelector(".modal");
  },

  closeModal() {
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
    document.body.style.overflow = "";
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
  },

  // ---------- ログインモーダル ----------
  openLogin() {
    const modal = this.openModal(`
      <h2 class="modal-title">アカウント</h2>
      <div class="login-tabs">
        <button type="button" class="login-tab is-active" data-mode="login">ログイン</button>
        <button type="button" class="login-tab" data-mode="signup">新規登録</button>
      </div>
      <form id="loginForm" novalidate>
        <div class="form-row">
          <label for="lg-email">メールアドレス</label>
          <input type="email" id="lg-email" required autocomplete="email">
        </div>
        <div class="form-row">
          <label for="lg-pass">パスワード</label>
          <input type="password" id="lg-pass" required minlength="6" autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-solid" id="loginSubmit">ログイン</button>
        <p class="modal-note">※ ログイン機能は現在準備中です。</p>
      </form>`);

    modal.querySelectorAll(".login-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        modal.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        modal.querySelector("#loginSubmit").textContent =
          tab.dataset.mode === "signup" ? "登録する" : "ログイン";
      });
    });

    modal.querySelector("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      let valid = true;
      form.querySelectorAll("input").forEach((el) => {
        const ok = el.checkValidity();
        el.classList.toggle("is-error", !ok);
        if (!ok) valid = false;
      });
      if (!valid) return;
      modal.innerHTML = `
        <button type="button" class="modal-close" aria-label="閉じる">✕</button>
        <p class="modal-done">ログイン機能は現在準備中です。今しばらくお待ちください。</p>`;
      modal.querySelector(".modal-close").addEventListener("click", () => UI.closeModal());
    });
  },

  // ---------- スクロールリビール ----------
  setupReveal() {
    const targets = document.querySelectorAll(
      ".section-title, .event-card, .goods-card, .news-item, .point-item, .stat-cell, .mvv-item, .ph, .member-card, .sdgs-num-cell, .step-item, .tile-link, .ig-tile"
    );
    if (!targets.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-revealed");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" }
    );

    targets.forEach((el) => {
      el.classList.add("will-reveal");
      io.observe(el);
    });
    this._revealObserver = io;
  },

  // 動的に増えた要素にも適用
  refreshReveal() {
    if (!this._revealObserver) return;
    document
      .querySelectorAll(".event-card:not(.will-reveal), .goods-card:not(.will-reveal), .news-item:not(.will-reveal), .member-card:not(.will-reveal)")
      .forEach((el) => {
        el.classList.add("will-reveal");
        this._revealObserver.observe(el);
      });
  },

  // ---------- トップへ戻る ----------
  setupToTop() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "to-top";
    btn.setAttribute("aria-label", "ページの先頭へ戻る");
    btn.textContent = "↑";
    document.body.appendChild(btn);

    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener(
      "scroll",
      () => btn.classList.toggle("is-visible", window.scrollY > 600),
      { passive: true }
    );
  },
};

document.addEventListener("DOMContentLoaded", () => {
  // ログインボタン（layout.jsが注入済み）
  const loginBtn = document.querySelector(".btn-login");
  if (loginBtn) loginBtn.addEventListener("click", () => UI.openLogin());

  UI.setupToTop();
  // 描画系スクリプト（main.js / pages.js）の後に登録されるよう遅延
  setTimeout(() => UI.setupReveal(), 0);
});
