// ==========================================================
// サブページ別の初期化処理
// <body data-page="..."> の値で振り分け（CSP対応のため外部ファイル化）
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  const init = PAGE_INITS[page];
  if (init) init();
});

const PAGE_INITS = {
  // ---------- グッズ販売【郵送】 ----------
  goods() {
    const grid = document.getElementById("goodsGridAll");
    if (!grid) return;
    grid.innerHTML = GOODS.map(
      (g, i) => `
      <article class="goods-card is-visible" data-index="${i}">
        <div class="goods-visual" role="button" tabindex="0" aria-label="${g.name}の詳細を見る"><span>${String.fromCharCode(65 + (i % 26))}</span></div>
        <div class="goods-body">
          <h3 class="goods-name">${g.name}</h3>
          <p class="goods-price-label">価格</p>
          <p class="goods-price">￥${g.price.toLocaleString("ja-JP")} <span class="goods-tax">税込</span></p>
          <button type="button" class="goods-add" data-index="${i}">カートに追加</button>
        </div>
      </article>`
    ).join("");

    grid.querySelectorAll(".goods-add").forEach((btn) =>
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.index);
        Store.add({ id: "goods-" + i, name: GOODS[i].name, price: GOODS[i].price });
        Store.openDrawer();
      })
    );
    grid.querySelectorAll(".goods-visual").forEach((v) => {
      const open = () => Store.openProduct(Number(v.closest(".goods-card").dataset.index));
      v.addEventListener("click", open);
      v.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  },

  // ---------- 企業理念（hagi） ----------
  hagi() {
    // メンバー（ダミー名）
    const MEMBERS = [
      { role: "代表取締役", name: "山田 花子" },
      { role: "役員", name: "佐藤 あかり" },
      { role: "メンバー", name: "鈴木 亜美" },
      { role: "メンバー", name: "田中 瀬里" },
      { role: "メンバー", name: "高橋 結" },
      { role: "メンバー", name: "伊藤 葵" },
      { role: "メンバー", name: "渡辺 奈那" },
      { role: "メンバー", name: "中村 葉奈" },
    ];
    const memberGrid = document.getElementById("memberGrid");
    if (memberGrid) {
      memberGrid.innerHTML = MEMBERS.map(
        (m, i) => `
        <div class="member-card">
          <div class="member-photo">${String.fromCharCode(65 + i)}</div>
          <p class="m-role">${m.role}</p>
          <p class="m-name">${m.name}</p>
        </div>`
      ).join("");
    }
    const sponsorGrid = document.getElementById("sponsorGrid");
    if (sponsorGrid) {
      sponsorGrid.innerHTML = SPONSORS.map((s) => `<div class="sponsor-cell">${s}</div>`).join("");
    }
    setupDemoForm("pressForm", "pressDone");
  },

  // ---------- ニュース（カテゴリフィルタ × ページネーション） ----------
  news() {
    const list = document.getElementById("newsList");
    if (!list) return;
    const tabs = document.querySelectorAll(".news-tab");
    const pagination = document.getElementById("pagination");
    const PER_PAGE = 6;
    let currentCat = "すべて";
    let currentPage = 1;

    function filtered() {
      return NEWS_ARTICLES.filter((a) => currentCat === "すべて" || a.cat === currentCat);
    }

    function render() {
      const items = filtered();
      const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
      currentPage = Math.min(currentPage, pages);
      const slice = items.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

      list.innerHTML = slice.length
        ? slice.map((a) => `
          <li class="news-item">
            <time>${a.date}</time>
            <span class="news-tag">${a.cat}</span>
            <a href="#">${a.title}</a>
          </li>`).join("")
        : '<li class="news-item"><span>該当する記事はありません。</span></li>';

      pagination.innerHTML = Array.from({ length: pages }, (_, i) =>
        `<button type="button" ${i + 1 === currentPage ? 'class="is-active"' : ""} data-page="${i + 1}">${i + 1}</button>`
      ).join("");
      pagination.hidden = pages <= 1;

      pagination.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          currentPage = Number(b.dataset.page);
          render();
          list.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      );
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        currentCat = tab.dataset.cat;
        currentPage = 1;
        render();
      });
    });

    render();
  },

  // ---------- 過去のイベント ----------
  event() {
    const rows = document.getElementById("eventRows");
    if (!rows) return;
    rows.innerHTML = PAST_EVENTS.map(
      (ev, i) => `
      <div class="event-row">
        <div class="event-row-date">
          <div class="d">${ev.d}</div>
          <div class="w">${ev.w}</div>
        </div>
        <div class="event-row-body">
          <h3>${ev.name}</h3>
          <p class="venue">${ev.venue}</p>
          <p class="time">${ev.time}</p>
        </div>
        <button type="button" class="btn btn-outline event-toggle" data-index="${i}" aria-expanded="false">詳細</button>
        <div class="event-detail" id="eventDetail${i}">
          <div class="event-detail-inner">
            <p>${EVENT_DESC}</p>
            <p class="addr">📍 ${ev.venue}｜${ev.addr}</p>
            <p class="addr">🕐 ${ev.time}</p>
          </div>
        </div>
      </div>`
    ).join("");

    rows.querySelectorAll(".event-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const detail = document.getElementById("eventDetail" + btn.dataset.index);
        const isOpen = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!isOpen));
        btn.textContent = isOpen ? "詳細" : "閉じる";
        detail.style.maxHeight = isOpen ? "0" : detail.scrollHeight + "px";
      });
    });
  },

  // ---------- フォームのみのページ ----------
  oubo() { setupDemoForm("applyForm", "applyDone"); },
  volunteer() { setupDemoForm("volForm", "volDone"); },
  sponsorship() { setupDemoForm("sponsorForm", "sponsorDone"); },
  casting() { setupDemoForm("castingForm", "castingDone"); },
  sample() { setupDemoForm("sampleForm", "sampleDone"); },

  // ---------- ログイン限定ページ（Members） ----------
  members() {
    const btn = document.getElementById("membersLoginBtn");
    if (btn) btn.addEventListener("click", () => UI.openLogin());
  },
};
