# TOKYO FASHION MARKET（TFM）— Claude 作業ルール

このファイルは Claude Code がセッション開始時に自動で読み込む**恒久ルール集**です。
恒久的な指示だけを簡潔に書きます（肥大化させない）。
**現在地・やることリスト・作業ログは `docs/PROJECT_STATE.md`** に書きます（このファイルには書かない）。

---

## 🔴 最重要：記憶の引き継ぎ

ユーザーが `/clear` すると会話履歴が消え、Claude は前回の記憶を失う。
そのため**作業の状態は必ずファイルに残す**。

### 作業開始時に必ず確認すること
1. **`docs/PROJECT_STATE.md` を読む**（現在地・未完了作業・既知の不具合・次にやること）
2. 関連する既存実装を読む（推測で実装しない。特に `js/data.js` と `api/_catalog.js` の対応関係）
3. 大きな変更前は `git status` / `git diff` で未コミットの変更を把握する

### 作業完了時に必ず実行すること
1. 変更をブラウザで確認する（`python3 -m http.server 4173` で目視、`/api` はVercel環境かローカルの`vercel dev`）
2. **`docs/PROJECT_STATE.md` を更新する** — 以下を反映:
   - 今回変更した内容 / 変更したファイル
   - 完了した作業 / 未完了の作業
   - 新しく決まった仕様 / 発生している問題
   - 次に行うべき作業 / 最終更新日
3. 古くなった記述は消して現在の正しい状態にする。
   ただし**重要な決定事項は理由とともに残す**。
4. **やることリスト（TODO）は絶対に消さない**。完了したら「完了済み」へ移すだけ。

> ユーザーが `clear` / `compact` / セッション終了 / 引き継ぎに言及したら、
> 応答を終える前に必ず `docs/PROJECT_STATE.md` を更新すること。
> 会話が長くなったら、いきなり `/clear` せず `/compact` を先に使うよう勧める。

---

## プロジェクトの目的

ファッションインフルエンサーが集う、東京のPOPUP・フリーマーケットの公式サイト。
ビルド不要の静的HTML/CSS/JS（サイト本体）＋ ログイン・決済のみ Vercel Serverless Functions。

- 本番URL（現状は仮ドメイン）: **https://tokyo-fashion-market.vercel.app**
  独自ドメイン確定時は `README.md`「SEO / 公開ドメインについて」の手順で一括置換が必要
- クライアント向けの仕様確定は `要件確認ヒアリングシート.docx`、素材収集は `指示テンプレート.txt`

## 使用している主要な技術

静的 HTML/CSS/JS（ビルド不要）/ Supabase Auth（Google・メールログイン）/
Square（決済リンク作成）/ Vercel（ホスティング + Serverless Functions）

## 必ず守る開発ルール

- 既存のコード・命名規則・コメント密度・UIのトーン（モノクロ基調）に合わせる
- 推測だけで実装しない。既存実装を確認してから変更する
- dev サーバーは Bash で起動せず、プレビュー用ツールを使う
- フロントの編集にビルドは不要。編集後はブラウザ再読み込みで確認できる

## 変更してはいけない重要な仕様

以下は**壊すと決済・法務・SEOに直結する**。変更する場合は理由を PROJECT_STATE に残すこと。

- **`js/data.js`（価格）を変更したら `api/_catalog.js` も必ず同時に更新する**。
  決済で使われる金額は `api/_catalog.js` が正。フロントの表示だけ変えると金額不一致になる
- **`js/config.js` に `service_role key` / Square の Access Token を書かない**。
  これらはサーバー専用で、Vercel の環境変数（`/api` 配下からのみ参照）にのみ置く
- **`/api/checkout` はクライアントから送られた金額を信用しない**。
  必ずサーバー側カタログ（`api/_catalog.js`）から価格を取得する（改ざん対策）
- **`/api/checkout` は Supabase アクセストークンをサーバー側で毎回再検証する**
  （フロントのログイン確認だけを信用しない設計を崩さない）
- **注文確定・購入確認メールは Square Webhook（`api/webhooks/square.js`）経由でのみ行う**。
  `checkout-complete.html` の表示だけで「支払い完了」と判断しない（URLを直接開いても表示されてしまうため）。
  `/api/order-status` のポーリング結果（Supabase `orders` テーブルの `status`）を正とする
- **`api/webhooks/square.js` は Square の署名（`SQUARE_WEBHOOK_SIGNATURE_KEY`）を必ず検証する**。
  検証をスキップしたり、生ボディ以外（パース後の再シリアライズ等）で検証しない
- **確認メールの二重送信防止は `orders.status = 'pending'` の行だけを対象にした条件付きUPDATE**で行っている。
  Webhookの重複配信を前提に設計されているため、この条件を外さない
- `js/vendor/supabase.min.js` は CSP（`script-src 'self'`）を保つための自己ホスト。
  CDN読み込みに戻さない
- **`orders` テーブルは RLS を有効化しポリシーを作らない**（anon/authenticatedから常に不可視）。
  クライアントからの直接アクセスを許可するポリシーを追加しない。参照は必ず `/api` 配下（service_role）経由

## セキュリティ上の注意事項

- **秘密情報を Git にコミットしない**。`.env` はコミット禁止（`.gitignore`で除外済み）。
  ログや画面に APIキー・トークンを出力しない
- `SUPABASE_SERVICE_ROLE_KEY` / `SQUARE_ACCESS_TOKEN` はサーバー側（`/api`配下）のみ。
  クライアントに渡さない
- `vercel.json` の CSP（`script-src 'self'`）を維持する。インラインスクリプトを追加しない
- ユーザーの入力・外部から来た値をそのまま HTML に挿入しない

## ドキュメントの役割分担

| ファイル | 役割 |
|---|---|
| `CLAUDE.md`（本ファイル） | 恒久ルールのみ。作業履歴は書かない |
| `docs/PROJECT_STATE.md` | 現在地・やることリスト・作業ログ・既知の不具合。**毎回更新** |
| `README.md` | 人間向け。環境構築・起動方法・設定手順（Supabase/Square/Vercel） |
| `要件確認ヒアリングシート.docx` | クライアント記入用の仕様確定シート |
| `指示テンプレート.txt` | クライアント記入用の文章・写真収集テンプレート |
