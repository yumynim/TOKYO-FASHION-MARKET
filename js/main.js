// ==========================================================
// TOKYO FASHION MARKET — main.js
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  renderEvents();
  renderGoods();
  renderNewsPreview();
  renderInfluencers();
  renderSponsors();
  renderFaqs();
  setupContactForm();
});

// ---------- ユーティリティ ----------
function daysUntil(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function yen(n) {
  return "￥" + n.toLocaleString("ja-JP");
}

// ---------- チケット購入（イベントカード） ----------
function renderEvents() {
  const grid = document.getElementById("eventGrid");
  if (!grid) return;

  grid.innerHTML = EVENTS.map((ev, i) => {
    return `
      <article class="event-card">
        <a class="event-visual" href="event-detail.html?i=${i}" aria-label="${ev.name}の詳細を見る">
          <span class="ph-label">EVENT</span>
        </a>
        <div class="event-body">
          <h3 class="event-name"><a href="event-detail.html?i=${i}">${ev.name}</a></h3>
          <p class="event-date">${ev.dateLabel}</p>
          <div class="event-actions">
            <a class="btn btn-solid" href="event-detail.html?i=${i}">詳細・チケット購入</a>
          </div>
        </div>
      </article>`;
  }).join("");
}

// ---------- グッズ購入（商品グリッド + もっと見る） ----------
const GOODS_PAGE_SIZE = 8;
let goodsShown = 0;

function renderGoods() {
  const grid = document.getElementById("goodsGrid");
  if (!grid) return;

  grid.innerHTML = GOODS.map(
    (g, i) => `
      <article class="goods-card" data-index="${i}">
        <div class="goods-visual" role="button" tabindex="0" aria-label="${g.name}の詳細を見る"><span>${String.fromCharCode(65 + (i % 26))}</span></div>
        <div class="goods-body">
          <h3 class="goods-name">${g.name}</h3>
          <p class="goods-price-label">価格</p>
          <p class="goods-price">${yen(g.price)} <span class="goods-tax">税込</span></p>
          ${g.quickAdd === false ? "" : `<button type="button" class="goods-add" data-index="${i}">カートに追加</button>`}
        </div>
      </article>`
  ).join("");

  bindGoodsActions(grid);
  showMoreGoods();

  const moreBtn = document.getElementById("goodsMore");
  if (moreBtn) moreBtn.addEventListener("click", showMoreGoods);

  // PCカルーセルの矢印（横スクロール）
  const prev = document.getElementById("goodsPrev");
  const next = document.getElementById("goodsNext");
  const scrollByCards = (dir) => {
    const card = grid.querySelector(".goods-card");
    const step = card ? (card.getBoundingClientRect().width + 20) * 2 : 400;
    grid.scrollBy({ left: dir * step, behavior: "smooth" });
  };
  if (prev) prev.addEventListener("click", () => scrollByCards(-1));
  if (next) next.addEventListener("click", () => scrollByCards(1));
}

// 商品カードの操作（カート追加・詳細モーダル）を紐づけ
function bindGoodsActions(grid) {
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
}

function showMoreGoods() {
  const cards = document.querySelectorAll(".goods-card");
  const next = Math.min(goodsShown + GOODS_PAGE_SIZE, cards.length);
  for (let i = goodsShown; i < next; i++) cards[i].classList.add("is-visible");
  goodsShown = next;

  const moreBtn = document.getElementById("goodsMore");
  if (moreBtn && goodsShown >= cards.length) moreBtn.hidden = true;
}

// ---------- NEWS（トップの上位3件・アコーディオン） ----------
function renderNewsPreview() {
  const list = document.getElementById("newsListHome");
  if (!list) return;

  list.innerHTML = NEWS_ARTICLES.slice(0, 3)
    .map(
      (a, i) => `
      <li class="news-item">
        <time>${a.date}</time>
        <span class="news-tag">${a.cat}</span>
        <button type="button" class="news-title" data-index="${i}" aria-expanded="false">${a.title}</button>
        <div class="news-detail" id="newsHomeDetail${i}">
          <div class="news-detail-inner">${a.body || "詳細は準備中です。"}</div>
        </div>
      </li>`
    )
    .join("");

  bindNewsAccordion(list, "newsHomeDetail");
}

// news.html / index.html 共通: 記事タイトルをクリックすると詳細を開閉する
function bindNewsAccordion(list, idPrefix) {
  list.querySelectorAll(".news-title").forEach((btn) => {
    btn.addEventListener("click", () => {
      const detail = document.getElementById(idPrefix + btn.dataset.index);
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!isOpen));
      detail.style.maxHeight = isOpen ? "0" : detail.scrollHeight + "px";
    });
  });
}

// ---------- 過去出店インフルエンサー（横スクロールのアバター） ----------
function renderInfluencers() {
  const track = document.getElementById("influencerTrack");
  if (!track) return;
  // シームレスに流すため2周分並べる
  const items = [...PAST_INFLUENCERS, ...PAST_INFLUENCERS];
  track.innerHTML = items
    .map(
      (n) => `
      <div class="influencer-avatar" title="${n}">
        <div class="influencer-photo" aria-hidden="true">${String(n).replace(/[^0-9]/g, "") || n.charAt(0)}</div>
        <span class="influencer-name">${n}</span>
      </div>`
    )
    .join("");
}

// ---------- スポンサー（ロゴグリッド） ----------
function renderSponsors() {
  const grid = document.getElementById("sponsorGrid");
  if (!grid) return;
  grid.innerHTML = SPONSORS.map((s) => `<div class="sponsor-cell">${s}</div>`).join("");
}

// ---------- FAQ（アコーディオン） ----------
function renderFaqs() {
  const list = document.getElementById("faqList");
  if (!list) return;

  list.innerHTML = FAQS.map(
    (f) => `
      <div class="faq-item">
        <button type="button" class="faq-q" aria-expanded="false">
          <span>${f.q}</span>
          <span class="faq-icon" aria-hidden="true">＋</span>
        </button>
        <div class="faq-a">
          <div class="faq-a-inner">${f.a.map((p) => `<p>${p}</p>`).join("")}</div>
        </div>
      </div>`
  ).join("");

  list.querySelectorAll(".faq-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const answer = item.querySelector(".faq-a");
      const isOpen = item.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(isOpen));
      answer.style.maxHeight = isOpen ? answer.scrollHeight + "px" : "0";
    });
  });
}

// ---------- お問い合わせフォーム ----------
function setupContactForm() {
  const form = document.getElementById("contactForm");
  const done = document.getElementById("formDone");
  const errorEl = document.getElementById("formError");
  if (!form) return;

  const message = document.getElementById("message");
  const messageCounter = document.getElementById("messageCounter");
  if (message && messageCounter) {
    const updateCounter = () => {
      messageCounter.textContent = `${message.value.length} / ${message.maxLength}`;
    };
    message.addEventListener("input", updateCounter);
    updateCounter();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    let valid = true;
    form.querySelectorAll("input, textarea, select").forEach((el) => {
      const ok = el.checkValidity();
      el.classList.toggle("is-error", !ok);
      if (!ok) valid = false;
    });
    if (!valid) return;

    if (errorEl) errorEl.hidden = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.value,
        email: form.email.value,
        category: form.category.value,
        message: form.message.value,
        company: form.company.value, // honeypot
      }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (submitBtn) submitBtn.disabled = false;
        if (!ok) {
          if (errorEl) {
            errorEl.textContent = (data && data.error) || "送信に失敗しました。時間をおいて再度お試しください。";
            errorEl.hidden = false;
          }
          return;
        }
        form.reset();
        if (done) {
          done.hidden = false;
          done.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => (done.hidden = true), 5000);
        }
      })
      .catch(() => {
        if (submitBtn) submitBtn.disabled = false;
        if (errorEl) {
          errorEl.textContent = "通信エラーが発生しました。時間をおいて再度お試しください。";
          errorEl.hidden = false;
        }
      });
  });
}
