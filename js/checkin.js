// ==========================================================
// 当日の入場確認ページ（checkin.html、/checkin）の挙動
// ---------------------------------------------------------
// ・合言葉でログイン（/api/admin-login。当日スタッフはCHECKIN_PASSWORDでも可）
// ・受付コードのカメラ読み取り（BarcodeDetector標準機能。追加ライブラリ無し）と手入力
// ・チェックイン一覧の表示・取り消し、お名前/メールアドレスからの検索
//
// CSP（script-src 'self'）のためインラインスクリプトは使えない。必ずこの外部ファイルに書く。
// ==========================================================
(function () {
  const TOKEN_KEY = "tfm_checkin_token";
  // localStorage を使う。sessionStorage だと、スマホで別アプリに切り替えてタブが
  // 破棄されるたびにログインし直しになり、当日その都度お客様の前で合言葉を口に出す
  // ことになってしまうため（/console 側は従来通り sessionStorage）。
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const locked = document.getElementById("checkinLocked");
  const content = document.getElementById("checkinContent");
  const loginForm = document.getElementById("checkinLoginForm");
  const loginError = document.getElementById("checkinLoginError");
  const logoutBtn = document.getElementById("checkinLogoutBtn");
  const resultEl = document.getElementById("checkinResult");
  const historyEl = document.getElementById("checkinHistoryList");
  const historyCountEl = document.getElementById("checkinHistoryCount");
  const historySearchEl = document.getElementById("checkinHistorySearch");
  const lookupInputEl = document.getElementById("checkinLookupInput");
  const lookupListEl = document.getElementById("checkinLookupList");
  const manualForm = document.getElementById("checkinManualForm");
  const manualInput = document.getElementById("checkinManualInput");
  const scanBtn = document.getElementById("checkinScanBtn");
  const videoEl = document.getElementById("checkinVideo");
  const cameraOffEl = document.getElementById("checkinCameraOff");
  const unsupportedEl = document.getElementById("checkinUnsupported");
  const cameraErrorEl = document.getElementById("checkinCameraError");

  let scanning = false;
  let allCheckins = [];

  // message を渡すと、ログイン画面に「なぜ弾かれたのか」を表示する。
  // 黙ってログイン画面に戻すと、列の途中でスタッフが「今の読み取りはどうなった？」
  // と分からなくなるため（直前の読み取りが記録されていない旨も必ず伝える）。
  function showLocked(message) {
    clearToken();
    locked.hidden = false;
    content.hidden = true;
    if (message) { loginError.textContent = message; loginError.hidden = false; }
  }
  function showContent() {
    locked.hidden = true;
    content.hidden = false;
    loadHistory();
  }
  const EXPIRED_MSG = "ログインの有効期限が切れました（24時間で切れます）。もう一度合言葉を入力してください。";

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
        if (!ok) { loginError.textContent = data.error || "合言葉が違います"; loginError.hidden = false; return; }
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
  logoutBtn.addEventListener("click", () => showLocked());

  /* ---------- 結果表示・履歴 ---------- */
  // 手が離せない受付でも分かるように、結果が出たら音と振動でも知らせる。
  // （音はブラウザの制限で、一度画面を触ってからでないと鳴らない）
  let audioCtx = null;
  function feedback(kind) {
    try { if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 80 : [180, 90, 180]); } catch (e) {}
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = kind === "ok" ? 880 : 300;
      gain.gain.value = 0.06;
      osc.start();
      osc.stop(audioCtx.currentTime + (kind === "ok" ? 0.12 : 0.32));
    } catch (e) {}
  }

  // 送信中の表示。前の人の結果が残ったままだと、それを次の人の結果と読み違える。
  function renderPending(code) {
    resultEl.innerHTML = `<div class="checkin-badge checkin-badge--pending">確認中…</div>
      <p class="checkin-code">${esc(code)}</p>`;
    resultEl.hidden = false;
  }

  function renderResult(state, code, data) {
    let html = "";
    const buyerLine = data.buyerName ? `${esc(data.buyerName)}　${esc(data.buyerEmail)}` : esc(data.buyerEmail);
    // まとめ買い（1回の決済で複数枚＝複数コード）のときは、同じ購入の残り枚数を出す。
    // コードは1人1つなので、同じQRを読み直す必要はない（読み直すと「入場済み」になる）。
    const total = Number(data.groupTotal) || 1;
    const used = Number(data.groupUsed) || 0;
    const remain = Math.max(total - used, 0);
    const countLine = total > 1
      ? `<p class="checkin-count">この購入の入場: ${used} / ${total} 人${remain > 0 ? `　<strong>ご同行者の分があと${remain}枚（別のコード）あります</strong>` : "　（全員入場済み）"}</p>`
      : "";
    if (state === "ok") {
      html = `<div class="checkin-badge checkin-badge--ok">入場OK</div>
        <p class="checkin-ticket">${esc(data.ticketName)}</p>
        ${countLine}
        <p class="checkin-buyer">${buyerLine}</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ok");
    } else if (state === "used") {
      html = `<div class="checkin-badge checkin-badge--used">入場済みです</div>
        <p class="checkin-ticket">${esc(data.ticketName)}</p>
        <p class="console-note">このコードは1回入場済みです（${new Date(data.checkedInAt).toLocaleString("ja-JP")}）。コードはお一人1つ・1回のみ有効です。</p>
        ${countLine}
        ${remain > 0 ? '<p class="console-note">同じ購入に未入場のコードが残っています。ご本人のグループの分なら、下の「コードが分からない方を探す」からお名前で検索して入場させられます。</p>' : ""}
        <p class="checkin-buyer">${buyerLine}</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ng");
    } else if (state === "network") {
      // 通信の問題を「無効なコード」と同じ見た目で出すと、正規のお客様を追い返してしまう。
      // 「このお客様が悪いのではない／もう一度試す」と分かる別の色・文言にする。
      html = `<div class="checkin-badge checkin-badge--pending">通信できませんでした</div>
        <p class="console-note">お客様のコードの問題ではありません。同じQRをもう一度かざしてください（同じ読み取りとして扱われるため、二重入場にはなりません）。</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ng");
    } else if (state === "blocked") {
      // 開催日以外に読み取ったときなど、コードの真偽とは無関係の受付停止。
      // 「無効なコード」で出すと現場が誤解するので、別の見た目にする。
      html = `<div class="checkin-badge checkin-badge--pending">受付できません</div>
        <p class="console-note">${esc(data && data.error ? data.error : "現在は入場受付を行っていません")}</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ng");
    } else if (state === "refunded" || state === "unpaid") {
      // 無効化済み・支払い未完了は「読み間違い」ではなく、購入そのものの状態の問題。
      // ただの「無効なコード」だと受付はお客様に理由を説明できないので、
      // 何が起きているのか・誰の購入なのかまで出す（本人確認して案内できるように）。
      const who = data && (data.buyerName || data.buyerEmail)
        ? `<p class="checkin-buyer">${data.buyerName ? esc(data.buyerName) + "　" : ""}${esc(data.buyerEmail || "")}</p>`
        : "";
      const badgeLabel = state === "refunded" ? "コード無効・入場できません"
        : (data && data.reason === "canceled") ? "お支払いキャンセル・入場できません"
        : "お支払い未完了・入場できません";
      html = `<div class="checkin-badge checkin-badge--error">${badgeLabel}</div>
        ${data && data.ticketName ? `<p class="checkin-ticket">${esc(data.ticketName)}</p>` : ""}
        <p class="console-note">${esc(data && data.error ? data.error : "この購入では入場できません")}</p>
        ${who}
        <p class="console-note">この場でのご案内が難しい場合は、お問い合わせフォームからご連絡いただくようお伝えください。</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ng");
    } else {
      html = `<div class="checkin-badge checkin-badge--error">無効なコード</div>
        <p class="console-note">${esc(data && data.error ? data.error : "そのコードは確認できませんでした")}</p>
        <p class="checkin-code">${esc(code)}</p>`;
      feedback("ng");
    }
    resultEl.innerHTML = html;
    resultEl.hidden = false;
    // 一覧を開いていると結果が画面外に出ることがあるので、必ず見える位置へ寄せる
    try { resultEl.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}

    if (state === "ok" || state === "used") loadHistory(); // チェックインが増えたので一覧を最新化する
  }

  /* ---------- 受付可能日の表示 ----------
     入場を受け付けられる日かどうかを、スキャンを始める前に出しておく。 */
  function renderGate(gate) {
    const el = document.getElementById("checkinGate");
    if (!gate) { el.hidden = true; return; }
    const jp = (d) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
      return m ? `${Number(m[2])}月${Number(m[3])}日` : String(d || "");
    };
    el.classList.toggle("checkin-gate--error", !gate.ok);
    if (!gate.ok) {
      el.innerHTML = `<strong>⚠ 今日は入場を受け付けられません</strong><br>` +
        `受付可能日が <strong>${esc(jp(gate.target))}</strong> に設定されています（本日は ${esc(jp(gate.today))}）。` +
        (gate.source === "EVENT_DATE"
          ? " テスト用の設定（環境変数 EVENT_DATE）が残っています。Vercel で EVENT_DATE を削除して再デプロイしてください。"
          : " 環境変数 CURRENT_EVENT_ID の値をご確認ください。");
    } else if (gate.target === "any") {
      el.classList.add("checkin-gate--error");
      el.innerHTML = "<strong>⚠ 日付チェックが無効になっています</strong><br>環境変数 EVENT_DATE が「any」のため、開催日以外でも入場を受け付けます。テストが終わったら削除してください。";
    } else if (!gate.target) {
      el.innerHTML = "受付可能日の設定がありません（いつでも入場を受け付けます）。";
    } else {
      el.innerHTML = `本日 ${esc(jp(gate.today))} は受付可能日です。入場を受け付けられます。`;
    }
    el.hidden = false;
  }

  /* ---------- チェックイン一覧（実データ・検索・取り消し可能） ---------- */
  function renderHistory(list) {
    historyCountEl.textContent = list.length ? `(${list.length})` : "";
    if (!list.length) {
      historyEl.innerHTML = `<p class="cards-empty">${allCheckins.length ? "検索条件に一致するものがありません。" : "まだチェックインはありません。"}</p>`;
      return;
    }
    historyEl.innerHTML = list.map((c) => `
      <div class="console-card">
        <div class="console-card-head">
          <h3>${esc(c.ticketName)}</h3>
          <span class="console-card-date">${new Date(c.checkedInAt).toLocaleString("ja-JP")}</span>
        </div>
        <p>${c.buyerName ? esc(c.buyerName) + "　" : ""}${esc(c.buyerEmail)}　${esc(c.entryCode)}</p>
        <button type="button" class="btn-link" data-undo-id="${esc(c.id)}">取り消す</button>
      </div>`).join("");
    historyEl.querySelectorAll("[data-undo-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("この入場（このコード1枚分）を取り消しますか？")) return;
        fetch("/api/admin-checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ undo: true, id: btn.getAttribute("data-undo-id"), token: getToken() }),
        })
          .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
          .then(({ ok, status, data }) => {
            if (status === 401) { showLocked(EXPIRED_MSG); return; }
            // 失敗を黙って握りつぶさない。ダイアログが閉じただけで一覧が変わらないと、
            // スタッフは「取り消せた」と思い込んだまま次の対応に進んでしまう。
            if (!ok) { alert((data && data.error) || "取り消しに失敗しました。もう一度お試しください。"); return; }
            loadHistory();
          })
          .catch(() => { alert("通信エラーで取り消せませんでした。もう一度お試しください。"); });
      });
    });
  }

  function filterHistory() {
    const q = (historySearchEl.value || "").trim().toLowerCase();
    const filtered = !q ? allCheckins : allCheckins.filter((c) =>
      (c.entryCode || "").toLowerCase().includes(q) ||
      (c.buyerEmail || "").toLowerCase().includes(q) ||
      (c.buyerName || "").toLowerCase().includes(q) ||
      (c.ticketName || "").toLowerCase().includes(q));
    renderHistory(filtered);
  }
  historySearchEl.addEventListener("input", filterHistory);

  /* ---------- お名前・メールアドレスから探す（コードを出せない来場者用） ---------- */
  let lookupTimer = null;
  let lookupSeq = 0;

  function renderLookup(results) {
    if (!results.length) {
      lookupListEl.innerHTML = '<p class="cards-empty">該当する方が見つかりませんでした。</p>';
      return;
    }
    // 1行＝コード1枚（まとめ買いした人は、その人の行が枚数分並ぶ）
    lookupListEl.innerHTML = results.map((r) => {
      const used = !!r.checkedInAt;
      // 無効化済みの行も検索には出す（「該当なし」だと受付が状況を判断できないため）。
      // ただし入場はさせられないので、状態を明示してボタンを押せなくする。
      const revoked = !!r.revoked;
      const state = revoked ? "コード無効" : used ? "入場済み" : "未入場";
      return `
      <div class="console-card">
        <div class="console-card-head">
          <h3>${r.buyerName ? esc(r.buyerName) : esc(r.buyerEmail)}</h3>
          <span class="console-card-date">${state}</span>
        </div>
        <p>${r.buyerName ? esc(r.buyerEmail) + "　" : ""}${esc(r.ticketName)}</p>
        <p class="checkin-code">${esc(r.entryCode)}</p>
        ${revoked ? '<p class="console-note">この受付コードは無効化されています（返金等）。ご入場いただけません。</p>' : ""}
        <button type="button" class="btn btn-solid" data-lookup-code="${esc(r.entryCode)}"${used || revoked ? " disabled" : ""}>${revoked ? "入場不可" : used ? "入場済み" : "入場させる"}</button>
      </div>`;
    }).join("");
    lookupListEl.querySelectorAll("[data-lookup-code]").forEach((btn) => {
      btn.addEventListener("click", () => {
        // 通常のスキャンとまったく同じ経路を通す（人数の数え方を1箇所に保つため）
        const req = submitCode(btn.getAttribute("data-lookup-code"));
        if (!req) {
          // 別の処理中で受け付けられなかったことを黙って握りつぶさない
          // （押したのに何も起きないと、スタッフは入場済みになったと思い込む）
          alert("ほかの読み取りを処理中です。1〜2秒待ってからもう一度押してください。");
          return;
        }
        // 入場処理が終わってから検索結果を取り直す（先に取り直すと入場前の人数が表示される）
        req.then(runLookup);
      });
    });
  }

  function runLookup() {
    const q = (lookupInputEl.value || "").trim();
    if (q.length < 2) { lookupListEl.innerHTML = ""; return; }
    const seq = ++lookupSeq;
    lookupListEl.innerHTML = '<p class="cards-empty">検索中…</p>';
    // トークンはURLではなくヘッダーで送る（URLに入れるとサーバーのアクセスログに残ってしまう）
    fetch("/api/admin-checkin?lookup=" + encodeURIComponent(q), { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (seq !== lookupSeq) return; // 入力が変わった後に届いた古い結果は捨てる
        if (status === 401) { showLocked(EXPIRED_MSG); return; }
        if (!ok) { lookupListEl.innerHTML = '<p class="cards-empty">検索に失敗しました。</p>'; return; }
        renderLookup(data.results || []);
      })
      .catch(() => { if (seq === lookupSeq) lookupListEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
  }

  lookupInputEl.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(runLookup, 300); // 1文字ごとに投げないよう少し待つ
  });

  function loadHistory() {
    fetch("/api/admin-checkin", { headers: { "x-admin-token": getToken() } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 401) { showLocked(EXPIRED_MSG); return; }
        if (!ok) { historyEl.innerHTML = '<p class="cards-empty">読み込みに失敗しました。</p>'; return; }
        allCheckins = data.checkins || [];
        filterHistory();
        renderGate(data.gate);
      })
      .catch(() => { historyEl.innerHTML = '<p class="cards-empty">通信エラーが発生しました。</p>'; });
  }

  let inFlight = false;
  // カメラ側の「同じコードは読み直さない」記憶をリセットする関数。
  // スキャナー起動中だけ実体が入る（submitCodeの通信失敗時に使う）。
  let resetScanMemory = null;
  // 通信に失敗した読み取りを覚えておく。同じコードをもう一度送るときは
  // 同じIDを使い回す。これが無いと、1回目が実はサーバーに届いていた場合に
  // やり直しが「新しい読み取り」として二重に数えられてしまう
  // （二重カウント防止の仕組みそのものが機能しなくなる）。
  let failedRequest = null; // { code, requestId }

  function submitCode(rawCode) {
    const code = String(rawCode || "").trim();
    if (!code) return null;
    // 連打・二重スキャン対策。1件処理し終わるまで次を受け付けない。
    if (inFlight) return null;
    inFlight = true;
    renderPending(code);

    // 1回の読み取りごとに固有のIDを付ける。通信をやり直しても、
    // サーバー側で「同じ読み取り」と分かるので人数が二重に減らない。
    const requestId = failedRequest && failedRequest.code === code
      ? failedRequest.requestId
      : window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);

    // 会場のWi-Fiが遅いと延々待たされるので、10秒で打ち切って結果を出す。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    return fetch("/api/admin-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, token: getToken(), requestId }),
      signal: controller.signal,
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        failedRequest = null; // サーバーの返事が届いた＝この読み取りは決着した
        if (status === 401) { showLocked("ログインの有効期限が切れました。直前の読み取りは記録されていません。ログイン後、もう一度読み取ってください。"); return; }
        if (status === 403) { renderResult("blocked", code, data); return; }
        if (!ok) {
          // サーバーが理由まで返してきたときは、それに応じた表示にする
          const reason = data && data.reason;
          renderResult(reason === "refunded" ? "refunded"
            : reason === "unpaid" || reason === "canceled" ? "unpaid"
            : "error", code, data);
          return;
        }
        renderResult(data.alreadyCheckedIn ? "used" : "ok", code, data);
      })
      .catch(() => {
        failedRequest = { code, requestId };
        // カメラが「同じコードは一度フレームから外すまで再送しない」状態のままだと、
        // お客様がQRを掲げ続けている限り再試行できない。通信失敗時はその記憶を
        // リセットして、かざしたままでも読み直せるようにする（同じrequestIdを
        // 使い回すので、1回目が実は届いていても二重入場にはならない）。
        if (typeof resetScanMemory === "function") resetScanMemory();
        renderResult("network", code, {});
      })
      .finally(() => { clearTimeout(timer); inFlight = false; });
  }

  manualForm.addEventListener("submit", function (e) {
    e.preventDefault();
    submitCode(manualInput.value);
    manualInput.value = "";
    manualInput.focus();
  });

  /* ---------- カメラでのQR読み取り（対応ブラウザのみ。BarcodeDetector標準機能を利用、追加ライブラリ無し） ----------
     scanBtn.onclick は常にこの2関数のどちらかを指す状態にする（start↔stopを都度貼り替える）。
     成功検出時の自動停止も stopScanner を経由させ、次のクリックで確実に再開できるようにする。 */
  function stopScanner(stream) {
    scanning = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    videoEl.hidden = true;
    cameraOffEl.hidden = false;
    scanBtn.textContent = "カメラで読み取る";
    scanBtn.onclick = startScanner;
  }

  async function startScanner() {
    if (!("BarcodeDetector" in window)) { unsupportedEl.hidden = false; return; }
    cameraErrorEl.hidden = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (e) {
      cameraErrorEl.hidden = false;
      return;
    }
    videoEl.srcObject = stream;
    videoEl.hidden = false;
    cameraOffEl.hidden = true;
    scanBtn.textContent = "読み取りを止める";
    scanBtn.onclick = function () { stopScanner(stream); };
    await videoEl.play();

    let detector;
    try {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch (e) {
      // コンストラクタ自体が失敗する端末がある。カメラは映っているのに永久に
      // 読み取れない状態になるので、はっきり手入力へ誘導する。
      unsupportedEl.hidden = false;
      stopScanner(stream);
      return;
    }

    scanning = true;
    // 同じQRを映しっぱなしにしても1回しか数えないための記憶。
    // 同じコードをもう一度数えるには、いったんカメラから外して（約1秒）
    // もう一度かざす、というスタッフの明確な動作を要求する。
    // 別のコードなら即座に受け付ける。カメラ自体は止めない
    // （止めると1人ごとにボタンを押し直すことになるため）。
    let lastValue = "";
    let lastSeenAt = 0;
    let needsGap = false; // true の間は、同じコードを読んでも送信しない
    const GAP_MS = 1200;
    resetScanMemory = () => { lastValue = ""; needsGap = false; };

    const tick = async () => {
      if (!scanning) return;
      try {
        const codes = await detector.detect(videoEl);
        const now = Date.now();
        if (codes.length) {
          const value = codes[0].rawValue;
          if (value !== lastValue) {
            // 別のコード。送信できたときだけ「読んだ」ことにする。
            // 前の読み取りの通信がまだ終わっていない間（inFlight）は submitCode が
            // null を返すので、記憶を更新せず次のフレームで自動的に再挑戦する。
            // これが無いと、3人組のQRを続けて読んだとき2枚目が無言で捨てられ、
            // 画面には1人目の「入場OK」が残ったままになる（未入場に誰も気づけない）。
            if (submitCode(value)) {
              lastValue = value;
              needsGap = true;
              lastSeenAt = now;
            }
          } else if (!needsGap) {
            if (submitCode(value)) {
              needsGap = true;
              lastSeenAt = now;
            }
          } else {
            lastSeenAt = now; // まだ映りっぱなし。送信はしない
          }
        } else if (needsGap && now - lastSeenAt > GAP_MS) {
          needsGap = false; // 十分な時間カメラから外れた。次に映ったらまた数える
        }
      } catch (e) { /* 検出エラーは無視して続ける */ }
      requestAnimationFrame(tick);
    };
    tick();
  }
  scanBtn.onclick = startScanner;

  // トークンが残っていればログイン状態から始める（合言葉自体は都度聞かない）
  if (getToken()) showContent();
  else showLocked();
})();
