// ==========================================================
// /api/admin-checkin
// ---------------------------------------------------------
// 当日の入場確認用。
//
// GET  : チェックイン済みの一覧を返す（checkin.htmlの「チェックイン一覧」用）。
//        ?lookup=... のときは「お名前・メールアドレスから購入を探す」モード。
// POST : 受付コード（entry_passes.code）を受け取り、支払い済みの購入かどうか・
//        すでにチェックイン済みかどうかを判定し、未チェックインならその場で
//        チェックイン済みにする。{ undo: true, id } を渡すと逆に取り消せる
//        （スタッフの誤操作を戻すため）。
//
// checkin.html（/checkin）のQRスキャン・手入力どちらからもここを呼ぶ。
// 認証は/consoleと同じ合言葉方式。scope 'checkin' を要求するので、
// 当日スタッフ用の CHECKIN_PASSWORD のトークンでも、運営用の
// ADMIN_CONSOLE_PASSWORD のトークンでも使える（api/_adminAuth.js 参照）。
// ==========================================================
const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken } = require("./_adminAuth");

// 会員の表示名（Googleログインの氏名等）とメールアドレスの両方を返す。
// スタッフが現場でメールアドレスだけでは本人特定しづらいため。
async function resolveUsers(serviceClient, userIds) {
  const map = new Map();
  const remaining = new Set(userIds);
  if (!remaining.size) return map;
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = (data && data.users) || [];
    for (const u of users) {
      if (remaining.has(u.id)) {
        const meta = u.user_metadata || {};
        map.set(u.id, {
          email: u.email || "（不明）",
          name: meta.full_name || meta.name || meta.display_name || "",
        });
        remaining.delete(u.id);
      }
    }
    if (!remaining.size || users.length < perPage) break;
    page += 1;
  }
  return map;
}

// 今回のイベントの受付コードだけを対象にするための前方一致パターン。
// CURRENT_EVENT_ID が未設定なら 'TFM-' 全体（＝絞らないのと同じ）になる。
function eventCodePrefix() {
  const eventId = String(process.env.CURRENT_EVENT_ID || "").trim();
  return eventId ? `TFM-${eventId}-` : "TFM-";
}

// 日本時間の今日の日付（YYYY-MM-DD）。サーバーはUTCで動くので+9時間して切り出す。
function jstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 入場は開催日当日だけ有効にする（日付単位のゲート）。
// これが無いと、前日や翌日にコードを読んでも「入場OK」が出てしまい、
// 例えば前日の設営中に試し読みしたコードが当日「入場済み」になる事故が起きる。
//
// 開催日の決め方（優先順）:
//   1. 環境変数 EVENT_DATE（YYYY-MM-DD）。テストで日付を変えたいときはこれを使う。
//      EVENT_DATE=any にするとゲート無効（通しテスト用。テスト後は必ず消すこと）。
//   2. 未設定なら CURRENT_EVENT_ID（例: 0927 = 9月27日）から今年の日付を組み立てる。
//   3. どちらも無ければゲート無し。
function eventGateInfo() {
  // 「2026/09/27」のように書かれても黙って無視しないよう、区切りを揃えてから判定する
  const raw = String(process.env.EVENT_DATE || "").trim().toLowerCase().replace(/\//g, "-");
  const today = jstToday();
  if (raw === "any") {
    return { ok: true, today, target: "any", source: "EVENT_DATE", message: null };
  }

  let target = raw;
  let source = "EVENT_DATE";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    const m = /^(\d{2})(\d{2})$/.exec(String(process.env.CURRENT_EVENT_ID || "").trim());
    // 開催日を決められない → ゲート無し
    if (!m) return { ok: true, today, target: null, source: null, message: null };
    target = `${today.slice(0, 4)}-${m[1]}-${m[2]}`;
    source = "CURRENT_EVENT_ID";
  }

  if (today === target) return { ok: true, today, target, source, message: null };
  const [, mm, dd] = target.split("-");
  return {
    ok: false,
    today,
    target,
    source,
    message: `本日は開催日（${Number(mm)}月${Number(dd)}日）ではないため入場受付できません。テストの場合は Vercel の環境変数 EVENT_DATE を今日の日付（${today}）にして再デプロイしてください。`,
  };
}

function eventDateGateError() {
  const info = eventGateInfo();
  return info.ok ? null : info.message;
}

// orders.line_items（jsonb）からチケット名を取り出す（type='ticket' の先頭の商品名）
function ticketNameOf(order) {
  const items = Array.isArray(order && order.line_items) ? order.line_items : [];
  const ticket = items.find((i) => i && i.type === "ticket");
  return (ticket && ticket.name) || (items[0] && items[0].name) || "";
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("admin-checkin: Supabaseの環境変数が未設定です");
    res.status(500).json({ error: "サーバー側の設定が完了していません" });
    return;
  }
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    // トークンはヘッダーのみで受け取る（URLの ?token= はアクセスログに残るため受け付けない）。
    const token = req.headers["x-admin-token"];
    if (!verifyAdminToken(token, "checkin")) {
      res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
      return;
    }

    // ?lookup=... のときは「お名前・メールアドレスから購入を探す」モード。
    // 当日、来場者がコードを出せない（携帯の充電切れ、メールが見つからない等）ときに
    // 受付で本人を特定するために使う。まだ入場していない人も対象にする点が
    // 下のチェックイン一覧との違い。
    const lookup = typeof req.query.lookup === "string" ? req.query.lookup.trim() : "";
    if (lookup) {
      try {
        if (lookup.length < 2) { res.status(200).json({ results: [] }); return; }

        // 1人1コード方式：コード（entry_passes）1枚ずつが検索結果の1行になる。
        // 無効化済み（revoked）の行もあえて含める。除外すると、該当の方が受付に来て
        // お名前で検索したときに「該当なし」としか出ず、受付は「入力ミスなのか、
        // そもそも買っていないのか、無効化されたのか」を判断できない。
        // 行としては出したうえで状態を明示し、入場ボタンは押せなくする。
        const { data: rows, error: lookupErr } = await serviceClient
          .from("entry_passes")
          .select("id, code, status, checked_in_at, user_id, orders ( line_items, status, order_number )")
          .like("code", eventCodePrefix() + "%")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (lookupErr) { console.error("admin-checkin lookup failed:", lookupErr.message); res.status(500).json({ error: "検索に失敗しました" }); return; }

        const paidRows = (rows || []).filter((p) => p.orders && p.orders.status === "paid");
        const users = await resolveUsers(serviceClient, paidRows.map((p) => p.user_id));
        const q = lookup.toLowerCase();
        const results = paidRows
          .map((p) => {
            const u = users.get(p.user_id);
            return {
              passId: p.id,
              entryCode: p.code,
              ticketName: ticketNameOf(p.orders),
              orderNumber: (p.orders && p.orders.order_number) || "",
              buyerEmail: (u && u.email) || "（不明）",
              buyerName: (u && u.name) || "",
              checkedInAt: p.checked_in_at,
              revoked: p.status !== "valid",
            };
          })
          .filter(
            (r) =>
              r.buyerName.toLowerCase().includes(q) ||
              r.buyerEmail.toLowerCase().includes(q) ||
              String(r.entryCode || "").toLowerCase().includes(q) ||
              String(r.orderNumber || "").toLowerCase().includes(q)
          )
          .slice(0, 30);

        res.status(200).json({ results });
      } catch (err) {
        console.error("admin-checkin lookup handler error:", err);
        res.status(500).json({ error: "サーバー内部でエラーが発生しました" });
      }
      return;
    }

    try {
      const { data, error } = await serviceClient
        .from("entry_passes")
        .select("id, code, checked_in_at, user_id, orders ( line_items )")
        .not("checked_in_at", "is", null)
        // 前回までのイベントのチェックインが混ざると、今回の分が上限に押し出されて
        // 一覧から消える（＝取り消せなくなる）ので、今回のイベントのコードだけに絞る。
        .like("code", eventCodePrefix() + "%")
        .order("checked_in_at", { ascending: false })
        .limit(1000);
      if (error) { console.error("admin-checkin list failed:", error.message); res.status(500).json({ error: "読み込みに失敗しました" }); return; }

      const userByUserId = await resolveUsers(serviceClient, (data || []).map((p) => p.user_id));
      const checkins = (data || []).map((p) => {
        const u = userByUserId.get(p.user_id);
        return {
          id: p.id, // 取り消しに使うのは「このコード1枚」のID
          entryCode: p.code,
          ticketName: ticketNameOf(p.orders),
          buyerEmail: (u && u.email) || "（不明）",
          buyerName: (u && u.name) || "",
          checkedInAt: p.checked_in_at,
        };
      });
      // 受付が「今日この端末で入場を通せるのか」を、列ができる前に確認できるようにする。
      // テストのために設定した EVENT_DATE を消し忘れたまま当日を迎えると、
      // 最初のお客様をスキャンした瞬間に初めて気づくことになるため。
      res.status(200).json({ checkins, gate: eventGateInfo() });
    } catch (err) {
      console.error("admin-checkin GET handler error:", err);
      res.status(500).json({ error: "サーバー内部でエラーが発生しました" });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "このメソッドは対応していません" });
    return;
  }

  const { code, token, undo, id, requestId } = req.body || {};
  if (!verifyAdminToken(token, "checkin")) {
    res.status(401).json({ error: "認証が切れました。もう一度パスワードを入力してください" });
    return;
  }

  try {
    if (undo) {
      // スタッフの誤操作（間違ったコードを読み取ってチェックインしてしまった等）を取り消す。
      // 取り消すのは「そのコード1枚」の入場記録だけ。
      if (!id) { res.status(400).json({ error: "idが必要です" }); return; }
      const { data: undone, error } = await serviceClient.rpc("undo_pass", { p_pass_id: id });
      if (error) { console.error("admin-checkin undo failed:", error.message); res.status(500).json({ error: "取り消しに失敗しました" }); return; }
      const undoneRow = Array.isArray(undone) ? undone[0] : undone;
      res.status(200).json({ ok: true, undone: !!undoneRow });
      return;
    }

    // 開催日当日以外は入場を受け付けない（取り消し・一覧・検索は日付に関係なく使える）。
    const gateError = eventDateGateError();
    if (gateError) {
      res.status(403).json({ error: gateError });
      return;
    }

    // 記号以外を取り除いてから照合する。スタッフが手入力するとき、
    // 区切りのハイフンを抜いたり空白を入れたりしがちなため（TFM 0927 1 7K4M 等）。
    const normalize = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const entryCode = String(code || "").trim().toUpperCase();
    if (!entryCode) {
      res.status(400).json({ error: "コードを入力してください" });
      return;
    }

    // 今回のイベントのコードか確認する。これが無いと、前回のイベントで買って
    // 使わなかったコード（または取り消されたコード）が次のイベントでもそのまま通ってしまう。
    const eventId = String(process.env.CURRENT_EVENT_ID || "").trim();
    if (eventId && !normalize(entryCode).startsWith(normalize(`TFM-${eventId}-`))) {
      res.status(404).json({ error: "今回のイベントの受付コードではありません" });
      return;
    }

    // 入力ゆれを吸収するため、まずはそのまま、見つからなければ記号を無視して探す。
    let matchedCode = entryCode;
    const { data: exact } = await serviceClient
      .from("entry_passes")
      .select("code")
      .eq("code", entryCode)
      .maybeSingle();

    if (!exact) {
      const target = normalize(entryCode);
      const { data: candidates } = await serviceClient
        .from("entry_passes")
        .select("code")
        // 今回のイベントのコードだけに絞る。絞らないと、過去イベントも含めた全行を
        // 取りに行き、Supabase既定の1000行上限に達した時点で「有効なのに見つからない」
        // が起きうる（しかも件数が増えるまで誰も気づけない）。
        .like("code", eventCodePrefix() + "%")
        .limit(2000);
      const hit = (candidates || []).find((row) => normalize(row.code) === target);
      if (!hit) {
        res.status(404).json({ error: "そのコードの購入が見つかりませんでした（支払い未完了、または無効なコードです）" });
        return;
      }
      matchedCode = hit.code;
    }

    // 入場の判定・記録はDBの関数の中で行ロック付きで行う。
    // ここで「読んでから書く」をやると、受付が複数台あるときに同じコードを
    // 同時に読んで両方入場させてしまうため（supabase/schema.sql の checkin_pass 参照）。
    const { data: result, error: checkinErr } = await serviceClient.rpc("checkin_pass", {
      p_code: matchedCode,
      // 同じ読み取りを通信のやり直しで2回送っても二重に処理しないための目印
      p_request_id: typeof requestId === "string" && requestId ? requestId.slice(0, 64) : null,
    });
    if (checkinErr) { console.error("checkin_pass failed:", checkinErr.message); res.status(500).json({ error: "記録に失敗しました" }); return; }

    const row = Array.isArray(result) ? result[0] : result;
    if (!row) {
      // コードは entry_passes に存在するのに入場処理が通らなかった
      // ＝ 無効化済み（revoked）／支払いがキャンセル・失敗／支払い未完了、のいずれか。
      //
      // ここで「そのコードは無効です」とだけ返すと、受付は目の前のお客様に何が
      // 起きているのか説明できず、お客様も納得できないまま列が止まる。
      // 誰の・どのチケットが・なぜ通らないのかまで調べて返す。
      const { data: diag } = await serviceClient
        .from("entry_passes")
        .select("code, status, user_id, orders ( line_items, status )")
        .eq("code", matchedCode)
        .maybeSingle();

      const orderStatus = (diag && diag.orders && diag.orders.status) || null;
      let reason = "invalid";
      let message = "そのコードは確認できませんでした。購入内容をご確認ください。";
      if (diag && diag.status !== "valid") {
        reason = "refunded";
        message = "この受付コードは無効化されています（返金等）。ご入場いただけません。";
      } else if (orderStatus === "failed") {
        reason = "canceled";
        message = "この購入はお支払いがキャンセル、または失敗しています。ご入場いただけません。";
      } else if (orderStatus === "pending") {
        reason = "unpaid";
        message = "この購入はお支払いが完了していません。ご入場いただけません。";
      }

      let buyerEmail = "";
      let buyerName = "";
      if (diag && diag.user_id) {
        const { data: diagUser } = await serviceClient.auth.admin.getUserById(diag.user_id);
        const u = diagUser && diagUser.user;
        const meta = (u && u.user_metadata) || {};
        buyerEmail = (u && u.email) || "";
        buyerName = meta.full_name || meta.name || meta.display_name || "";
      }

      res.status(404).json({
        error: message,
        reason,
        code: matchedCode,
        ticketName: diag ? ticketNameOf(diag.orders) : "",
        buyerEmail,
        buyerName,
      });
      return;
    }

    const { data: userRes } = await serviceClient.auth.admin.getUserById(row.user_id);
    const u = userRes && userRes.user;
    const meta = (u && u.user_metadata) || {};
    const buyerEmail = (u && u.email) || "（不明）";
    const buyerName = meta.full_name || meta.name || meta.display_name || "";

    res.status(200).json({
      alreadyCheckedIn: !row.admitted,
      id: row.pass_id,
      code: row.code,
      ticketName: row.ticket_name,
      buyerEmail,
      buyerName,
      checkedInAt: row.checked_in_at,
      groupTotal: row.group_total,
      groupUsed: row.group_used,
    });
  } catch (err) {
    console.error("admin-checkin handler error:", err);
    res.status(500).json({ error: "サーバー内部でエラーが発生しました" });
  }
};
