# TOKYO FASHION MARKET プロジェクト現況

> このファイルは「今どこまで進んでいるか」「次に何をやるか」を残す作業メモ。
> Claude は**作業開始前に必ず読み**、**作業終了前に必ず更新する**（ルールは `CLAUDE.md`）。
> 恒久ルールはここに書かない（それは `CLAUDE.md`）。

---

# プロジェクト概要

ファッションインフルエンサーが集う、東京のPOPUP・フリーマーケットの公式サイト「TOKYO FASHION MARKET（TFM）」。
サイト本体はビルド不要の静的HTML/CSS/JS。ログイン（Supabase Auth）と決済（Square）だけ
`/api` 配下の Vercel Serverless Functions（Node）で処理する。

- 現状URL（仮ドメイン）: **https://tokyo-fashion-market.vercel.app**
- 独自ドメイン未確定。確定後は `README.md`「SEO / 公開ドメインについて」の手順で一括置換が必要
- クライアント向け仕様確定用に `要件確認ヒアリングシート.docx`、素材収集用に `指示テンプレート.txt` を用意済み

# 現在の構成

```
TOKYO-FASHION-MARKET/
├── CLAUDE.md                 # Claude用の恒久ルール
├── README.md                 # 人間向け（構成・設定手順・セキュリティ）
├── index.html                 # トップ（ヒーロー/チケット/グッズ/NEWS/開催紹介/会社/FAQ/問い合わせ）
├── goods.html                 # グッズ販売（チェキ商品グリッド）
├── hagi.html                  # 企業理念・運営者情報・メンバー・スポンサー
├── event.html                 # 過去のイベント一覧
├── tokushoho.html              # 特定商取引法に基づく表示
├── checkout-complete.html      # Square決済完了後の戻り先
├── influencer-casting.html, members.html, news.html, oubo-form.html,
│   recruit.html, sample-sale.html, sdgs.html, sponsorship.html,
│   volunteer.html              # その他ページ（採用・ボランティア・SDGs・協賛LP等）
├── 404.html
├── css/style.css               # モノクロテーマ（全ページ共通、:root で基調色を一括管理）
├── js/
│   ├── data.js                 # ★最も編集頻度が高い（イベント/商品/ニュース/FAQ等のデータ）
│   ├── layout.js                # 共通ヘッダー/フッター注入・ナビ（通知ベルのHTMLもここで注入）
│   ├── config.js                # Supabase接続先（公開してよい値のみ）
│   ├── auth.js                  # ログイン管理（Google/メール、Supabase Auth）＋ ログインゲート（gateContent）
│   ├── notifications.js         # アプリ内通知（notificationsテーブルの取得・既読化・ベルUI）（新規）
│   ├── ui.js                    # モーダル・ログイン画面・アカウントメニュー
│   ├── store.js                 # カート・チェックアウト（MAX_QTY=30でサーバー側上限と一致）
│   ├── main.js, pages.js        # 各ページの初期化・描画ロジック（pages.js に members() を追加）
│   ├── checkout-complete.js     # 購入完了ページの注文確認ポーリング（/api/order-status）
│   └── vendor/supabase.min.js   # Supabase JS SDK（CSP対応のため自己ホスト）
├── api/
│   ├── checkout.js              # Square決済リンク作成（ログイン再検証・価格検証・orders行作成）
│   ├── _catalog.js              # サーバー側の価格マスタ（js/data.js と手動同期が必要）
│   ├── _email.js                # 購入確認メール送信（Resend HTTP APIを直接fetch）
│   ├── order-status.js          # 購入完了ページ用の注文ステータス確認API（service_role経由）
│   └── webhooks/square.js       # Square Webhook受信（署名検証→orders確定→確認メール送信→notifications作成）
├── supabase/schema.sql          # orders / notifications テーブルのDDL（Supabase SQL Editorで実行）
├── vercel.json                  # CSP・セキュリティヘッダー
├── .env.example                 # 環境変数一覧（実値は書かない）
├── 要件確認ヒアリングシート.docx  # クライアント記入用（仕様確定）
├── 指示テンプレート.txt          # クライアント記入用（文章・写真）
├── 資料/                        # サイトで使用確定済みのロゴ等
├── 方針/                        # 方向性・意思決定の記録、方針レベルの進捗管理（新設）
├── 事業/                        # 事業戦略・収益構造・KPI等（新設）
├── 案件/                        # クライアントワークの案件・依頼ごとの情報（新設）
└── 素材/                        # 受け取ったまま未加工の素材（新設）
```

`方針/` `事業/` `案件/` `素材/` は本セッションで新設。各フォルダの役割は
それぞれの `README.md` および `CLAUDE.md`「資料フォルダ」を参照。
現時点では各フォルダに `README.md`（説明のみ）を置いた状態で、実際のコンテンツは未投入。

# 使用技術・外部サービス

| 区分 | 内容 |
|---|---|
| フロントエンド | 静的 HTML / CSS / Vanilla JS（ビルド不要、フレームワークなし） |
| 認証 | Supabase Auth（Google OAuth / メールアドレス） |
| 決済 | Square（Payment Links API、`SQUARE_VERSION = "2024-01-18"` に固定） |
| ホスティング | Vercel（静的配信 + `/api` 配下の Serverless Functions） |
| 依存パッケージ | `@supabase/supabase-js`（`package.json` に1件のみ） |
| メール | Resend HTTP APIを直接fetch（`api/_email.js`）。購入確認メール＋（設定すれば）Supabase Auth のSMTP送信元 |
| Webhook | **実装済み**（`api/webhooks/square.js`）。Squareの `payment.updated` を署名検証した上で受信し、注文確定・確認メール送信・アプリ内通知作成を行う |
| 注文の記録 | Supabase `orders` テーブル（`supabase/schema.sql`）。RLS有効・ポリシーなしで anon からは不可視。参照は `/api` 配下（service_role）経由のみ |
| アプリ内通知 | Supabase `notifications` テーブル（`supabase/schema.sql`）。RLSで「本人の行のみ select/update可」。作成は`api/webhooks/square.js`（service_role）限定。フロントは`js/notifications.js`が`Auth.client`経由で直接読む |
| ログインゲート | `js/auth.js` の `Auth.gateContent()`。`[data-auth-gate]` / `[data-auth-gate-locked]` を切り替える汎用の仕組み。`members.html` に実装例あり |

# 完了済みの作業

git log（直近、新しい順）から確認できる範囲:

- ログイン必須の決済フロー実装（Supabase Auth + Square）— 直近のコミット
- トップページのセクション背景を市松模様に反転
- FAQ内容を更新
- チケット簡素化／グッズカルーセル／ナビにニュース／企業理念CONCEPT／特商法／インフルエンサー刷新
- ナビを6項目に整理＋ヒーローを白モヤ×黒文字に変更
- スマホのヒーロー白飛びバグ修正＋不整合修正
- ファビコンを本物のロゴに差し替え
- 本番化（「デモ」表記の除去）＋ヒーローロゴのギザギザ解消
- Instagram連携・SEO対応・ロゴ画像適用
- 「RE FASHION MARKET」から「TOKYO FASHION MARKET（TFM）」へブランド変更
- 本家サイト機能の再現（カート／商品・チケット・ログインモーダル／ページネーション／アニメーション）

**検証結果**: `git status` はクリーン（作業ツリーに未コミット変更なし、2026-07-24 時点）。
tsc/jest 等の自動テストは存在しない（静的サイトのため）。動作確認はブラウザ目視が前提。

## 2026-07-24 セッション1（引き継ぎ体制の整備）
- `CLAUDE.md` を新規作成（恒久ルールを整理）
- `docs/PROJECT_STATE.md` を新規作成（本ファイル）
- コードの変更は行っていない（ドキュメント整備のみ）
- 本番サイトを直接検証し、Supabase/Squareとも未接続（設定未着手）と確認

## 2026-07-24 セッション2（カート機能の検証・購入確認メール／注文確認の実装）
- **カート機能を実ブラウザで検証**（追加・数量増減・削除・小計計算・localStorage永続化・
  未ログイン時のログインゲート）。ロジックは正常に動作することを確認
- **バグ修正**: カートドロワーの「＋」ボタンに数量上限が無かった
  （商品モーダルは10個までだが、カート内での増加には上限が無かった）。
  `js/store.js` に `MAX_QTY = 30` を追加し `setQty` でキャップ
  （サーバー側 `api/checkout.js` の `MAX_QTY_PER_LINE` と一致させた。表示上の数量と
  実際の決済数量がズレる可能性を解消）
- **購入確認メールを新規実装**（前セッションで「未実装」と判明していた機能）:
  - `supabase/schema.sql` … `orders` テーブル新設（RLS有効・ポリシーなし＝service_role専用）
  - `api/checkout.js` … 決済リンク作成前に `orders` へ `status:'pending'` で1行作成し、
    Square決済リンクの `redirect_url` に `?order=<id>` を付与
  - `api/webhooks/square.js` … Square Webhook（`payment.updated`）を新規実装。
    HMAC-SHA256署名を検証し、`orders.status` を `pending→paid` の条件付きUPDATEで確定
    （Webhookの重複配信があってもメールが二重送信されない設計）
  - `api/_email.js` … Resend HTTP APIで購入確認メールを送信（新規）
  - `api/order-status.js` … 購入完了ページ用の注文ステータス確認API（新規）
  - `js/checkout-complete.js` / `checkout-complete.html` … 決済直後に「完了」と決め打ちせず、
    `/api/order-status` をポーリングして実際の確認結果（商品名・数量・合計）を表示するよう変更
- **サイト内通知（マイページ・通知一覧）は今回もスコープ外**。購入完了ページでの表示とメールの
  2箇所のみが購入確認の手段（→ セッション4で実装。下記参照）
- ローカル（`python3 -m http.server` 経由）で `/api` を伴わないフロント部分の動作を確認。
  Supabase/Squareの実クレデンシャルが無いため、Webhook〜メール送信の実地確認は**未実施**

## 2026-07-26 セッション4（schema.sql精査 → アプリ内通知・ログインゲートの実装）
- **`supabase/schema.sql` が現在のコード構成に対して過不足ないか精査**。
  `orders` 単独で決済フローは足りているが、「アプリ内通知」「ログインしている人だけ見れるページ」は
  スキーマ・コードとも未実装と判明（詳細は「重要な仕様・決定事項」参照）
- **`notifications` テーブルを新規追加**（`supabase/schema.sql`）。`orders` と違い、
  本人がブラウザから直接読む前提のため「本人の行のみ select/update 可」のRLSポリシーを付けた
  （insert/deleteのauthenticated向けポリシーは作らない＝作成は必ずservice_role経由）
- **`orders.user_id` に `references auth.users(id) on delete restrict` を追加**
  （既存の`not null`のみだと、Supabaseでユーザーが削除された場合に参照先の無い行が残りうるため。
  注文記録は消えてほしくないため`cascade`ではなく`restrict`を選択）
- **`api/webhooks/square.js`**: 支払い確定（`orders.status`を`pending→paid`に更新できた）時、
  確認メールに加えて`notifications`へ1行INSERTするよう追加。この処理は既存の重複排除の仕組み
  （`status='pending'`限定の条件付きUPDATEが成功した時だけ実行されるブロック内）にそのまま乗っているため、
  Webhookの重複配信があっても通知が二重に作られることはない
- **`js/notifications.js` を新規作成**。`Auth.client`（ログイン中のユーザーのセッション）経由で
  自分の通知だけを直接取得・既読化する（RLSが本人の行だけに絞るため、専用の`/api`は不要）。
  ヘッダーに通知ベル（未読件数バッジ・ドロップダウン一覧・既読化・全既読）を追加
  （`js/layout.js`にHTML注入、`css/style.css`にスタイル追加）。ログイン状態に応じてベルごと表示/非表示
- **ログインゲートの汎用の仕組みを追加**: `js/auth.js`に`Auth.gateContent()`を新設。
  `[data-auth-gate]`（ログイン中のみ表示）と`[data-auth-gate-locked]`（未ログイン時の案内）を
  ログイン状態に応じて自動で出し分ける。`members.html`に実装例として適用
  （未ログイン時は「ログイン/新規登録」ボタン→ログインモーダル、ログイン中は本来のコンテンツを表示）
- ブラウザで実際に確認: ログインゲートの表示切り替え・ログインモーダルの起動・通知ベルのバッジ表示・
  ドロップダウン内容・既読化（ダミーデータで検証、`Auth.client`が`null`な状態でも例外が起きないことも確認）。
  カート機能に既存の回帰が無いことも再確認済み
- **見つけて直したバグ**: `Notifications.markRead`/`markAllRead`が`Auth.client`が`null`の場合に
  例外を投げる実装になっていた（他の`js/auth.js`の`_notReady()`パターンと不整合）。ガード節を追加して修正
- Supabase/Squareの実クレデンシャルが無いため、`notifications`テーブルへの実際のINSERT・
  RLSポリシーの本番動作は**未検証**（ロジック・フロント表示のみ確認済み）

## 2026-07-26 セッション5（Supabase接続・本番反映の確認）
- **Supabaseプロジェクトが作成され、以下が完了済みと確認**（ユーザー本人がSupabase/Vercelダッシュボードで実施）:
  - Vercel環境変数に `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を設定済み
  - `supabase/schema.sql`（最新版＝`orders`＋`notifications`）をSupabase SQL Editorで実行し、Successを確認済み
- **`js/config.js` に本番の `SUPABASE_URL` / `SUPABASE_ANON_KEY`（publishable key）を反映**し、コミット・push済み
  （コミット `df1fde1`）
- **本番サイトで動作確認**: `https://tokyo-fashion-market.vercel.app/js/config.js` が最新の実値を返している、
  ページ上で `Auth.client` が正しく生成されている（＝Supabase接続が有効）ことをブラウザで確認。
  コンソールエラーなし。最新デプロイがReadyであることを確認
- **新規登録・Supabase Auth Usersへの反映・再ログインの実地テストは未実施**。
  アカウント作成・パスワード入力を伴う操作のため、Claudeでは代行せずユーザー本人に依頼中
- **方針**: Square・Resend・決済関連の設定は後回しとし、Supabase認証機能（新規登録・ログイン）の
  動作確認を優先する

# 現在作業中の内容

Supabase認証（新規登録・ログイン）の実地確認待ち。ユーザー本人が本番サイトで新規登録→
Supabase Authentication→Usersへの反映→再ログインの3点をテストする予定。結果待ちで
問題があれば原因調査・修正を行う。

# 未完了の作業

## Supabase認証の実地確認（最優先・進行中）
- [ ] 本番サイトで新規登録テスト（メール/パスワード）
- [ ] Supabase Authentication → Users にユーザーが追加されるか確認
- [ ] ログアウト後、同じアカウントで再ログインできるか確認

## 本番化前に必要な設定（README「今後の設定手順」参照）
- [x] Supabase プロジェクト作成 → **完了**（Google OAuth有効化・Redirect URLs登録は未確認、必要なら別途）
- [x] ~~`supabase/schema.sql` を Supabase SQL Editor で実行~~ → **完了**（`orders` / `notifications`
      2テーブルともSuccessを確認済み）
- [x] ~~`js/config.js` に本番の `SUPABASE_URL` / `SUPABASE_ANON_KEY` を設定~~ → **完了**（コミット`df1fde1`）
- [x] ~~Vercel 環境変数に `SUPABASE_SERVICE_ROLE_KEY` を設定~~ → **完了**
      （`SUPABASE_URL` / `SUPABASE_ANON_KEY` もVercel側に設定済み。ただし`/api`配下のコードが実際に参照するのは
      `SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`の組み合わせのみで`SUPABASE_ANON_KEY`は未使用。
      フロント（ブラウザ）側は`js/config.js`に直書きした値を見るため、Vercelの`SUPABASE_ANON_KEY`はどこからも
      参照されていない＝設定しても害はないが、フロントの動作には`js/config.js`の値が効いている点に注意）
- [ ] Supabase Auth の SMTP 送信元を Resend に設定（**後回し**。デフォルトのSupabase送信でまず認証動作を確認する）
- [ ] Vercel 環境変数に `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` /
      `SQUARE_ENVIRONMENT` / `SQUARE_WEBHOOK_SIGNATURE_KEY` / `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `SITE_URL` を設定（**後回し**）
- [ ] Square Developer Dashboard で Webhook を登録（**後回し**）
- [ ] Resendで送信ドメインのSPF/DKIM認証を完了（**後回し**。独自ドメイン取得後）
- [ ] Square を sandbox で実際にテスト決済（**後回し**）
- [ ] Square を production に切り替え（**後回し**）

## 機能面
- [x] ~~Square Webhook 未実装~~ → **今回実装済み**（`api/webhooks/square.js`）。支払い確定後に
      `orders.status` を `paid` に更新し、確認メールを送信する
- [x] ~~サイト内通知（購入確認）は未実装~~ → **セッション4で実装済み**（`notifications`テーブル＋
      `js/notifications.js`＋ヘッダーの通知ベル）。購入確定時にWebhookから1件作成される。
      ただし実クレデンシャルが無く実地未検証（下記「未確認」参照）
- [ ] **マイページ（購入履歴の一覧・詳細）は依然未実装**。通知は「直近の購入確認」のみで、
      過去の注文を後から一覧で振り返る画面ではない。必要なら別途設計が必要
- [ ] **ログインゲート（`Auth.gateContent()`）は`members.html`にのみ適用済み**。
      他のページ・セクションを会員限定にする場合は、同じ`[data-auth-gate]`パターンを追加するだけでよい
- [ ] `api/checkout.js` で Square API 呼び出し前に作成した `orders` 行が、Square側の失敗時に
      `status:'failed'` へ更新されるが、**Square呼び出し自体がタイムアウトした場合は
      orphanなpending行が残る可能性がある**（軽微。手動クリーンアップか将来的なバッチ処理で対応）
- [ ] ダミーデータの差し替え（`js/data.js` の `GOODS` / `PAST_INFLUENCERS`、`hagi.html` / `tokushoho.html` の会社情報、一部画像）
- [ ] 独自ドメイン確定後の一括置換（canonical / og:url / robots.txt / sitemap.xml / `SITE_URL`）

## 確認済み（2026-07-24、本番サイトを直接検証）
- **本番の `js/config.js` はプレースホルダーのまま**（`YOUR-PROJECT-REF` / `YOUR-ANON-PUBLIC-KEY`）
  → Supabaseプロジェクト未作成 or 未接続。ログインモーダルは表示されるが実際の認証は動かない
- **`/api/checkout` を直接叩くと `{"error":"サーバー側の設定が完了していません。"}`（500）**
  → Vercel環境変数に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が未設定
  （このチェックが先に走るため、Square側の設定有無はこの時点では未確認）
- 上記より **Supabase・Square とも本番導入の準備がまだできていない**と判断できる

## 未確認（本セッションで検証していない）
- Resend の設定状況
- 本番ドメインが確定しているかどうか
- `api/_catalog.js` と `js/data.js` の価格が現時点で一致しているか（差分diffは未実施）
- Square の Sandbox/Production いずれのアカウントも作成済みかどうか（Supabase未設定でAPIが先に止まるため未検証）
- **今回実装した Webhook〜確認メールの実地動作**（Supabase/Squareの実クレデンシャルが無いため、
  ローカルでも本番でも実際の決済〜メール受信までは検証できていない。ロジックのユニット的な確認
  ［構文チェック・localStorageベースのカート動作・フロントのポーリング表示切り替え］のみ実施）
- **`notifications`テーブルへの実際のINSERT・RLSポリシーの本番動作**（同上、実クレデンシャルが無いため。
  フロント側はダミーデータでの表示・既読化・`Auth.client`が`null`時に例外が出ないことのみブラウザで確認済み）

# 重要な仕様・決定事項

| 決定 | 理由 |
|---|---|
| フロントはビルド不要の静的HTML/CSS/JS | 保守を簡単にし、クライアントやデザイナーでも編集しやすくするため |
| 価格の正は `api/_catalog.js`（`js/data.js` ではない） | ブラウザから送られた金額を信用すると改ざんされうるため、決済時はサーバー側マスタを参照 |
| `/api/checkout` は毎回 Supabase トークンを再検証 | フロントのログイン確認だけでは突破できる設計にしないため |
| `js/vendor/supabase.min.js` を自己ホスト | CSP `script-src 'self'` を維持するため（CDN読み込みにしない） |
| CSP・HSTS等のセキュリティヘッダーを `vercel.json` で設定済み | 秘密情報保護とXSS/クリックジャッキング対策 |
| 注文確定は Square Webhook 経由のみ、購入完了ページ表示だけでは確定と見なさない | URLを直接開いても「完了」と表示されてしまう抜け道を塞ぐため |
| 確認メールの重複送信防止は `orders.status='pending'` 限定の条件付きUPDATEで実現（専用の重複排除テーブルは作らない） | 小規模プロジェクトで別テーブルを増やすコストに見合わないため。Webhookの重複配信を前提にした設計 |
| `orders` テーブルはRLS有効・ポリシーなしでanon/authenticatedから常に不可視 | anon keyはjs/config.jsに公開されるため、ポリシーで緩めると全顧客の注文情報が漏洩しうる。参照は必ずservice_role経由の`/api`にする |
| カートの数量上限（`MAX_QTY=30`）をクライアント側にも設定 | サーバー側`MAX_QTY_PER_LINE`と表示上の数量がズレるバグを防ぐため |
| `notifications`テーブルは`orders`と違い「本人のみselect/update可」のRLSポリシーを持たせる | 通知は本人がブラウザから直接読む前提の機能のため。insert/deleteのauthenticated向けポリシーは作らず、作成は必ずservice_role（Webhook）経由に限定する |
| `orders.user_id`に`auth.users(id)`への外部キー制約（`on delete restrict`）を追加 | 制約が無いとSupabase側でユーザー削除時に参照先の無い行が残りうるため。注文記録は消したくないので`cascade`ではなく`restrict`を選んだ |
| ログインゲートは`[data-auth-gate]`/`[data-auth-gate-locked]`のHTML属性＋`Auth.gateContent()`の汎用の仕組みにした | ページごとに個別のログイン判定コードを書かず、同じパターンをどのページにも使い回せるようにするため |

# 変更時の注意点

- **`js/data.js` の価格を変えたら、`api/_catalog.js` にも必ず同じ内容を反映する**。
  片方だけだと表示価格と決済価格がズレる
- **`js/config.js` に service_role key や Square Access Token を書かない**（サーバー専用値はVercel環境変数のみ）
- 各HTMLの先頭コメントに「このページで編集する場所」が書かれている（`★` コメントが編集ポイント）。まずそこを確認する
- メニュー・フッターの変更は `js/layout.js` の `NAV_ITEMS` / `NAV_SUB_ITEMS`
- 色・サイズは `css/style.css` 先頭の `:root`（`--black` が基調色）
- 変更後はブラウザで目視確認する（自動テストが存在しないプロジェクトのため）

# 既知の問題・不具合

| 内容 | 状態 |
|---|---|
| `js/config.js` が現状プレースホルダー（`YOUR-PROJECT-REF`）のまま。Supabase未設定の間はログイン系操作が「設定中」の案内のみを返す（`js/auth.js` の `_notReady()`） | Supabaseプロジェクト作成待ち |
| マイページ（購入履歴の一覧・詳細）が無い | 未実装。通知ベルは「直近の購入確認」のみで、過去の注文一覧ではない |
| Square API呼び出しがタイムアウトした場合、`orders`に status:'pending' の行が残り続ける可能性 | 軽微。頻度が低ければ許容、気になる場合は定期クリーンアップを検討 |
| 今回実装したWebhook〜メール送信〜アプリ内通知フローが実際のSquare/Supabase環境で未検証 | Supabase/Squareの実クレデンシャルが無いため。本番設定後に必ずsandboxで実地確認すること |

# 次に行うこと

1. Supabase / Square の実際のプロジェクト作成状況を確認する（未確認事項の解消）
2. 未作成であれば README の「今後の設定手順」に沿って Supabase → Resend → Square → Vercel の順に設定
   （`supabase/schema.sql` の実行を忘れないこと。`orders`が無いと決済自体が失敗し、
   `notifications`が無いと通知作成だけが失敗する）
3. Square Sandboxで実際にテスト決済を行い、購入完了ページの表示・確認メール・通知ベルへの反映を確認する
4. ダミーデータ（商品・インフルエンサー名・会社情報）の差し替え
5. 独自ドメインが決まり次第、URL一括置換
6. 必要であればマイページ（購入履歴の一覧・詳細）機能を追加検討。会員限定ページを増やす場合は
   `members.html`と同じ`[data-auth-gate]`パターンを他ページにも適用する

# 関連ファイル

| 目的 | ファイル |
|---|---|
| Claude の恒久ルール | `CLAUDE.md` |
| 人間向けの説明・設定手順 | `README.md` |
| クライアント向け仕様確定シート | `要件確認ヒアリングシート.docx` |
| クライアント向け素材収集テンプレート | `指示テンプレート.txt` |
| 方向性・意思決定・方針レベルの進捗 | `方針/` |
| 事業戦略・KPI等 | `事業/` |
| クライアントワークの案件情報 | `案件/` |
| 未加工の受領素材 | `素材/` |
| サイトデータ（イベント・商品・ニュース・FAQ） | `js/data.js` |
| サーバー側価格マスタ | `api/_catalog.js` |
| 決済リンク作成・orders行作成 | `api/checkout.js` |
| Square Webhook受信・注文確定・通知作成 | `api/webhooks/square.js` |
| 購入確認メール送信 | `api/_email.js` |
| 購入完了ページの注文ステータス確認API | `api/order-status.js` |
| orders / notifications テーブル定義 | `supabase/schema.sql` |
| ログイン管理・ログインゲート（`gateContent`） | `js/auth.js` |
| アプリ内通知（取得・既読化・ベルUI） | `js/notifications.js` |
| カート・チェックアウト | `js/store.js` |
| 購入完了ページのポーリング表示 | `js/checkout-complete.js` |
| Supabase接続設定 | `js/config.js` |
| セキュリティヘッダー | `vercel.json` |

# 動作確認方法

```bash
python3 -m http.server 4173
# → http://localhost:4173 をブラウザで開く
```

（本プロジェクト用にグローバル`.claude/launch.json`へ`demo-site`という名前で登録済み。
以前このエントリはパスが誤って`~/Applications/...`を指しており動作しなかったため、
本セッションで`~/アプリケーション/TOKYO-FASHION-MARKET`に修正した）

- フロント（見た目・カート・ログイン画面の表示）はこれで確認できる
- `/api` 配下（`checkout` / `order-status` / `webhooks/square`）は Vercel 環境でのみ動作
  （ローカルで試すには `vercel dev` が必要。Webhookのローカル検証にはさらにトンネリングが要る）
- 自動テスト（tsc/jest等）は存在しない。変更後は必ずブラウザで目視確認する

# 最終更新

**2026-07-26（セッション5）**
Supabaseプロジェクト作成・Vercel環境変数（`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`）設定・
`supabase/schema.sql`（`orders`+`notifications`）の本番実行がユーザー本人により完了。
`js/config.js`に本番の接続情報を反映してコミット・push済み（`df1fde1`）。本番サイトで最新デプロイが
Readyであること・`Auth.client`が正しく生成されることをブラウザで確認。
新規登録・Supabase Authへの反映・再ログインの実地テストは、アカウント作成/パスワード入力を伴うため
Claudeでは代行せず、ユーザー本人が実施予定（結果待ち）。Square・Resend・決済関連は方針として後回し。

**2026-07-26（セッション4）**
`supabase/schema.sql`がコード構成に対して過不足ないか精査した上で、「アプリ内通知」と
「ログインしている人だけ見れるページ」をコード側で実装した（ドメイン未確定のため、
Resendドメイン認証など外部作業が必要な範囲は対象外）。
`notifications`テーブル新設（RLSで本人のみselect/update可）、`orders.user_id`にFK制約追加、
`api/webhooks/square.js`が支払い確定時に通知を1件作成するよう変更、
`js/notifications.js`新規（通知ベルUI）、`js/auth.js`に`gateContent()`新設、
`members.html`にログインゲートの実装例を適用。ブラウザで表示・既読化・回帰の無いことを確認済み。
実装中に見つけた小バグ（`Auth.client`が`null`時の`markRead`/`markAllRead`の例外）は同セッションで修正。
Supabase/Squareの実クレデンシャルが無いため、実環境での動作は未検証。

**2026-07-25（セッション3）**
`方針/` `事業/` `案件/` `素材/` の4フォルダを新設し、各フォルダに役割を説明する
`README.md` を配置（中身のコンテンツはまだ無い）。`CLAUDE.md` に「資料フォルダ」節を追加し、
方針判断や事業・クライアント文脈が絡む作業ではこれらも参照するよう明記した。
コード側の変更は無し。

**2026-07-24（セッション2）**
カート機能を実ブラウザで検証（正常動作を確認、数量上限バグを1件修正）。
購入確認メール・購入完了ページでの実際の注文確認表示を新規実装
（`orders`テーブル、`api/webhooks/square.js`、`api/_email.js`、`api/order-status.js`、
`js/checkout-complete.js`）。サイト内通知（マイページ）は未実装のままスコープ外とした。
Supabase/Squareの実クレデンシャルが無いため、Webhook〜メール送信の実地動作は未検証。
また `~/アプリケーション/.claude/launch.json` の `demo-site` エントリが誤った旧パス
（`~/Applications/...`）を指していたため修正した。この変更はコミット・push済み（`9ab3c70`）。
