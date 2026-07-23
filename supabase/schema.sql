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
  user_id uuid not null,
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
