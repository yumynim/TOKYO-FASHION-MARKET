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
          ${g.quickAdd === false ? "" : `<button type="button" class="goods-add" data-index="${i}">カートに追加</button>`}
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

  // ---------- コンセプト（hagi） ----------
  hagi() {
    // メンバー。★写真は後日追加予定（それまでは仮のイニシャル表示のまま）
    const MEMBERS = [{ role: "代表", name: "植谷 航輝" }];
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
        ? slice.map((a, i) => `
          <li class="news-item">
            <time>${a.date}</time>
            <span class="news-tag">${a.cat}</span>
            <button type="button" class="news-title" data-index="${i}" aria-expanded="false">${a.title}</button>
            <div class="news-detail" id="newsDetail${i}">
              <div class="news-detail-inner">${a.body || "詳細は準備中です。"}</div>
            </div>
          </li>`).join("")
        : '<li class="news-item"><span>該当する記事はありません。</span></li>';

      list.querySelectorAll(".news-title").forEach((btn) => {
        btn.addEventListener("click", () => {
          const detail = document.getElementById("newsDetail" + btn.dataset.index);
          const isOpen = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!isOpen));
          detail.style.maxHeight = isOpen ? "0" : detail.scrollHeight + "px";
        });
      });

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

  // ---------- ログイン限定ページ（マイページ） ----------
  members() {
    const btn = document.getElementById("membersLoginBtn");
    if (btn) btn.addEventListener("click", () => UI.openLogin());

    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const ORDER_STATUS_LABEL = { pending: "手続き中", paid: "支払い済み", failed: "失敗" };

    // 受付コードは1人1コード（entry_passes）。まとめ買いなら人数分並べ、入場済みかも表示する。
    // QR画像そのものは確認メール・通知（body_html）で見られるため、ここでは文字列で示す。
    function renderEntryPasses(passes) {
      const list = Array.isArray(passes) ? passes : [];
      if (!list.length) return "";
      const rows = list
        .map(
          (p, i) =>
            `${list.length > 1 ? `${i + 1}人目： ` : ""}<strong>${esc(p.code)}</strong>${p.checked_in_at ? '<span class="entry-code-used">（入場済み）</span>' : ""}`
        )
        .join("<br>");
      const note = list.length > 1 ? "<br><span>コードはお一人につき1つ・1回のみ有効です。QRコードは確認メール・通知でご確認いただけます。</span>" : "";
      return `<p class="entry-code entry-code--inline">当日の受付コード<br>${rows}${note}</p>`;
    }

    const ordersEl = document.getElementById("myOrders");
    const notifEl = document.getElementById("myNotifications");
    const notifTabs = document.querySelectorAll("[data-my-notif-tab]");
    let myNotifTab = "personal";

    function renderMyOrders(orders) {
      if (!ordersEl) return;
      if (!orders.length) {
        ordersEl.innerHTML = '<p class="cards-empty">まだ購入履歴はありません。</p>';
        return;
      }
      ordersEl.innerHTML = orders.map((o) => {
        const items = Array.isArray(o.line_items) ? o.line_items : [];
        const rows = items.map((i) => `<li>${esc(i.name)} × ${i.quantity} … ￥${Number(i.amount).toLocaleString("ja-JP")}</li>`).join("");
        return `
        <div class="mypage-card">
          <div class="mypage-card-head">
            <span class="mypage-card-status is-${esc(o.status)}">${esc(ORDER_STATUS_LABEL[o.status] || o.status)}</span>
            <span class="mypage-card-date">${new Date(o.created_at).toLocaleString("ja-JP")}</span>
          </div>
          ${o.order_number ? `<p class="order-number mypage-order-number">ご注文番号: ${esc(o.order_number)}</p>` : ""}
          <ul class="order-summary">${rows}</ul>
          <p class="order-total">合計　￥${Number(o.amount_total || 0).toLocaleString("ja-JP")}（税込）</p>
          ${renderEntryPasses(o.entry_passes)}
        </div>`;
      }).join("");
    }

    function loadMyOrders() {
      if (!ordersEl) return;
      Auth.getSession().then((session) => {
        if (!session) return;
        fetch("/api/my-orders", { headers: { Authorization: "Bearer " + session.access_token } })
          .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) { ordersEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>'; return; }
            renderMyOrders(data.orders || []);
          })
          .catch(() => { ordersEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
      });
    }

    // 通知の取得・既読化は js/notifications.js の Notifications オブジェクトをそのまま使う
    // （ヘッダーの通知ベルと同じキャッシュ・同じAPI呼び出しを再利用し、二重実装を避ける）
    function renderMyNotifications() {
      if (!notifEl) return;
      const list = myNotifTab === "broadcast" ? Notifications._broadcast : Notifications._list;
      if (!list.length) {
        notifEl.innerHTML = `<p class="cards-empty">${myNotifTab === "broadcast" ? "お知らせはまだありません。" : "通知はまだありません。"}</p>`;
        return;
      }
      notifEl.innerHTML = list.map((n) => {
        const body = n.body_html || (n.body ? `<p>${esc(n.body)}</p>` : "");
        const unread = myNotifTab === "personal" && !n.is_read;
        return `
        <div class="mypage-card mypage-notif${unread ? " is-unread" : ""}" data-id="${n.id}">
          <div class="mypage-card-head">
            <h3>${esc(n.title)}</h3>
            <span class="mypage-card-date">${new Date(n.created_at).toLocaleString("ja-JP")}</span>
          </div>
          <div class="mypage-card-body">${body}</div>
        </div>`;
      }).join("");

      if (myNotifTab === "personal") {
        notifEl.querySelectorAll(".mypage-notif.is-unread").forEach((el) => {
          el.addEventListener("click", () => {
            Notifications.markRead(el.dataset.id).then(renderMyNotifications);
          });
        });
      }
    }

    function loadMyNotifications() {
      if (!notifEl) return;
      Notifications.refresh().then(renderMyNotifications);
    }

    notifTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        myNotifTab = btn.getAttribute("data-my-notif-tab");
        notifTabs.forEach((b) => b.classList.toggle("is-active", b === btn));
        renderMyNotifications();
      });
    });

    const greetingEl = document.getElementById("myGreeting");
    const logoutBtn = document.getElementById("myLogoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.signOut());

    async function loadMypageIfLoggedIn() {
      const user = await Auth.getUser();
      if (!user) return;
      if (greetingEl) greetingEl.textContent = `${user.email || "ゲスト"} さん、こんにちは。`;
      loadMyOrders();
      loadMyNotifications();
    }

    loadMypageIfLoggedIn();
    Auth.onChange(() => loadMypageIfLoggedIn());
  },
};
