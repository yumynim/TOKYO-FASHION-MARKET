-- ==========================================================
-- orders テーブル — 注文の確定管理・購入完了メールのための唯一の情報源
--
-- 使い方: Supabaseダッシュボード → SQL Editor に貼り付けて実行してください。
-- マイグレーションツールは使っていない小規模プロジェクトのため、
-- 変更が必要な場合はこのファイルを直接書き換えて再実行する運用とします
-- （既存テーブルがある場合は ALTER 文を別途書くこと。DROPしない）。
--
-- 参照:
--   api/checkout.js        … 決済リンク作成時に status='pending' で1行INSERT
--   api/webhooks/square.js … Square Webhookで支払い確認後、status='paid'に更新しメール送信
--   api/order-status.js    … checkout-complete.html がポーリングして結果を表示
-- ==========================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  buyer_email text,
  square_order_id text unique,
  square_payment_id text,
  line_items jsonb not null,
  amount_total integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  order_number text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_square_order_id_idx on public.orders (square_order_id);
create index if not exists orders_user_id_idx on public.orders (user_id);

-- ==========================================================
-- orders.order_number — 購入者向けの識別番号（例: TFM-20260802-A1B2）
--
-- 内部的にはUUID（id）で管理しているが、問い合わせ対応時に購入者へ口頭/メールで
-- 伝えやすい短い番号を別途持たせる。api/checkout.js が注文作成時に生成してINSERTする。
-- 既存テーブルに対しては下のALTERで追加する（create table部分は新規構築時のみ有効なため）。
-- ==========================================================
alter table public.orders add column if not exists order_number text unique;

-- ==========================================================
-- orders.entry_code — 当日の入場受付コード（例: TFM-20260802-7K4M）
--
-- order_number（注文作成時に発行、問い合わせ用の識別番号）とは別物。
-- こちらは「支払いが確定した時点」でapi/webhooks/square.jsが発行する、当日の入場確認用コード。
-- FAQ（index.html）で案内している「入場方法」に対応する（受付でこのコードを提示してもらう運用）。
-- ==========================================================
alter table public.orders add column if not exists entry_code text;

create unique index if not exists orders_entry_code_key
  on public.orders (entry_code)
  where entry_code is not null;

comment on column public.orders.entry_code is '当日の入場受付コード（支払い完了時にWebhook側で発行）。order_numberとは別物。';

-- RLS を有効化した上でポリシーを一切作らない = anon/authenticated からは常に不可視。
-- このテーブルへの読み書きは全て service_role（サーバー側 /api のみ）から行う設計。
alter table public.orders enable row level security;

-- ==========================================================
-- notifications テーブル — アプリ内通知（購入確認など）
--
-- orders と違い、本人がブラウザから直接読む前提のテーブルなので、
-- 「本人の行だけ read/update 可」という RLS ポリシーを付ける。
-- 作成（insert）は service_role 限定とし、authenticated 向けの insert/delete ポリシーは作らない
-- （ユーザーが自分に通知をでっち上げたり、他人の通知を操作できないようにするため）。
--
-- 参照:
--   api/webhooks/square.js … 支払い確定時（orders.status を paid にできた時）に1行INSERT
--   js/notifications.js    … ログイン中のユーザーが自分の通知一覧を取得・既読化
-- ==========================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_order_id uuid references public.orders(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- create policy には if not exists が無く、2回目の実行で「already exists」エラーになる。
-- このファイルは「全体を何度実行しても安全」にしたいので、drop→create のセットにしている
-- （中身は同じポリシーを作り直しているだけで、動作は変わらない）。
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ==========================================================
-- notifications.body_html — 管理コンソールのブロックエディタ用
--
-- お知らせ配信（/console）はブロック（見出し・画像・ボタン等）を組み立てて
-- メールとサイト内通知の両方に反映する。プレーンテキスト版は既存の body に、
-- 画像等を含むHTML版はこの列に保存する。null の場合は body（プレーンテキスト）を表示する
-- （購入確認通知など、ブロックを使わない従来の通知は body_html が常に null のまま）。
--
-- 参照:
--   api/admin-announcements.js … 投稿時に renderBlocks().html をここに保存
--   js/notifications.js        … body_html があればそれを、無ければ body を表示
-- ==========================================================
alter table public.notifications add column if not exists body_html text;

-- ==========================================================
-- announcements テーブル — 会員全員向けのお知らせ（運営からの一斉告知）
--
-- notifications（本人だけに届く）と違い、ログイン中の会員なら誰でも読める。
-- 投稿・削除は必ず /api/admin-announcements（service_role経由）から行う設計のため、
-- insert/update/delete のポリシーは意図的に作らない。
--
-- 参照:
--   api/admin-announcements.js … 「全員宛て」投稿時にここへINSERT
--   js/notifications.js        … ヘッダー通知パネルの「TFMからのお知らせ」タブで表示
-- ==========================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  body_html text,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
  on public.announcements for select
  using (auth.role() = 'authenticated');

-- ==========================================================
-- inquiries テーブル — お問い合わせフォーム（/api/contact）の送信内容
--
-- orders と同じ考え方で、クライアント（anon key）からの直接アクセスは一切許可しない。
-- 保存は api/contact.js が、一覧取得・返信の記録は api/admin-inquiries.js が、
-- どちらも service_role 経由でのみ行う。
--
-- status: 'new'（未返信） / 'replied'（/console から返信済み）
-- ==========================================================

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'replied')),
  reply_body text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.inquiries enable row level security;

-- ==========================================================
-- entry_passes テーブル — 当日の入場受付コード（1行＝1人分）
--
-- これまでは orders.entry_code（1回の注文＝1コード）だったが、
-- まとめ買い（数量2以上）のとき1つのQRを人数分読み回すことになり、
-- 読み間違い・数え間違いの温床になるため「1コード＝1人＝1回入場」方式に変更。
-- 数量2で買ったら別々のコードを2つ発行する（DRESS CODE TOKYOで実証済みの方式）。
--
-- 参照:
--   api/webhooks/square.js … 支払い確定時に issue_entry_passes() で数量分を発行
--   api/admin-checkin.js   … /checkin（当日受付）が checkin_pass() / undo_pass() で入場記録
--   api/my-orders.js       … マイページの購入履歴に本人のコードを表示
-- ==========================================================

create table if not exists public.entry_passes (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  user_id             uuid not null,
  code                text not null unique,
  status              text not null default 'valid' check (status in ('valid', 'revoked')),
  checked_in_at       timestamptz,
  checkin_request_id  text,
  created_at          timestamptz not null default now()
);

comment on table public.entry_passes is '入場権。1行＝1人分。まとめ買いすると注文1件に対して数量分の行ができる。';
comment on column public.entry_passes.code is '受付コード（TFM-イベント-連番-ランダム4文字）。1コード1回しか入場できない。';
comment on column public.entry_passes.status is 'revoked = 返金などで無効化済み。無効化されたコードでは入場できない。';
comment on column public.entry_passes.checkin_request_id is 'この入場を確定させた読み取りのID。通信のやり直しで二重処理しないために使う。';

create index if not exists entry_passes_order_id_idx on public.entry_passes (order_id);
create index if not exists entry_passes_user_id_idx on public.entry_passes (user_id);

-- 会員は自分のコードを見るだけ（マイページに表示するため）。書き込みはサーバーのみ。
alter table public.entry_passes enable row level security;

drop policy if exists "entry_passes_select_own" on public.entry_passes;
create policy "entry_passes_select_own" on public.entry_passes
  for select using (auth.uid() = user_id);

-- Supabaseは新しいテーブルに全権限を配ってしまうので、書き込み系は明示的に取り上げる
revoke insert, update, delete on public.entry_passes from anon, authenticated;
revoke all on public.entry_passes from public;
grant select on public.entry_passes to authenticated;
grant all on public.entry_passes to service_role;

-- ==========================================================
-- entry_code_counters テーブル — 受付コードの連番管理
--
-- イベントID（例: 0927）ごとに「次に発行する番号」を持つ。
-- next_entry_seq() で「現在の番号を返しつつ次へ進める」処理をアトミックに行う
-- （同時に複数の決済が完了しても番号が重複しない）。
-- 新しいイベントIDを使えば1番から自動的に再スタートする。
-- ==========================================================

create table if not exists public.entry_code_counters (
  event_id text not null,
  category text not null,
  next_seq int not null default 1,
  primary key (event_id, category)
);

comment on table public.entry_code_counters is 'イベントIDごとの、次に発行する受付番号のカウンター。categoryは将来の種別分け用（現状は常にN）。';

-- service_role専用（ordersと同じ考え方：RLS有効化のみ、ポリシー無しで全面ブロック）
alter table public.entry_code_counters enable row level security;

create or replace function public.next_entry_seq(p_event text, p_category text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  insert into public.entry_code_counters (event_id, category, next_seq)
  values (p_event, p_category, 2)
  on conflict (event_id, category)
  do update set next_seq = public.entry_code_counters.next_seq + 1
  returning next_seq - 1 into v_seq;
  return v_seq;
end;
$$;

-- ==========================================================
-- 受付コードの発行・入場・取り消し関数
--
-- すべて行ロック付きで多重実行に安全（受付が複数台あっても、Webhookが重複配信されても、
-- 二重発行・二重入場カウントにならない）。呼び出しは service_role のみに許可する。
-- ==========================================================

-- ---------- 発行 ----------
-- Squareの決済完了Webhook（api/webhooks/square.js）から呼ぶ。
-- 注文行をロックしてから発行するので、同じ通知が再送されて2つの処理が同時に走っても
-- 二重発行にならない（2つ目は既に発行済みのコードをそのまま返す）。
drop function if exists public.issue_entry_passes(uuid, text, int);

create or replace function public.issue_entry_passes(p_order_id uuid, p_event text, p_quantity int)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_seq int;
  v_code text;
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTWXYZ'; -- 0/O, 1/I/L, U/V を除いた29文字
  v_bytes bytea;
  v_suffix text;
  v_done boolean;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'paid' then
    return; -- 支払い済みでない注文には発行しない
  end if;

  -- 既に発行済みなら、それをそのまま返す（Webhook再送への対応）。
  -- 並び順は「短いコードが先」＝連番の数字順（文字列順だと 10 が 2 より前に来てしまう）。
  if exists (select 1 from public.entry_passes ep where ep.order_id = p_order_id) then
    return query
      select ep.code from public.entry_passes ep
       where ep.order_id = p_order_id
       order by length(ep.code), ep.code;
    return;
  end if;

  if coalesce(p_quantity, 0) < 1 then
    return;
  end if;

  for n in 1..least(p_quantity, 400) loop
    select public.next_entry_seq(p_event, 'N') into v_seq;

    -- ランダム4文字。gen_random_uuid() のバイト列から作る（暗号学的に強い乱数源）。
    -- ユニーク制約と衝突したらランダム部分だけ引き直す。
    v_done := false;
    for attempt in 1..5 loop
      v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      v_suffix := '';
      for i in 0..3 loop
        v_suffix := v_suffix || substr(v_alphabet, (get_byte(v_bytes, i) % 29) + 1, 1);
      end loop;
      v_code := format('TFM-%s-%s-%s', p_event, v_seq, v_suffix);
      begin
        insert into public.entry_passes (order_id, user_id, code)
        values (p_order_id, v_order.user_id, v_code);
        v_done := true;
        exit;
      exception when unique_violation then
        -- 引き直して再挑戦
      end;
    end loop;
    if not v_done then
      raise exception 'entry code collision: could not generate a unique code for order %', p_order_id;
    end if;
  end loop;

  return query
    select ep.code from public.entry_passes ep
     where ep.order_id = p_order_id
     order by length(ep.code), ep.code;
end;
$$;

-- ---------- 入場 ----------
-- 1コード1回。2回目以降は admitted = false（入場済み）を返す。
-- 同じ読み取りのやり直し（p_request_id が一致）だけは、前回の結果をそのまま返す。
create or replace function public.checkin_pass(p_code text, p_request_id text default null)
returns table (
  pass_id uuid,
  order_id uuid,
  user_id uuid,
  ticket_name text,
  code text,
  checked_in_at timestamptz,
  admitted boolean,
  group_total int,
  group_used int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.entry_passes%rowtype;
  v_ticket text;
  v_admitted boolean := false;
  v_total int;
  v_used int;
begin
  -- 行ロック。受付が複数台で同時に同じコードを読んでも、順番に処理される。
  select ep.* into v_pass
    from public.entry_passes ep
    join public.orders o on o.id = ep.order_id
   where ep.code = p_code
     and ep.status = 'valid'
     and o.status = 'paid'
   for update of ep;

  if not found then
    return; -- 0行 → 呼び出し側で「無効なコード」として扱う
  end if;

  -- チケット名は orders.line_items（jsonb）から取り出す（type='ticket' の先頭の商品名）
  select li->>'name' into v_ticket
    from public.orders o, jsonb_array_elements(o.line_items) li
   where o.id = v_pass.order_id and li->>'type' = 'ticket'
   limit 1;

  if v_pass.checked_in_at is null then
    update public.entry_passes ep
       set checked_in_at = now(),
           checkin_request_id = p_request_id
     where ep.id = v_pass.id
     returning * into v_pass;
    v_admitted := true;
  elsif p_request_id is not null and v_pass.checkin_request_id = p_request_id then
    v_admitted := true; -- 同じ読み取りのやり直し。二重入場ではない
  end if;

  -- 同じ注文の残り枚数（受付で「同行者の分があと◯枚」を出すため）
  select count(*)::int, count(ep.checked_in_at)::int
    into v_total, v_used
    from public.entry_passes ep
   where ep.order_id = v_pass.order_id
     and ep.status = 'valid';

  return query select
    v_pass.id, v_pass.order_id, v_pass.user_id, v_ticket,
    v_pass.code, v_pass.checked_in_at, v_admitted, v_total, v_used;
end;
$$;

-- ---------- 取り消し ----------
-- スタッフの誤操作（間違ったコードを読み取ってしまった等）を戻す。取り消すのはそのコード1枚分だけ。
create or replace function public.undo_pass(p_pass_id uuid)
returns table (pass_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.entry_passes%rowtype;
begin
  select * into v_pass from public.entry_passes ep where ep.id = p_pass_id for update;
  if not found then
    return;
  end if;

  update public.entry_passes ep
     set checked_in_at = null,
         checkin_request_id = null
   where ep.id = v_pass.id
   returning * into v_pass;

  return query select v_pass.id, v_pass.code;
end;
$$;

-- ---------- 権限 ----------
-- 3関数とも呼べるのはサーバー（service_role）だけ。クライアントからRPCで直接叩けないようにする。
revoke execute on function public.next_entry_seq(text, text)              from public, anon, authenticated;
revoke execute on function public.issue_entry_passes(uuid, text, int)     from public, anon, authenticated;
revoke execute on function public.checkin_pass(text, text)                from public, anon, authenticated;
revoke execute on function public.undo_pass(uuid)                         from public, anon, authenticated;

grant execute on function public.next_entry_seq(text, text)               to service_role;
grant execute on function public.issue_entry_passes(uuid, text, int)      to service_role;
grant execute on function public.checkin_pass(text, text)                 to service_role;
grant execute on function public.undo_pass(uuid)                          to service_role;

-- ---------- 旧方式（orders.entry_code）で発行済みのコードを新テーブルへ移す ----------
-- 過去に発行された分（テスト購入など）を1件ずつ移す。旧方式のまとめ買い
-- （1コードで複数人分）は移行後「1コード1回」になるが、該当する本番販売はまだ無い前提。
insert into public.entry_passes (order_id, user_id, code)
select o.id, o.user_id, o.entry_code
  from public.orders o
 where o.status = 'paid'
   and o.entry_code is not null
   and not exists (select 1 from public.entry_passes ep where ep.code = o.entry_code);
