// ==========================================================
// Notifications — アプリ内通知（購入確認など／運営からのお知らせ）
// ==========================================================
// 「あなたへのお知らせ」（notifications テーブル、本人専用）と
// 「TFMからのお知らせ」（announcements テーブル、会員全員向け。/console から配信）の
// 2タブをヘッダーの通知パネルで切り替えて表示する。
//
// notifications の作成はサーバー側（api/webhooks/square.js・api/admin-announcements.js、
// いずれもservice_role）のみが行う。announcements も同様に api/admin-announcements.js
// （service_role）経由でのみ作成される。このファイルは「読む・既読にする」だけを行う
// （notificationsはRLSにより本人の行しか見えない・変更できない。announcementsはログイン中の
// 会員なら誰でも読める代わりに、個別の既読状態を持たない）。
//
// js/config.js が未設定（Auth.client が null）の間は、ベルアイコンごと非表示のままにする。

const Notifications = {
  _list: [],
  _broadcast: [],
  _panelOpen: false,
  _activeTab: "personal", // 'personal' | 'broadcast'
  _lastSeenKey: "tfm_announcements_last_seen",

  esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  // ---------- ログイン状態に応じてベルの表示・通知一覧を更新 ----------
  async refresh() {
    const wrap = document.getElementById("notifWrap");
    if (!wrap) return;

    if (!Auth.client) {
      wrap.hidden = true;
      return;
    }

    const user = await Auth.getUser();
    if (!user) {
      wrap.hidden = true;
      this._list = [];
      this._broadcast = [];
      this.closePanel();
      return;
    }

    wrap.hidden = false;

    const [personalRes, broadcastRes] = await Promise.all([
      Auth.client
        .from("notifications")
        .select("id, type, title, body, body_html, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      Auth.client
        .from("announcements")
        .select("id, title, body, body_html, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (personalRes.error) console.error("notifications: 取得に失敗しました", personalRes.error);
    if (broadcastRes.error) console.error("announcements: 取得に失敗しました", broadcastRes.error);

    this._list = personalRes.data || [];
    this._broadcast = broadcastRes.data || [];
    this.renderBadge();
    if (this._panelOpen) this.renderPanel();
  },

  // announcementsは既読/未読の概念が無いため、最後にパネルを開いた時刻より
  // 新しいものがあるかどうかをlocalStorageで簡易的に判定する
  hasNewBroadcast() {
    if (!this._broadcast.length) return false;
    const lastSeen = Number(localStorage.getItem(this._lastSeenKey) || 0);
    return this._broadcast.some((n) => new Date(n.created_at).getTime() > lastSeen);
  },

  renderBadge() {
    const badge = document.getElementById("notifCount");
    if (!badge) return;
    const unread = this._list.filter((n) => !n.is_read).length;
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = false;
    } else if (this.hasNewBroadcast()) {
      badge.textContent = "";
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  renderPanel() {
    const panel = document.getElementById("notifPanel");
    if (!panel) return;

    const list = this._activeTab === "broadcast" ? this._broadcast : this._list;
    const items = !list.length
      ? `<p class="notif-empty">${this._activeTab === "broadcast" ? "お知らせはまだありません。" : "通知はまだありません。"}</p>`
      : `<ul class="notif-list">${list
          .map((n) => {
            const bodyInner = n.body_html || (n.body ? `<p>${this.esc(n.body)}</p>` : "");
            const body = bodyInner ? `<div class="notif-item-body">${bodyInner}</div>` : "";
            const unreadClass = this._activeTab === "personal" && !n.is_read ? " is-unread" : "";
            return `
        <li class="notif-item${unreadClass}" data-id="${n.id}">
          <p class="notif-item-title">${this.esc(n.title)}</p>
          ${body}
        </li>`;
          })
          .join("")}</ul>`;

    panel.innerHTML = `
      <div class="notif-tabs">
        <button type="button" class="notif-tab${this._activeTab === "personal" ? " is-active" : ""}" data-notif-tab="personal">あなたへのお知らせ</button>
        <button type="button" class="notif-tab${this._activeTab === "broadcast" ? " is-active" : ""}" data-notif-tab="broadcast">TFMからのお知らせ</button>
      </div>
      <div class="notif-panel-head">
        <span>${this._activeTab === "broadcast" ? "TFMからのお知らせ" : "通知"}</span>
        ${this._activeTab === "personal" ? '<button type="button" class="notif-mark-all" id="notifMarkAll">すべて既読にする</button>' : ""}
      </div>
      ${items}`;

    panel.querySelectorAll("[data-notif-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._activeTab = btn.getAttribute("data-notif-tab");
        if (this._activeTab === "broadcast") localStorage.setItem(this._lastSeenKey, String(Date.now()));
        this.renderBadge();
        this.renderPanel();
      });
    });

    const markAllBtn = panel.querySelector("#notifMarkAll");
    if (markAllBtn) markAllBtn.addEventListener("click", () => this.markAllRead());

    panel.querySelectorAll(".notif-item.is-unread").forEach((el) => {
      el.addEventListener("click", () => this.markRead(el.dataset.id));
    });
  },

  // ---------- 既読化 ----------
  async markRead(id) {
    if (!Auth.client) return;
    const target = this._list.find((n) => n.id === id);
    if (!target || target.is_read) return;
    target.is_read = true;
    this.renderBadge();
    this.renderPanel();

    const { error } = await Auth.client.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) console.error("notifications: 既読化に失敗しました", error);
  },

  async markAllRead() {
    if (!Auth.client) return;
    const unreadIds = this._list.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    this._list.forEach((n) => (n.is_read = true));
    this.renderBadge();
    this.renderPanel();

    const { error } = await Auth.client.from("notifications").update({ is_read: true }).eq("is_read", false);
    if (error) console.error("notifications: 一括既読化に失敗しました", error);
  },

  // ---------- パネルの開閉 ----------
  openPanel() {
    const wrap = document.getElementById("notifWrap");
    const btn = document.getElementById("notifBtn");
    if (!wrap) return;
    this._panelOpen = true;
    wrap.classList.add("is-open");
    if (btn) btn.setAttribute("aria-expanded", "true");
    this.renderPanel();
  },

  closePanel() {
    const wrap = document.getElementById("notifWrap");
    const btn = document.getElementById("notifBtn");
    if (!wrap) return;
    this._panelOpen = false;
    wrap.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  },

  togglePanel() {
    if (this._panelOpen) this.closePanel();
    else this.openPanel();
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("notifBtn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      Notifications.togglePanel();
    });
  }

  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("notifWrap");
    if (!wrap || !Notifications._panelOpen) return;
    // タブ切り替え（renderPanel）はクリックイベント自身の中でパネルの中身を丸ごと
    // 作り直すため、クリックされたボタン自身がこの時点でDOMから外れている。
    // wrap.contains(e.target) だと「切り離された要素」を外側クリックと誤判定して
    // パネルが閉じてしまう（タブ切替のたびに一瞬パネルが消える/ガタつく原因だった）。
    // composedPath() はイベント発火時点の経路をスナップショットとして保持するため、
    // 後からDOMが差し替わっても正しく「パネル内のクリックか」を判定できる。
    if (!e.composedPath().includes(wrap)) Notifications.closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") Notifications.closePanel();
  });

  Notifications.refresh();
  Auth.onChange(() => Notifications.refresh());

  // ログイン中は1分おきに新着を確認（サイト内通知の即時性はこの間隔まで許容する設計）
  setInterval(() => Notifications.refresh(), 60000);
});
