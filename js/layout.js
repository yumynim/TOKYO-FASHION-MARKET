// ==========================================================
// 共通レイアウト（ヘッダー / フッター）を全ページに注入
// ==========================================================

// ★ メニュー項目はここを編集（label: 表示名 / href: リンク先ファイル）
// 元サイトと同じ並び。項目を増やす場合は行をコピーして追記
const NAV_ITEMS = [
  { href: "index.html", label: "ホーム" },
  { href: "goods.html", label: "グッズ販売【郵送】" },
  { href: "hagi.html", label: "コンセプト" },
  { href: "event.html", label: "イベント" },
  { href: "news.html", label: "ニュース" },
  { href: "tokushoho.html", label: "特定商取引" },
  { href: "volunteer.html", label: "ボランティアスタッフ" },
  // authOnly: ログイン中の人にだけ表示する（js/auth.js の refreshHeaderUI が出し分け）
  { href: "members.html", label: "マイページ", authOnly: true },
];

// 「その他」ドロップダウンは一旦廃止（2026-07-29）。
// sponsorship.html / recruit.html / oubo-form.html / sdgs.html / influencer-casting.html /
// sample-sale.html / members.html はページ自体は残っているが、ナビからは外している
// （必要になったらこの配列を復活させて `renderHeader()` 側のコメントアウトも戻す）

function currentPage() {
  const p = location.pathname.split("/").pop();
  return p === "" ? "index.html" : p;
}

function renderHeader() {
  const cur = currentPage();
  // authOnly の項目は最初は hidden で描画し、ログイン確認後に js/auth.js が表示する
  // （未ログインの人のナビには出さない。チラッと見えてから消える形にもしない）
  const li = (item) =>
    `<li${item.authOnly ? " data-nav-auth-only hidden" : ""}><a href="${item.href}" ${item.href === cur ? 'class="is-active"' : ""}>${item.label}</a></li>`;

  return `
  <div class="header-inner">
    <a class="brand" href="index.html" aria-label="TOKYO FASHION MARKET ホーム">
      <img class="brand-logo-img" src="img/tfm-logo.png" alt="TOKYO FASHION MARKET" width="1070" height="274">
    </a>
    <nav class="global-nav" id="globalNav" aria-label="メインメニュー">
      <ul>
        ${NAV_ITEMS.map(li).join("")}
      </ul>
    </nav>
    <div class="header-actions">
      <button type="button" class="btn btn-outline btn-login">ログイン</button>
      <div class="notif-wrap" id="notifWrap" hidden>
        <button type="button" class="icon-btn" id="notifBtn" aria-label="通知を開く" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c0.5-0.5 2-2 2-6Z"/>
            <path d="M10 20a2 2 0 0 0 4 0"/>
          </svg>
          <span class="notif-count" id="notifCount" hidden>0</span>
        </button>
        <div class="notif-panel" id="notifPanel"></div>
      </div>
      <button type="button" class="icon-btn" id="cartBtn" aria-label="カートを開く">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M6 7h12l-1.2 11a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/>
          <path d="M9 9V6a3 3 0 0 1 6 0v3"/>
        </svg>
        <span class="cart-count" id="cartCount" hidden>0</span>
      </button>
      <button type="button" class="nav-toggle" id="navToggle" aria-label="メニューを開く" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>`;
}

function renderFooter() {
  return `
  <div class="container footer-grid">
    <div class="footer-brand">
      <p class="footer-logo">TOKYO FASHION MARKET</p>
      <p class="footer-copy-lead">ファッションインフルエンサーが集う、東京のPOPUP・フリーマーケット</p>
      <div class="footer-social">
        <a href="https://www.instagram.com/tokyo_fashion_market/" target="_blank" rel="noopener" aria-label="Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor"/>
          </svg>
        </a>
      </div>
    </div>
    <nav class="footer-nav" aria-label="フッターメニュー">
      <div>
        <h3>チケット</h3>
        <ul>
          <li><a href="event.html">チケット購入・開催予定はこちら</a></li>
          <li><a href="goods.html">グッズ販売【郵送】</a></li>
          <li><a href="news.html">ニュース</a></li>
        </ul>
      </div>
      <div>
        <h3>会社情報</h3>
        <ul>
          <li><a href="hagi.html">コンセプト・取材/メディア掲載はこちら</a></li>
          <li><a href="recruit.html">採用情報</a></li>
          <li><a href="tokushoho.html">特定商取引法に基づく表示</a></li>
        </ul>
      </div>
    </nav>
  </div>
  <p class="copyright">Copyright © TOKYO FASHION MARKET</p>`;
}

// 注入
document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const footer = document.querySelector(".site-footer");
  if (header && !header.innerHTML.trim()) header.innerHTML = renderHeader();
  if (footer && !footer.innerHTML.trim()) footer.innerHTML = renderFooter();

  // アナウンスバー（全ページ最上部の告知帯）。文言・ON/OFFは js/data.js の ANNOUNCE で編集。
  // data.js を読み込まないページ（購入完了・管理コンソール等）では何もしない
  if (header && typeof ANNOUNCE !== "undefined" && ANNOUNCE.enabled && ANNOUNCE.text) {
    const bar = document.createElement("div");
    bar.className = "announce-bar";
    if (ANNOUNCE.href) {
      const a = document.createElement("a");
      a.href = ANNOUNCE.href;
      a.textContent = ANNOUNCE.text;
      bar.appendChild(a);
    } else {
      bar.textContent = ANNOUNCE.text;
    }
    header.parentNode.insertBefore(bar, header);
  }

  // スキップリンク（アクセシビリティ）
  const main = document.querySelector("main");
  if (main && !document.querySelector(".skip-link")) {
    main.id = main.id || "main-content";
    const skip = document.createElement("a");
    skip.className = "skip-link";
    skip.href = "#" + main.id;
    skip.textContent = "本文へスキップ";
    document.body.prepend(skip);
  }

  setupNavCommon();
});

function setupNavCommon() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("globalNav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  document.querySelectorAll(".sub-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const li = btn.closest(".has-sub");
      const isOpen = li.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(isOpen));
    });
  });
}

// 汎用: デモフォーム（送信処理なし・完了メッセージのみ）
function setupDemoForm(formId, doneId) {
  const form = document.getElementById(formId);
  const done = document.getElementById(doneId);
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll("input, textarea, select").forEach((el) => {
      const ok = el.checkValidity();
      el.classList.toggle("is-error", !ok);
      if (!ok) valid = false;
    });
    if (!valid) return;
    form.reset();
    if (done) {
      done.hidden = false;
      done.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}
