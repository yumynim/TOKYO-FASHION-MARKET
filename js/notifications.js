// ==========================================================
// Notifications — アプリ内通知（購入確認など）
// ==========================================================
// 通知の作成はサーバー側（api/webhooks/square.js、service_role）のみが行う。
// このファイルは「ログイン中の本人の通知を読む・既読にする」だけを行う
// （notifications テーブルのRLSポリシーにより、本人の行しか見えない・変更できない）。
//
// js/config.js が未設定（Auth.client が null）の間は、ベルアイコンごと非表示のままにする。

const Notifications = {
  _list: [],
  _panelOpen: false,

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
      this.closePanel();
      return;
    }

    wrap.hidden = false;

    const { data, error } = await Auth.client
      .from("notifications")
      .select("id, type, title, body, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("notifications: 取得に失敗しました", error);
      return;
    }

    this._list = data || [];
    this.renderBadge();
    if (this._panelOpen) this.renderPanel();
  },

  renderBadge() {
    const badge = document.getElementById("notifCount");
    if (!badge) return;
    const unread = this._list.filter((n) => !n.is_read).length;
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  renderPanel() {
    const panel = document.getElementById("notifPanel");
    if (!panel) return;

    if (!this._list.length) {
      panel.innerHTML = `<p class="notif-empty">通知はまだありません。</p>`;
      return;
    }

    const items = this._list
      .map(
        (n) => `
        <li class="notif-item${n.is_read ? "" : " is-unread"}" data-id="${n.id}">
          <p class="notif-item-title">${this.esc(n.title)}</p>
          ${n.body ? `<p class="notif-item-body">${this.esc(n.body)}</p>` : ""}
        </li>`
      )
      .join("");

    panel.innerHTML = `
      <div class="notif-panel-head">
        <span>通知</span>
        <button type="button" class="notif-mark-all" id="notifMarkAll">すべて既読にする</button>
      </div>
      <ul class="notif-list">${items}</ul>`;

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
    if (wrap && Notifications._panelOpen && !wrap.contains(e.target)) Notifications.closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") Notifications.closePanel();
  });

  Notifications.refresh();
  Auth.onChange(() => Notifications.refresh());

  // ログイン中は1分おきに新着を確認（サイト内通知の即時性はこの間隔まで許容する設計）
  setInterval(() => Notifications.refresh(), 60000);
});
