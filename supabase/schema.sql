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
