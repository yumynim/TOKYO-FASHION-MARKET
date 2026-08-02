// ==========================================================
// GET /api/env-check
// ---------------------------------------------------------
// 必要な環境変数が「設定されているかどうか」だけを true/false で返す診断用エンドポイント。
// 値そのものは絶対に返さない（設定有無の確認のみ）。
//
// 使いどころ:
//   - Vercelの環境変数を設定→Redeployした後、本当に反映されたかブラウザで開いて確認する
//   - 「設定したはずなのに動かない」時に、別のVercelプロジェクトを編集していた等の
//     取り違えを切り分ける（VERCEL_URL / VERCEL_GIT_COMMIT_SHA でどのデプロイが
//     このドメインに紐づいているかも分かる）
// ==========================================================

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "許可されていないメソッドです。" });
    return;
  }

  res.status(200).json({
    supabase: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    square: {
      SQUARE_ACCESS_TOKEN: !!process.env.SQUARE_ACCESS_TOKEN,
      SQUARE_LOCATION_ID: !!process.env.SQUARE_LOCATION_ID,
      SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT || "(未設定)",
      SQUARE_WEBHOOK_SIGNATURE_KEY: !!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    },
    resend: {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: !!process.env.RESEND_FROM_EMAIL,
      RESEND_SEND_ENABLED: process.env.RESEND_SEND_ENABLED === "true",
    },
    console: {
      ADMIN_CONSOLE_PASSWORD: !!process.env.ADMIN_CONSOLE_PASSWORD,
      CONTACT_TO_EMAIL: !!process.env.CONTACT_TO_EMAIL,
    },
    site: {
      SITE_URL: process.env.SITE_URL || "(未設定)",
    },
    deploy: {
      VERCEL_URL: process.env.VERCEL_URL || "(不明)",
      VERCEL_ENV: process.env.VERCEL_ENV || "(不明)",
      VERCEL_GIT_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "(不明)",
    },
  });
};
