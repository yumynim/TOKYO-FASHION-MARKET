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

  // ---------- ログイン／新規登録モーダル ----------
  // opts.onSuccess(session) はログイン（新規登録含む）に成功した直後に呼ばれる
  openLogin(opts = {}) {
    const onSuccess = opts.onSuccess || (() => {});
    let mode = "login";

    const modal = this.openModal(`
      <h2 class="modal-title">アカウント</h2>
      <button type="button" class="btn btn-outline google-btn" id="googleLogin">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
        Googleでログイン
      </button>
      <p class="modal-divider"><span>または</span></p>
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
        <p class="modal-note is-error-note" id="loginError" hidden></p>
      </form>`);

    modal.querySelectorAll(".login-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        modal.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        mode = tab.dataset.mode;
        modal.querySelector("#loginSubmit").textContent = mode === "signup" ? "登録する" : "ログイン";
      });
    });

    modal.querySelector("#googleLogin").addEventListener("click", async () => {
      const result = await Auth.signInWithGoogle();
      // 設定済みならここで画面がGoogleへ遷移するため、以下は「未設定」の時だけ実行される
      if (result && result.error) {
        const errorEl = modal.querySelector("#loginError");
        errorEl.textContent = "ログイン機能はまだ設定中です。しばらくお待ちください。";
        errorEl.hidden = false;
      }
    });

    modal.querySelector("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      let valid = true;
      form.querySelectorAll("input").forEach((el) => {
        const ok = el.checkValidity();
        el.classList.toggle("is-error", !ok);
        if (!ok) valid = false;
      });
      if (!valid) return;

      const email = modal.querySelector("#lg-email").value.trim();
      const password = modal.querySelector("#lg-pass").value;
      const errorEl = modal.querySelector("#loginError");
      const submitBtn = modal.querySelector("#loginSubmit");
      errorEl.hidden = true;
      submitBtn.disabled = true;

      try {
        const result =
          mode === "signup"
            ? await Auth.signUpWithEmail(email, password)
            : await Auth.signInWithEmail(email, password);

        if (result.error) throw result.error;

        if (mode === "signup" && result.data && !result.data.session) {
          // メール確認が必須の設定になっている場合
          modal.innerHTML = `
            <button type="button" class="modal-close" aria-label="閉じる">✕</button>
            <p class="modal-done">確認メールを送信しました。メール内のリンクから登録を完了してください。</p>`;
          modal.querySelector(".modal-close").addEventListener("click", () => UI.closeModal());
          return;
        }

        UI.closeModal();
        Auth.refreshHeaderUI();
        onSuccess(result.data.session);
      } catch (err) {
        errorEl.textContent = Auth.translateError(err);
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
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
  // ログインボタン（layout.jsが注入済み）: ログイン済みならマイページへ直接移動、未ログインならログイン画面
  // （以前はアカウントメニューを一度開いてからマイページへ、という二段階だったが、
  // 「マイページの場所が分かりにくい」という声を受けて一段階で行けるようにした）
  const loginBtn = document.querySelector(".btn-login");
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const user = await Auth.getUser();
      if (user) window.location.href = "members.html";
      else UI.openLogin();
    });
  }

  UI.setupToTop();
  // 描画系スクリプト（main.js / pages.js）の後に登録されるよう遅延
  setTimeout(() => UI.setupReveal(), 0);
});
