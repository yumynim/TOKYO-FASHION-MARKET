// ==========================================================
// ★ Supabaseプロジェクトを作成したら、ここを書き換えてください
// ==========================================================
//
// この2つの値は「anon / public key」なので、フロントのコードに
// 書いても問題ありません（Supabase側のRLS = Row Level Security で
// データを守る設計が前提です）。
//
// 【絶対にここに書いてはいけないもの】
//   ・service_role key（管理者権限のキー）
//   ・Square の Access Token
//   → これらは /api 配下（サーバー側）でのみ、Vercelの環境変数として使います。
//
// 値の取得場所: Supabase ダッシュボード → Project Settings → API
//   Project URL      → SUPABASE_URL
//   anon public key  → SUPABASE_ANON_KEY

const SUPABASE_URL = "https://ubiwxziuynjywvqkbevx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__T5KFupQfeOotH_KHNtV7w_vi0-pJs2";
