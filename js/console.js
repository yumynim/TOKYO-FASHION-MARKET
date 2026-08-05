// ==========================================================
// 管理コンソール（admin-announcements.html、/console）の挙動
// ---------------------------------------------------------
// TFMのCSP（script-src 'self'）はインラインscriptを許可しないため、
// DRESS CODE TOKYOの同等ページと違い、このファイルとして外出ししている。
//
// 認証はSupabaseの個人アカウントではなく、共通パスワード方式
// （api/admin-login.js が発行したトークンをsessionStorageに保持）。
// ==========================================================
(function () {
  const TOKEN_KEY = "tfm_admin_token";

  const locked = document.getElementById("consoleLocked");
  const content = document.getElementById("consoleContent");
  const loginForm = document.getElementById("consoleLoginForm");
  const loginError = document.getElementById("consoleLoginError");
  const form = document.getElementById("consoleForm");
  const formError = document.getElementById("consoleFormError");
  const logoutBtn = document.getElementById("consoleLogoutBtn");

  const listEl = document.getElementById("announcementsList");
  const listPersonalEl = document.getElementById("personalList");
  const inquiriesEl = document.getElementById("inquiriesList");
  const inquiriesCountEl = document.getElementById("inquiriesCount");
  const listCountEl = document.getElementById("listCount");
  const listPersonalCountEl = document.getElementById("personalCount");
  const inquiriesSearchEl = document.getElementById("inquiriesSearch");
  const listSearchEl = document.getElementById("listSearch");
  const listPersonalSearchEl = document.getElementById("personalSearch");
  const pendingOrdersEl = document.getElementById("pendingOrdersList");
  const pendingOrdersCountEl = document.getElementById("pendingOrdersCount");
  const membersEl = document.getElementById("membersList");
  const membersCountEl = document.getElementById("membersCount");
  const membersSearchEl = document.getElementById("membersSearch");
  const membersAlertEl = document.getElementById("membersAlert");

  let allInquiries = [];
  let allAnnouncements = [];
  let allPersonal = [];
  let allMembers = [];

  const targetTabs = document.querySelectorAll("[data-target-mode]");
  const targetEmailField = document.getElementById("targetEmailField");
  const targetSegmentField = document.getElementById("targetSegmentField");
  const segmentSelect = document.getElementById("segmentSelect");
  const targetPendingField = document.getElementById("targetPendingField");
  const pendingCountEl = document.getElementById("pendingCount");
  const previewFrame = document.getElementById("previewFrame");
  const blocksEl = document.getElementById("consoleBlocks");
  let targetMode = "all";
  let previewTimer = null;
  let blockSeq = 0;
  let blocks = [];

  const BLOCK_LABELS = { heading: "見出し", paragraph: "段落", callout: "ハイライト", image: "画像", divider: "区切り線", button: "ボタン" };
  const COLOR_LABELS = { default: "標準", ink: "濃い黒", muted: "グレー", accent: "アクセント" };
  const colorOptionsHtml = (selected) =>
    Object.keys(COLOR_LABELS).map((key) => `<option value="${key}" ${key === (selected || "default") ? "selected" : ""}>${COLOR_LABELS[key]}</option>`).join("");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

  function tokenLooksValid(t) {
    if (!t) return false;
    const expiresAt = Number(t.split(".")[0]);
    return Number.isFinite(expiresAt) && Date.now() < expiresAt;
  }

  function showLocked() {
    clearToken();
    locked.hidden = false;
    content.hidden = true;
  }
  function showContent() {
    locked.hidden = true;
    content.hidden = false;
    loadList();
    loadInquiries();
    loadPendingOrders();
    loadMembers();
    fetchPreview();
  }

  /* ---------- 会員名簿 ----------
     会員1人ごとに、登録情報・購入履歴（受付コード・入場状況）・配信したお知らせ・
     お問い合わせをまとめて表示する（/api/admin-members）。
     「この人に今まで何を送ったか」を1箇所で確認できるようにして、
     二重案内や連絡漏れを防ぐ。 */
  const ORDER_STATUS_LABEL = { pending: "手続き中", paid: "支払い済み", failed: "失敗" };

  function memberDetailHtml(m) {
    const orders = (m.orders || []).map((o) => {
      const codes = (o.codes || []).map((c) => {
        const state = c.revoked ? "（無効）" : c.checkedInAt ? `（入場済み ${new Date(c.checkedInAt).toLocaleString("ja-JP")}）` : "（未入場）";
        return `${esc(c.code)}${state}`;
      }).join("<br>");
      return `<div class="member-order">
        <p><strong>${esc(o.summary || "（内容不明）")}</strong>　￥${Number(o.amountTotal || 0).toLocaleString("ja-JP")}　${esc(ORDER_STATUS_LABEL[o.status] || o.status)}　<span class="console-card-date">${new Date(o.createdAt).toLocaleDateString("ja-JP")}</span></p>
        ${o.orderNumber ? `<p class="console-card-date">注文番号: ${esc(o.orderNumber)}</p>` : ""}
        ${codes ? `<p class="console-card-date">受付コード:<br>${codes}</p>` : ""}
      </div>`;
    }).join("") || '<p class="cards-empty">購入履歴はありません。</p>';

    const notifs = (m.notifications || []).map((n) =>
      `<p>・${esc(n.title)} <span class="console-card-date">${new Date(n.createdAt).toLocaleDateString("ja-JP")}　${n.kind === "auto" ? "自動送信" : "手動送信"}　${n.read ? "既読" : "未読"}</span></p>`
    ).join("") || '<p class="cards-empty">配信したお知らせはありません。</p>';

    const inqs = (m.inquiries || []).map((q) =>
      `<p>・【${esc(q.reason)}】${esc(String(q.message || "").slice(0, 60))}${String(q.message || "").length > 60 ? "…" : ""} <span class="console-card-date">${new Date(q.createdAt).toLocaleDateString("ja-JP")}　${q.status === "replied" ? "返信済み" : "未返信"}</span></p>`
    ).join("") || '<p class="cards-empty">お問い合わせはありません。</p>';

    return `
      <h4>購入履歴</h4>${orders}
      <h4>配信したお知らせ</h4>${notifs}
      <h4>お問い合わせ</h4>${inqs}`;
  }

  function renderMembers(list) {
    if (!list.length) {
      membersEl.innerHTML = `<p class="cards-empty">${allMembers.length ? "検索条件に一致する会員がいません。" : "まだ会員はいません。"}</p>`;
      return;
    }
    membersEl.innerHTML = list.map((m) => `
      <details class="console-card member-card">
        <summary>
          <div class="console-card-head">
            <h3>${m.name ? esc(m.name) + "　" : ""}${esc(m.email)}</h3>
            <span class="console-card-date">${m.createdAt ? new Date(m.createdAt).toLocaleDateString("ja-JP") + " 登録" : ""}</span>
          </div>
          <p class="console-card-date">購入 ${m.paidCount}件 ／ 受付コード ${m.codeCount}枚（入場済み ${m.checkedInCount}）／ お知らせ ${m.notificationCount}件 ／ お問い合わせ ${m.inquiryCount}件${m.emailConfirmed ? "" : " ／ メール未確認"}</p>
        </summary>
        <div class="member-detail">${memberDetailHtml(m)}</div>
      </details>`).join("");
  }

  function filterMembers() {
    const q = (membersSearchEl.value || "").trim().toLowerCase();
    const filtered = !q ? allMembers : allMembers.filter((m) =>
      (m.name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.orders || []).some((o) => (o.orderNumber || "").toLowerCase().includes(q)));
    renderMembers(filtered);
  }

  function renderMembersAlert(paidWithoutCodes) {
    if (!paidWithoutCodes || !paidWithoutCodes.length) { membersAlertEl.innerHTML = ""; return; }
    // 「払ったのに受付コードが無い」注文は当日の入場トラブルに直結するので、名簿の一番上で目立たせる
    membersAlertEl.innerHTML = `
      <div class="console-card members-alert">
        <div class="console-card-head"><h3>⚠ 支払い済みなのに受付コードが未発行の注文（${paidWithoutCodes.length}件）</h3></div>
        <p class="console-note">Webhookの不達やコード発行の失敗が考えられます。このままだと当日ご入場いただけません。README の手動対応手順を確認してください。</p>
        ${paidWithoutCodes.map((o) => `<p>・${esc(o.email)}　${esc(o.summary)}${o.orderNumber ? `　${esc(o.orderNumber)}` : ""} <span class="console-card-date">${new Date(o.createdAt).toLocaleDateString("ja-JP")}</span></p>`).join("")}
      </div>`;
  }

  if (membersSearchEl) membersSearchEl.addEventListener("input", filterMembers);

  function loadMembers() {
    if (!membersEl) return;
    fetch("/api/admin-members", { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) { membersEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>'; return; }
        allMembers = data.members || [];
        membersCountEl.textContent = allMembers.length ? `(${allMembers.length}名${data.truncated ? "+" : ""})` : "";
        renderMembersAlert(data.paidWithoutCodes || []);
        filterMembers();
      })
      .catch(() => { membersEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
  }

  /* ---------- 決済未完了の注文（一覧・削除） ---------- */
  function renderPendingOrders(list) {
    if (!list.length) {
      pendingOrdersEl.innerHTML = '<p class="cards-empty">決済未完了の注文はありません。</p>';
      return;
    }
    pendingOrdersEl.innerHTML = list.map((o) => {
      const items = Array.isArray(o.line_items) ? o.line_items : [];
      const itemsText = items.map((i) => `${esc(i.name)} × ${i.quantity}`).join("、") || "（内容不明）";
      return `
      <div class="console-card" data-id="${esc(o.id)}">
        <div class="console-card-head">
          <h3>${itemsText}</h3>
          <span class="console-card-date">${new Date(o.created_at).toLocaleString("ja-JP")}</span>
        </div>
        ${o.order_number ? `<p class="console-card-date">注文番号: ${esc(o.order_number)}</p>` : ""}
        <p class="console-card-date">購入者: ${esc(o.buyer_email || "（不明）")} ／ 合計 ￥${Number(o.amount_total || 0).toLocaleString("ja-JP")}</p>
        <button type="button" class="btn-link console-delete" data-delete-order-id="${esc(o.id)}">削除する</button>
      </div>`;
    }).join("");

    pendingOrdersEl.querySelectorAll("[data-delete-order-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("この注文を削除しますか？（元に戻せません）")) return;
        fetch("/api/admin-orders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: btn.getAttribute("data-delete-order-id"), token: getToken() }),
        })
          .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
          .then(({ ok, status, data }) => {
            if (status === 401) { showLocked(); return; }
            if (!ok) { alert(data.error || "削除に失敗しました"); return; }
            loadPendingOrders();
          })
          .catch(() => alert("通信エラーが発生しました"));
      });
    });
  }

  function loadPendingOrders() {
    // トークンはURLではなくヘッダーで送る（URLに入れるとサーバーのアクセスログに残ってしまう）
    fetch("/api/admin-orders", { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) { pendingOrdersEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>'; return; }
        const orders = data.orders || [];
        pendingOrdersCountEl.textContent = orders.length ? `(${orders.length})` : "";
        renderPendingOrders(orders);
      })
      .catch(() => { pendingOrdersEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
  }

  /* ---------- お問い合わせ一覧・返信 ---------- */
  function renderInquiries(list) {
    if (!list.length) {
      inquiriesEl.innerHTML = `<p class="cards-empty">${allInquiries.length ? "検索条件に一致するお問い合わせがありません。" : "まだお問い合わせはありません。"}</p>`;
      return;
    }
    inquiriesEl.innerHTML = list.map((q) => `
      <div class="console-card inquiry${q.status === "replied" ? " inquiry-replied" : ""}" data-id="${esc(q.id)}">
        <div class="console-card-head">
          <h3>【${esc(q.reason)}】${esc(q.name)} 様</h3>
          <span class="console-card-date">${new Date(q.created_at).toLocaleString("ja-JP")}</span>
        </div>
        <p class="console-card-date">差出人: ${esc(q.email)}</p>
        <p>${esc(q.message).replace(/\n/g, "<br>")}</p>
        <span class="inquiry-status">${q.status === "replied" ? "✓ 対応済み" : "未対応"}</span>
        ${q.status === "replied" ? `
          <div class="inquiry-reply-sent">
            <p class="inquiry-reply-label">送信済みの返信（${new Date(q.replied_at).toLocaleString("ja-JP")}）</p>
            <p>${esc(q.reply_body || "").replace(/\n/g, "<br>")}</p>
          </div>` : ""}
        <details class="inquiry-reply-form">
          <summary class="btn-link">${q.status === "replied" ? "再度返信する" : "返信する"}</summary>
          <textarea class="console-block-textarea" rows="5" maxlength="4000" placeholder="返信内容を入力…" data-reply-input></textarea>
          <p class="char-counter" data-reply-counter>0 / 4000</p>
          <p class="form-error" data-reply-error hidden></p>
          <button type="button" class="btn btn-outline" data-reply-send>返信を送信</button>
        </details>
      </div>`).join("");

    inquiriesEl.querySelectorAll("[data-reply-input]").forEach((textarea) => {
      const counter = textarea.closest(".inquiry-reply-form").querySelector("[data-reply-counter]");
      if (counter) textarea.addEventListener("input", () => { counter.textContent = `${textarea.value.length} / ${textarea.maxLength}`; });
    });

    inquiriesEl.querySelectorAll("[data-reply-send]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".inquiry");
        const id = card.getAttribute("data-id");
        const textarea = card.querySelector("[data-reply-input]");
        const errorEl = card.querySelector("[data-reply-error]");
        const replyBody = textarea.value.trim();
        errorEl.hidden = true;
        if (!replyBody) { errorEl.textContent = "返信内容を入力してください"; errorEl.hidden = false; return; }

        btn.disabled = true;
        btn.textContent = "送信中…";
        fetch("/api/admin-inquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, replyBody, token: getToken() }),
        })
          .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
          .then(({ ok, status, data }) => {
            if (status === 401) { showLocked(); return; }
            btn.disabled = false;
            btn.textContent = "返信を送信";
            if (!ok) { errorEl.textContent = data.error || "送信に失敗しました"; errorEl.hidden = false; return; }
            loadInquiries();
          })
          .catch(() => {
            btn.disabled = false;
            btn.textContent = "返信を送信";
            errorEl.textContent = "通信エラーが発生しました";
            errorEl.hidden = false;
          });
      });
    });
  }

  function loadInquiries() {
    fetch("/api/admin-inquiries", { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) { inquiriesEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>'; return; }
        allInquiries = data.inquiries || [];
        inquiriesCountEl.textContent = allInquiries.length ? `(${allInquiries.length})` : "";
        filterInquiries();
      })
      .catch(() => { inquiriesEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
  }

  function filterInquiries() {
    const q = (inquiriesSearchEl.value || "").trim().toLowerCase();
    const filtered = !q ? allInquiries : allInquiries.filter((x) =>
      (x.name || "").toLowerCase().includes(q) ||
      (x.email || "").toLowerCase().includes(q) ||
      (x.message || "").toLowerCase().includes(q) ||
      (x.reason || "").toLowerCase().includes(q));
    renderInquiries(filtered);
  }
  inquiriesSearchEl.addEventListener("input", filterInquiries);

  function renderList(el, list, emptyMsg, type, hasMatches) {
    if (!list.length) { el.innerHTML = `<p class="cards-empty">${hasMatches === false ? "検索条件に一致するお知らせがありません。" : emptyMsg}</p>`; return; }
    el.innerHTML = list.map((n) => `
      <div class="console-card" data-id="${esc(n.id)}">
        <div class="console-card-head">
          <h3>${esc(n.title)}</h3>
          <span class="console-card-date">${new Date(n.created_at).toLocaleDateString("ja-JP")}</span>
        </div>
        ${n.email ? `<p class="console-card-date">宛先: ${esc(n.email)}</p>` : ""}
        <div class="console-card-body">${n.body_html || `<p>${esc(n.body)}</p>`}</div>
        <button type="button" class="btn-link console-delete" data-delete-id="${esc(n.id)}" data-delete-type="${type}">削除する</button>
      </div>`).join("");
    el.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => deleteItem(btn.getAttribute("data-delete-id"), btn.getAttribute("data-delete-type")));
    });
  }

  function loadList() {
    fetch("/api/admin-announcements", { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) {
          listEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>';
          listPersonalEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>';
          return;
        }
        allAnnouncements = data.announcements || [];
        allPersonal = data.personal || [];
        listCountEl.textContent = allAnnouncements.length ? `(${allAnnouncements.length})` : "";
        listPersonalCountEl.textContent = allPersonal.length ? `(${allPersonal.length})` : "";
        filterList();
        filterPersonal();
        renderSegments(data.segments || []);
        pendingCountEl.textContent = String(data.pendingCount || 0);
      })
      .catch(() => {
        listEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>';
        listPersonalEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>';
      });
  }

  function filterList() {
    const q = (listSearchEl.value || "").trim().toLowerCase();
    const filtered = !q ? allAnnouncements : allAnnouncements.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q));
    renderList(listEl, filtered, "まだお知らせはありません。", "announcement", !q || filtered.length > 0);
  }
  function filterPersonal() {
    const q = (listPersonalSearchEl.value || "").trim().toLowerCase();
    const filtered = !q ? allPersonal : allPersonal.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q) || (n.email || "").toLowerCase().includes(q));
    renderList(listPersonalEl, filtered, "まだ個人宛てに送ったお知らせはありません。", "personal", !q || filtered.length > 0);
  }
  listSearchEl.addEventListener("input", filterList);
  listPersonalSearchEl.addEventListener("input", filterPersonal);

  function deleteItem(id, type) {
    if (!confirm("このお知らせを削除しますか？")) return;
    fetch("/api/admin-announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type, token: getToken() }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) { alert(data.error || "削除に失敗しました"); return; }
        loadList();
      })
      .catch(() => alert("通信エラーが発生しました"));
  }

  // ---------- 配信エディタ（ブロック方式） ----------
  function newBlock(type) {
    blockSeq += 1;
    if (type === "heading") return { id: blockSeq, type, text: "", size: "md", color: "ink" };
    if (type === "paragraph") return { id: blockSeq, type, text: "", color: "default" };
    if (type === "callout") return { id: blockSeq, type, text: "" };
    if (type === "image") return { id: blockSeq, type, url: "", alt: "" };
    if (type === "button") return { id: blockSeq, type, label: "", url: "" };
    if (type === "divider") return { id: blockSeq, type };
    return { id: blockSeq, type: "paragraph", text: "", color: "default" };
  }

  function resetBlocks() {
    blocks = [newBlock("paragraph")];
    renderBlocksEditor();
  }

  function serializeBlocks() {
    return blocks.map((b) => {
      if (b.type === "heading") return { type: "heading", text: b.text || "", size: b.size || "md", color: b.color || "ink" };
      if (b.type === "paragraph") return { type: "paragraph", text: b.text || "", color: b.color || "default" };
      if (b.type === "callout") return { type: "callout", text: b.text || "" };
      if (b.type === "image") return { type: "image", url: b.url || "", alt: b.alt || "" };
      if (b.type === "button") return { type: "button", label: b.label || "", url: b.url || "" };
      return { type: "divider" };
    });
  }

  function hasSendableContent() {
    return blocks.some((b) =>
      ((b.type === "paragraph" || b.type === "heading" || b.type === "callout") && (b.text || "").trim()) ||
      (b.type === "button" && (b.label || "").trim()) ||
      (b.type === "image" && (b.url || "").trim()));
  }

  function blockBodyHtml(b) {
    if (b.type === "heading") {
      return `
        <div class="console-block-row console-block-row-inline">
          <select class="console-block-select" data-field="size">
            <option value="lg" ${b.size === "lg" ? "selected" : ""}>大見出し</option>
            <option value="md" ${b.size === "md" || !b.size ? "selected" : ""}>中見出し</option>
            <option value="sm" ${b.size === "sm" ? "selected" : ""}>小見出し</option>
          </select>
          <select class="console-block-select" data-field="color">${colorOptionsHtml(b.color || "ink")}</select>
        </div>
        <input type="text" class="console-block-input" data-field="text" maxlength="120" placeholder="見出しを入力…" value="${esc(b.text || "")}">`;
    }
    if (b.type === "paragraph") {
      return `
        <div class="console-block-row console-block-row-inline">
          <select class="console-block-select" data-field="color">${colorOptionsHtml(b.color)}</select>
        </div>
        <textarea class="console-block-textarea" data-field="text" maxlength="4000" rows="4" placeholder="本文を入力…（段落を分けたい場合は「＋ 段落」を複数追加してください）">${esc(b.text || "")}</textarea>
        <p class="char-counter" data-char-counter>${(b.text || "").length} / 4000</p>`;
    }
    if (b.type === "callout") {
      return `<textarea class="console-block-textarea" data-field="text" maxlength="4000" rows="3" placeholder="強調したい内容を入力…（背景付きのボックスで表示されます）">${esc(b.text || "")}</textarea>
        <p class="char-counter" data-char-counter>${(b.text || "").length} / 4000</p>`;
    }
    if (b.type === "image") {
      return `
        <div class="console-block-row">
          <div class="console-block-upload">
            <button type="button" class="btn-chip" data-upload-image>${b.url ? "別の画像に差し替え" : "＋ 画像をアップロード"}</button>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-input hidden>
            <span class="console-block-upload-status" data-upload-status></span>
          </div>
          ${b.url ? `<img src="${esc(b.url)}" alt="" class="console-block-thumb">` : ""}
          <input type="url" class="console-block-input" data-field="url" placeholder="画像のURL（アップロードすると自動で入ります。直接貼り付けもOK）" value="${esc(b.url || "")}">
          <input type="text" class="console-block-input" data-field="alt" maxlength="140" placeholder="画像の説明（alt、任意）" value="${esc(b.alt || "")}">
        </div>
        <p class="console-block-hint">対応形式: JPEG / PNG / WebP / GIF、3MBまで。すでに公開されている画像のURLを直接貼り付けることもできます。</p>`;
    }
    if (b.type === "button") {
      return `
        <div class="console-block-row">
          <input type="text" class="console-block-input" data-field="label" maxlength="40" placeholder="ボタンの文言（例：詳しく見る）" value="${esc(b.label || "")}">
          <input type="url" class="console-block-input" data-field="url" placeholder="https://tokyofashionmarket.com/...（空欄ならトップページ）" value="${esc(b.url || "")}">
        </div>`;
    }
    return `<div class="console-block-divider-hint">──────────</div>`;
  }

  function renderBlocksEditor() {
    blocksEl.innerHTML = blocks.map((b, i) => `
      <div class="console-block" data-id="${b.id}">
        <div class="console-block-head">
          <span class="console-block-type">${BLOCK_LABELS[b.type] || b.type}</span>
          <span class="console-block-controls">
            <button type="button" class="console-block-btn" data-move="up" ${i === 0 ? "disabled" : ""} title="上へ移動">↑</button>
            <button type="button" class="console-block-btn" data-move="down" ${i === blocks.length - 1 ? "disabled" : ""} title="下へ移動">↓</button>
            <button type="button" class="console-block-btn console-block-btn-danger" data-remove title="このブロックを削除">✕</button>
          </span>
        </div>
        <div class="console-block-body">${blockBodyHtml(b)}</div>
      </div>`).join("");

    blocksEl.querySelectorAll(".console-block").forEach((el) => {
      const id = Number(el.getAttribute("data-id"));
      el.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const block = blocks.find((b) => b.id === id);
          if (block) block[input.getAttribute("data-field")] = input.value;
          const counter = el.querySelector("[data-char-counter]");
          if (counter && input.maxLength > 0) counter.textContent = `${input.value.length} / ${input.maxLength}`;
          schedulePreview();
        });
      });
      const upBtn = el.querySelector('[data-move="up"]');
      const downBtn = el.querySelector('[data-move="down"]');
      const removeBtn = el.querySelector("[data-remove]");
      if (upBtn) upBtn.addEventListener("click", () => moveBlock(id, -1));
      if (downBtn) downBtn.addEventListener("click", () => moveBlock(id, 1));
      if (removeBtn) removeBtn.addEventListener("click", () => removeBlock(id));

      const uploadBtn = el.querySelector("[data-upload-image]");
      const uploadInput = el.querySelector("[data-upload-input]");
      if (uploadBtn && uploadInput) {
        uploadBtn.addEventListener("click", () => uploadInput.click());
        uploadInput.addEventListener("change", () => {
          const file = uploadInput.files && uploadInput.files[0];
          if (file) handleImageUpload(id, file);
        });
      }
    });
  }

  function handleImageUpload(id, file) {
    const statusEl = blocksEl.querySelector(`.console-block[data-id="${id}"] [data-upload-status]`);
    const MAX_BYTES = 3 * 1024 * 1024;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      if (statusEl) statusEl.textContent = "対応していない形式です（JPEG/PNG/WebP/GIFのみ）";
      return;
    }
    if (file.size > MAX_BYTES) {
      if (statusEl) statusEl.textContent = "ファイルが大きすぎます（3MBまで）";
      return;
    }
    if (statusEl) statusEl.textContent = "アップロード中…";
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      fetch("/api/admin-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getToken(), contentType: file.type, dataBase64: base64 }),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
        .then(({ ok, status, data }) => {
          if (status === 401) { showLocked(); return; }
          if (!ok) { if (statusEl) statusEl.textContent = data.error || "アップロードに失敗しました"; return; }
          const block = blocks.find((b) => b.id === id);
          if (block) block.url = data.url;
          renderBlocksEditor();
          schedulePreview();
        })
        .catch(() => { if (statusEl) statusEl.textContent = "通信エラーが発生しました"; });
    };
    reader.onerror = () => { if (statusEl) statusEl.textContent = "ファイルを読み込めませんでした"; };
    reader.readAsDataURL(file);
  }

  function moveBlock(id, delta) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    renderBlocksEditor();
    schedulePreview();
  }

  function removeBlock(id) {
    if (blocks.length <= 1) { blocks = [newBlock("paragraph")]; renderBlocksEditor(); schedulePreview(); return; }
    blocks = blocks.filter((b) => b.id !== id);
    renderBlocksEditor();
    schedulePreview();
  }

  document.querySelectorAll("[data-add-block]").forEach((btn) => {
    btn.addEventListener("click", () => {
      blocks.push(newBlock(btn.getAttribute("data-add-block")));
      renderBlocksEditor();
      schedulePreview();
    });
  });

  resetBlocks();

  function fetchPreview() {
    const token = getToken();
    if (!token) return;
    fetch("/api/admin-preview-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, title: form.title.value, blocks: serializeBlocks() }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(); return; }
        if (!ok) return;
        previewFrame.srcdoc = data.html;
      })
      .catch(() => {});
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(fetchPreview, 350);
  }
  form.title.addEventListener("input", schedulePreview);

  const titleCounter = document.getElementById("consoleTitleCounter");
  if (titleCounter) {
    form.title.addEventListener("input", () => {
      titleCounter.textContent = `${form.title.value.length} / ${form.title.maxLength}`;
    });
  }

  function setTargetMode(mode) {
    targetMode = mode;
    targetTabs.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-target-mode") === mode));
    targetEmailField.hidden = mode !== "one";
    form.targetEmail.required = mode === "one";
    if (mode !== "one") form.targetEmail.value = "";
    targetSegmentField.hidden = mode !== "segment";
    form.segmentKey.required = mode === "segment";
    if (mode !== "segment") form.segmentKey.value = "";
    targetPendingField.hidden = mode !== "pending";
  }

  function renderSegments(segments) {
    if (!segments || !segments.length) {
      segmentSelect.innerHTML = "<option value=\"\">（支払い済みの注文がまだありません）</option>";
      return;
    }
    segmentSelect.innerHTML = segments.map((s) => `<option value="${esc(s.key)}">${esc(s.name)}（${s.count}名）</option>`).join("");
  }
  targetTabs.forEach((btn) => btn.addEventListener("click", () => setTargetMode(btn.getAttribute("data-target-mode"))));

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.hidden = true;
    const password = loginForm.password.value;
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "確認中…";
    fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        btn.disabled = false;
        btn.textContent = "ログイン";
        if (!ok) { loginError.textContent = data.error || "パスワードが違います"; loginError.hidden = false; return; }
        // 当日スタッフ用の合言葉（CHECKIN_PASSWORD）では/consoleは開けない。
        // トークンを保存してしまうと全セクションが401で赤くなるだけなので、ここで案内する。
        if (data.scope === "checkin") {
          loginError.textContent = "この合言葉は当日の入場確認（/checkin）専用です。管理者パスワードを入力してください。";
          loginError.hidden = false;
          return;
        }
        setToken(data.token);
        loginForm.reset();
        showContent();
      })
      .catch(() => {
        btn.disabled = false;
        btn.textContent = "ログイン";
        loginError.textContent = "通信エラーが発生しました";
        loginError.hidden = false;
      });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    formError.hidden = true;
    const title = form.title.value.trim();
    const targetEmail = targetMode === "one" ? form.targetEmail.value.trim() : "";
    const segmentKey = targetMode === "segment" ? form.segmentKey.value : "";
    if (!title) { formError.textContent = "タイトルを入力してください"; formError.hidden = false; return; }
    if (!hasSendableContent()) { formError.textContent = "本文（段落）かボタンを1つ以上入力してください"; formError.hidden = false; return; }
    if (targetMode === "one" && !targetEmail) { formError.textContent = "宛先のメールアドレスを入力してください"; formError.hidden = false; return; }
    if (targetMode === "segment" && !segmentKey) { formError.textContent = "対象の商品/チケットを選んでください"; formError.hidden = false; return; }

    const targetPending = targetMode === "pending";
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "送信中…";
    fetch("/api/admin-announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, blocks: serializeBlocks(), targetEmail, segmentKey, targetPending, token: getToken() }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        btn.disabled = false;
        btn.textContent = "投稿する";
        if (status === 401) { showLocked(); return; }
        if (!ok) { formError.textContent = data.error || "送信に失敗しました"; formError.hidden = false; return; }
        if (data.segment) alert(`「${data.segment.name}」の購入者 ${data.segment.recipients} 名に送信しました（メール送信 ${data.segment.mailed} 件）。`);
        if (data.pending) alert(`決済未完了の会員 ${data.pending.recipients} 名に送信しました（メール送信 ${data.pending.mailed} 件）。`);
        form.reset();
        if (titleCounter) titleCounter.textContent = `0 / ${form.title.maxLength}`;
        resetBlocks();
        setTargetMode("all");
        loadList();
        fetchPreview();
      })
      .catch(() => {
        btn.disabled = false;
        btn.textContent = "投稿する";
        formError.textContent = "通信エラーが発生しました";
        formError.hidden = false;
      });
  });

  logoutBtn.addEventListener("click", showLocked);

  document.querySelectorAll(".console-jumpnav a").forEach((a) => {
    a.addEventListener("click", () => {
      const target = document.querySelector(a.getAttribute("href"));
      const details = target && target.querySelector("details");
      if (details) details.open = true;
    });
  });

  if (tokenLooksValid(getToken())) { showContent(); } else { showLocked(); }
})();
