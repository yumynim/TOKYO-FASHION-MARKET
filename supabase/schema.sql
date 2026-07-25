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
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_square_order_id_idx on public.orders (square_order_id);
create index if not exists orders_user_id_idx on public.orders (user_id);

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

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
