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
├── hagi.html                  # コンセプト・運営者情報・メンバー（旧: 企業理念。スポンサー欄は一時削除）
├── event.html                 # 過去のイベント一覧
├── event-detail.html           # チケット詳細ページ（新規。?i=<EVENTSの配列番号> で表示切替）
├── tokushoho.html              # 特定商取引法に基づく表示
├── checkout-complete.html      # Square決済完了後の戻り先
├── admin-announcements.html    # 管理コンソール（/console）。合言葉ログイン、お知らせ配信・お問い合わせ管理（新規）
├── news.html                    # ニュース一覧（ナビに残っているメインページ）
├── volunteer.html               # ボランティアスタッフ（ナビに残っているメインページ）
├── influencer-casting.html, members.html, oubo-form.html,
│   recruit.html, sample-sale.html, sdgs.html, sponsorship.html
│                                # ナビからは一時的に外している（ページ自体は現存、削除していない）
├── 404.html
├── css/style.css               # モノクロテーマ（全ページ共通、:root で基調色を一括管理）
├── js/
│   ├── data.js                 # ★最も編集頻度が高い（イベント/商品/ニュース/FAQ等のデータ）
│   ├── layout.js                # 共通ヘッダー/フッター注入・ナビ（通知ベルのHTMLもここで注入）
│   ├── config.js                # Supabase接続先（公開してよい値のみ）
│   ├── auth.js                  # ログイン管理（Google/メール、Supabase Auth）＋ ログインゲート（gateContent）
│   ├── notifications.js         # アプリ内通知（notificationsテーブルの取得・既読化・ベルUI）
│   ├── ui.js                    # モーダル・ログイン画面・アカウントメニュー
│   ├── store.js                 # カート・チェックアウト（MAX_QTY=30でサーバー側上限と一致）
│   ├── main.js, pages.js        # 各ページの初期化・描画ロジック
│   ├── event-detail.js          # チケット詳細ページの表示・購入ボタン（新規）
│   ├── checkout-complete.js     # 購入完了ページの注文確認ポーリング（/api/order-status）
│   ├── console.js               # 管理コンソール（/console）の挙動（新規。CSPのため外部ファイル化）
│   └── vendor/supabase.min.js   # Supabase JS SDK（CSP対応のため自己ホスト）
├── api/
│   ├── checkout.js              # Square決済リンク作成（ログイン再検証・価格検証・orders行作成）
│   ├── _catalog.js              # サーバー側の価格マスタ（js/data.js と手動同期が必要）
│   ├── _email.js                # 購入確認メール送信（Resend HTTP APIを直接fetch。既存の決済フロー専用・無変更）
│   ├── _mailer.js               # お知らせ配信・お問い合わせ対応用の共通メール送信処理（新規。_email.jsとは独立）
│   ├── _adminAuth.js            # /console の合言葉トークン発行・検証（新規）
│   ├── order-status.js          # 購入完了ページ用の注文ステータス確認API（service_role経由）
│   ├── contact.js               # お問い合わせフォーム送信先。inquiries保存＋運営通知＋自動受付メール（新規）
│   ├── admin-login.js           # /console のパスワード検証・トークン発行（新規）
│   ├── admin-announcements.js   # お知らせ配信（全員/個人/購入者/決済未完了者）の投稿・削除（新規）
│   ├── admin-inquiries.js       # /console のお問い合わせ一覧・返信（新規）
│   ├── admin-preview-email.js   # 配信エディタのメールプレビュー生成、送信はしない（新規）
│   ├── admin-upload-image.js    # 配信エディタの画像アップロード（Supabase Storage、新規）
│   └── webhooks/square.js       # Square Webhook受信（署名検証→orders確定→確認メール送信→notifications作成）
├── supabase/schema.sql          # orders / notifications / announcements / inquiries テーブルのDDL（Supabase SQL Editorで実行）
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
| メール | Resend HTTP APIを直接fetch（`api/_email.js`）。購入確認メール＋（設定すれば）Supabase Auth のSMTP送信元。`RESEND_SEND_ENABLED=true`の時だけ実送信する本番スイッチあり（現状false＝ドメイン未接続のため無効） |
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

## 2026-07-26 セッション6（Resendの事前準備：ドメイン未接続でも安全な構成に）
- `RESEND_API_KEY` がVercelに設定済み・Redeploy済みという状況を踏まえ、ドメイン未接続の状態でも
  誤って本番送信されないよう `api/_email.js` を修正
- **`RESEND_FROM_EMAIL` を`FROM_EMAIL`という単一の定数に集約**（以前は`process.env.RESEND_FROM_EMAIL`を
  2箇所で直接参照していた）。ドメイン接続後はVercelの環境変数`RESEND_FROM_EMAIL`の値を変更するだけでよく、
  コード変更は不要
- **本番送信の明示的なスイッチ`RESEND_SEND_ENABLED`を新設**。`"true"`の時だけ実際にResendへ送信し、
  それ以外（未設定含む）は常にスキップする。`RESEND_API_KEY`が設定済みでも、このスイッチが無い限り
  実送信されない設計にした（ドメイン未接続の間に誤送信・失敗送信が起きないようにする安全策）
- `.env.example` / `README.md`（Resend設定手順・環境変数一覧） / `CLAUDE.md`（変更してはいけない仕様）を更新

## 2026-07-29 セッション7（サイトコンテンツの大幅改修）
- **ナビゲーション整理**: 「その他」ドロップダウンを一時廃止（`js/layout.js`）。
  `sponsorship.html`/`recruit.html`/`oubo-form.html`/`sdgs.html`/`influencer-casting.html`/
  `sample-sale.html`/`members.html` はページ自体は残るがナビからは非表示。`volunteer.html` のみ
  メインナビへ昇格
- **「企業理念」→「コンセプト」に全面的に変更**（`hagi.html`のtitle/見出し/meta、`index.html`見出し、
  `js/layout.js`のナビ・フッターラベル、`js/pages.js`のコメント）
- **チケット購入を詳細ページ形式に変更**（参考サイト準拠）。新規 `event-detail.html` + `js/event-detail.js`。
  `?i=<EVENTSの配列番号>` でイベント内容・写真（最大3枚、現状プレースホルダー）・説明文・価格を表示し、
  「チケット購入」ボタンから既存の`Store.openTicket()`モーダルを開く。トップの各イベントカードは
  このページへのリンクに変更（`js/main.js`の`renderEvents()`）。`js/data.js`の`EVENTS`に`images`配列を追加
- **NEWS**: 「公式サイトをオープンしました」記事を追加（`js/data.js`の`NEWS_ARTICLES`、`body`フィールド新設）。
  タップで別ページへ遷移せず、その場でアコーディオン開閉する方式に変更
  （トップの上位3件用に`js/main.js`へ`renderNewsPreview()`を新設、`news.html`側は`js/pages.js`の`news()`を変更）
- **メンバー**（`hagi.html`）: ダミー8名から「植谷 航輝」1名のみに変更（`js/pages.js`のMEMBERS配列）。
  写真は後日追加予定（それまでは仮のイニシャル表示のまま）
- **スポンサー欄削除**（`hagi.html`）: 「過去協賛頂いたスポンサー」セクションを一時削除
  （`index.html`側の同種セクションは対象外、変更していない）
- **商品の「詳細を挟む」ポリシーを追加**: `js/data.js`のGOODSに`quickAdd`フラグの仕組みを追加
  （`quickAdd: false`で商品一覧の直接「カートに追加」ボタンを非表示にし、詳細モーダル経由でのみ
  カート追加できるようにする）。現状の商品は全てチェキ（簡易品）のため全件`quickAdd`省略＝従来どおり
  直接追加可能。チェキ以外の商品を追加する際に使う想定
- **お問い合わせフォーム**（`index.html`）に種別セレクトを追加:
  仕事の相談・依頼／イベントについて／取材・インタビュー／インターン希望／その他
  （`js/main.js`の`setupContactForm()`のバリデーション対象に`select`を追加）
- **`tokushoho.html`**: 「事業者の連絡先」を「ホームにあるお問い合わせよりご連絡ください」に、
  「代金の支払方法・時期」を「Square決済に対応しております」にそれぞれ変更。
  **「事業者の所在地」（神奈川県〜）は未反映のまま**（下記「未確認」参照）
- ブラウザで全変更を確認（コンソールエラーなし、ナビ・チケット詳細・購入モーダル起動・NEWSアコーディオン・
  グッズのクイック追加・お問い合わせの種別選択・特商法ページの表示、いずれも動作確認済み）

## 2026-08-01 セッション9（管理コンソール `/console` の新規実装）

姉妹プロジェクト DRESS CODE TOKYO（`~/アプリケーション/DORESS CODE TOKYO`）の `/console`
（合言葉方式の管理画面）とほぼ同じ概要で、TFMにも管理コンソールを実装。あわせて、
「送信先未接続でお問い合わせフォームがどこにも送信されていなかった」実害も解消した。

- **事実確認**: `js/main.js`の`setupContactForm()`は元々**バックエンド未接続**で、
  成功メッセージを出すだけで実際には何も送信していなかった（Resend未接続が原因ではなかった）
- **`supabase/schema.sql`に追記**（既存テーブルの列は変更せず、ALTER/新規CREATEのみ）:
  - `notifications`に`body_html`列を追加（ブロックエディタの画像等をサイト内表示するため）
  - 新規`announcements`テーブル（全員向け告知。RLSは`select`のみ許可、insert/deleteはservice_role限定）
  - 新規`inquiries`テーブル（お問い合わせ内容。RLS有効・ポリシーなし＝完全にservice_role経由）
  - **未実行**: この追記分はまだSupabase SQL Editorで実行されていない（下記「未完了の作業」参照）
- **新規API**: `api/_mailer.js`（お知らせ配信・お問い合わせ用の共通メール送信処理。ブロックエディタの
  レンダリングも担う。既存の購入確認メール`api/_email.js`とは独立させ、動作確認済みの決済フローには
  一切触れていない）、`api/_adminAuth.js`（合言葉トークン発行・検証）、`api/admin-login.js`、
  `api/admin-announcements.js`（全員/個人/購入者/決済未完了者への配信・削除）、`api/admin-inquiries.js`
  （お問い合わせ一覧・返信）、`api/admin-preview-email.js`（配信メールのライブプレビュー）、
  `api/admin-upload-image.js`（Supabase Storageへの画像アップロード）、`api/contact.js`
  （お問い合わせフォームの実送信先。honeypot＋簡易レート制限あり）
- **セグメント配信の設計**: DRESS CODE TOKYOはSquare Catalog Object IDでセグメントを判定しているが、
  TFMはPayment Linkに商品名を直接渡す方式（Catalog未使用）のため、`orders.line_items`の**商品名**で
  購入者セグメントを判定するよう調整（`api/admin-announcements.js`の`segmentKeyOf()`）
- **`notifications.type`はNOT NULL制約があるため**、管理画面から挿入する行には
  `admin_personal`/`admin_segment`/`admin_pending`のtype値を設定するようにした
  （購入確認通知の`order_paid`とは別区分。表示ロジックには影響しない）
- **CSPを理由にDRESS CODE TOKYOと構成を変えた点**: TFMの`vercel.json`は`script-src 'self'`
  （インラインscript禁止、CLAUDE.mdの恒久ルール）を維持しているため、DRESS CODE TOKYOのように
  管理ページへ直接`<script>`を書く方式ではなく、`js/console.js`として外部ファイル化した。
  また管理ページのヘッダー/フッターもTFM他ページと同じ`js/layout.js`の`.site-header`/`.site-footer`
  注入をそのまま使い、DRESS CODE TOKYOのような独自ヘッダーの複製はしていない
- **`js/notifications.js`を拡張**: 既存の`notifications`（本人向け、既読管理あり）に加えて
  `announcements`（全員向け、既読管理なし）も取得し、通知パネルに「あなたへのお知らせ」/
  「TFMからのお知らせ」の2タブを追加。announcements側の新着判定はlocalStorageの最終閲覧時刻で簡易判定
- **`index.html`のお問い合わせフォームにhoneypot欄（`company`）を追加**、`js/main.js`の
  `setupContactForm()`を`/api/contact`への実送信に置き換え（送信中/エラー表示付き）
- **`vercel.json`に`/console`→`admin-announcements.html`のrewriteを追加**（既存のCSP等headersは無変更）
- **`.claude/launch.json`を新規作成**（プロジェクトローカル。`python3 -m http.server 4173`、
  以前はグローバル設定を前提にしていたが実体が無かったため、プロジェクト側に用意した）
- **ローカルブラウザで確認**: `admin-announcements.html`をロック解除した状態でDOM構造・テキストを確認
  （タブ切替・ブロックエディタのツールバー・プレビューiframe・お問い合わせ/一覧/個人宛て履歴の3セクション
  が意図通り表示されることを確認。コンソールエラーなし）。`index.html`のcontactFormにhoneypot欄と
  エラー表示要素が存在することも確認。**`/api`配下はVercel環境が必要なため、実際のログイン・投稿・
  返信・お問い合わせ送信の動作は未検証**（構文チェック`node --check`は全新規/変更JSファイルで通過済み）
- 既存の決済・Webhook・購入確認メールのフロー（`api/checkout.js`, `api/webhooks/square.js`,
  `api/_email.js`）は無変更

# 現在作業中の内容

1. Supabase認証（新規登録・ログイン）の実地確認待ち。ユーザー本人が本番サイトで新規登録→
   Supabase Authentication→Usersへの反映→再ログインの3点をテストする予定。結果待ちで
   問題があれば原因調査・修正を行う。
2. `tokushoho.html`の「事業者の所在地」（神奈川県〜）が確定待ち。ユーザーが取引先に確認中。
   確定次第、該当セルを書き換える
3. イベントの詳細写真（`js/data.js`の`EVENTS[].images`）・メンバー写真が未投入（後日追加予定）
4. **管理コンソール（/console）の実地確認待ち**（セッション9で新規実装、下記「未完了の作業」P0.5参照）

# 未完了の作業

> 各項目に「誰が」を付記（**あなた**＝ダッシュボード操作・実機確認など人間側の作業／**Claude**＝コード変更）。
> 優先度は上から順（P0が最優先）。

## P0. Supabase認証の実地確認（進行中・最優先）
- [ ] **（あなた）** 本番サイト（https://tokyo-fashion-market.vercel.app ）で新規登録をテスト
      （メールアドレス＋パスワード）。※必ずタブを開き直す/ハード再読み込みしてから行うこと
      （キャッシュされた古い`js/config.js`のままだと「ログイン機能はまだ設定中です」という
      誤ったエラーが出る。実際には設定済みなのでコード側の問題ではない）
- [ ] **（あなた）** Supabaseダッシュボード → Authentication → Users に、登録したメールアドレスの
      ユーザーが追加されているか確認
- [ ] **（あなた）** 一度ログアウトし、同じメールアドレス・パスワードで再ログインできるか確認
- [ ] **（Claude）** 上記でエラーが出た場合、エラーメッセージの内容を教えてもらって原因調査・修正

## P0.5. 管理コンソール（/console）の実地確認（セッション9で実装・未検証）
- [ ] **（あなた）** `supabase/schema.sql`の追記分（`notifications.body_html`列・`announcements`/
      `inquiries`テーブル・`orders.order_number`列・`orders.entry_code`列）をSupabase SQL Editorで実行
- [ ] **（あなた）** Vercel環境変数に`ADMIN_CONSOLE_PASSWORD`（必須）・`CONTACT_TO_EMAIL`（任意）を
      設定 → Redeploy
- [ ] **（あなた・任意）** 配信エディタの画像アップロードを使うなら、Supabase Storageに
      `announcement-images`（Publicバケット）を手動作成
- [ ] **（あなた）** 本番で`/console`にログインし、お知らせ配信（全員/個人/購入者/決済未完了者の4種）・
      お問い合わせ一覧・返信を一通り試す
- [ ] **（あなた）** サイトのお問い合わせフォームから実際に送信し、`inquiries`に保存されること・
      `/console`に表示されること・（`RESEND_SEND_ENABLED=true`なら）通知/自動受付メールが届くことを確認
- [ ] **（Claude）** 上記でエラーが出た場合、原因調査・修正

## P1. 特定商取引法ページの事業者所在地確定
- [ ] **（あなた）** 神奈川県〜の事業者所在地（番地まで）を取引先に確認
- [ ] **（Claude）** 確定した住所を `tokushoho.html` の「事業者の所在地」欄に反映
      （現状はBASE株式会社の住所がプレースホルダーとして残っている）

## P2. Square決済の本番導入（後回し方針・着手は任意のタイミングで）
- [ ] **（あなた）** Square Developer Dashboardでアプリを作成し、Sandbox用の
      `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` を取得
- [ ] **（あなた）** Vercel環境変数に `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` /
      `SQUARE_ENVIRONMENT=sandbox` / `SITE_URL`（仮ドメインのままでよい）を設定 → Redeploy
- [ ] **（あなた）** Square Developer Dashboard → Webhooks で
      Notification URL（`{SITE_URL}/api/webhooks/square`）を登録し、購読イベントに`payment.updated`を追加。
      発行されたSignature Keyを控える
- [ ] **（あなた）** Vercel環境変数に `SQUARE_WEBHOOK_SIGNATURE_KEY` を設定 → Redeploy
- [ ] **（あなた）** Sandboxで実際にテスト決済を行い、以下を確認:
  - [ ] 購入完了ページ（`checkout-complete.html`）に注文内容が表示される
  - [ ] Supabaseの`orders`テーブルで該当行が`status: paid`になっている
  - [ ] ヘッダーの通知ベルに購入確認の通知が届く（`notifications`テーブルへのINSERTも合わせて確認）
  - [ ] （`RESEND_SEND_ENABLED=true`にしていれば）確認メールが届く。ドメイン未接続の間はスキップされるのが正常
- [ ] **（あなた）** Sandboxで問題なければ、本番用の Access Token / Location ID に差し替え、
      `SQUARE_ENVIRONMENT=production` に変更 → Redeploy

## P3. Resendの送信ドメイン接続（独自ドメイン取得後）
- [ ] **（あなた）** 独自ドメインを取得し、Vercelに接続
- [ ] **（あなた）** Resendダッシュボードで送信ドメイン（`mail.`等のサブドメイン推奨）を追加し、
      表示されるSPF/DKIM/DMARCのDNSレコードをドメインの管理画面に設定・認証を完了させる
- [ ] **（あなた）** Vercel環境変数 `RESEND_FROM_EMAIL` を認証済みドメインの送信元アドレスに変更
- [ ] **（あなた）** Vercel環境変数 `RESEND_SEND_ENABLED` を `true` に変更 → Redeploy
      （この3手順が終わるまでは、コードは意図的にメール送信をスキップし続ける安全設計）
- [ ] **（あなた・任意）** Supabase Auth の SMTP送信元もResendに変更（現状はSupabaseのデフォルト送信のまま）

## P4. 独自ドメイン確定後の一括置換
- [ ] **（Claude）** 全HTMLの `https://tokyo-fashion-market.vercel.app` を実ドメインに一括置換
      （canonical / og:url / og:image / JSON-LD）
- [ ] **（Claude）** `robots.txt` と `sitemap.xml` の同URLも置換
- [ ] **（あなた）** Vercel環境変数 `SITE_URL` を実ドメインに変更 → Redeploy
      （Square Webhookの署名検証・決済完了後のリダイレクト先に影響するため、Webhook側のNotification URLも
      合わせて更新が必要）

## P5. コンテンツ整備（優先度低・随時）
- [ ] **（あなた）** イベントの詳細写真を`js/data.js`の`EVENTS[].images`に追加（最大3枚/件、`event-detail.html`に反映される）
- [ ] **（あなた）** メンバー（植谷航輝）の写真を追加（現状は仮のイニシャル表示。追加方法は`js/pages.js`の`PAGE_INITS.hagi()`を要相談）
- [ ] **（あなた）** ダミーデータの差し替え（`js/data.js`の`GOODS`名称・`PAST_INFLUENCERS`、その他会社情報・画像）
- [ ] **（あなた・任意）** hagi.htmlのスポンサー欄を復活させる場合、掲載するスポンサーが決まり次第Claudeへ依頼

## P6. 将来的な機能拡張（要検討・現時点では未着手）
- [ ] マイページ（購入履歴の一覧・詳細）。現状の通知ベルは「直近の購入確認」のみで、
      過去の注文を一覧で振り返る画面ではない
- [ ] ログインゲート（`Auth.gateContent()`）を`members.html`以外にも適用するか検討。
      適用自体は`[data-auth-gate]`属性を追加するだけで既存の仕組みが使い回せる
- [ ] 「その他」ナビ（`sponsorship.html`/`recruit.html`/`oubo-form.html`/`sdgs.html`/
      `influencer-casting.html`/`sample-sale.html`/`members.html`）を再度メニューに載せるか検討
- [ ] Google OAuthを実際に有効化するか（現状メール/パスワードのみ運用、Supabase側のRedirect URLs登録も未確認）

## 既知の軽微な課題（緊急度低）
- [ ] `api/checkout.js`でSquare API呼び出し自体がタイムアウトした場合、`orders`に
      `status: pending`の行が残り続ける可能性がある（手動クリーンアップか将来のバッチ処理で対応）

## 完了済み（旧チェックリストより。詳細は該当セッションのログ参照）
- [x] Square Webhook実装（`api/webhooks/square.js`、セッション2）
- [x] サイト内通知（購入確認）実装（`notifications`テーブル＋`js/notifications.js`、セッション4）
- [x] Supabaseプロジェクト作成・Vercel環境変数設定・`schema.sql`実行・`js/config.js`反映（セッション5）
- [x] Resendの事前準備（送信元定数化・`RESEND_SEND_ENABLED`スイッチ、セッション6）
- [x] サイトコンテンツ大幅改修（ナビ整理・コンセプト改名・チケット詳細ページ等、セッション7）

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
- メニュー・フッターの変更は `js/layout.js` の `NAV_ITEMS`（「その他」ドロップダウンは2026-07-29セッション7で一時廃止）
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
| チケット詳細ページの表示・購入ボタン | `js/event-detail.js`（HTMLは`event-detail.html`） |
| Supabase接続設定 | `js/config.js` |
| セキュリティヘッダー・`/console`のrewrite | `vercel.json` |
| 管理コンソール（お知らせ配信・お問い合わせ管理） | `admin-announcements.html` / `js/console.js`（`/console`でも開ける） |
| お知らせ配信・お問い合わせ用の共通メール送信 | `api/_mailer.js` |
| `/console`の合言葉認証 | `api/_adminAuth.js` / `api/admin-login.js` |
| お問い合わせフォームの受信 | `api/contact.js` |

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

## 2026-08-01 セッション10（通知パネルのタブ切替バグ修正）

ユーザー報告「タブを切り替えるたびにサムネイルがガタつく（グラっとする）」を調査・修正。

- **根本原因（実際にブラウザで再現して特定）**: `js/notifications.js`の通知タブ（あなたへの
  お知らせ/TFMからのお知らせ）ボタンをクリックすると、そのクリックイベント自身のハンドラ内で
  `renderPanel()`がパネルの中身（クリックされたボタン自身を含む）を丸ごと作り直す。
  その後イベントが`document`までバブリングした際、外側クリックでパネルを閉じる判定
  （旧: `!wrap.contains(e.target)`）が「DOMから切り離された古いボタン要素」を
  外側クリックと誤判定し、**タブ切替のたびに一瞬パネルが閉じていた**。これが「グラっ」の正体
  （画像の話ではなく、パネルの開閉が一瞬起きるイベントバブリングのバグだった）
- **修正**: `wrap.contains(e.target)`を`e.composedPath().includes(wrap)`に変更
  （`composedPath()`はイベント発火時点の経路をスナップショットとして保持するため、
  後からDOMが差し替わっても正しく判定できる）
- **ついでに見つけて直した副次的な問題**: `body_html`に含まれる`<img>`タグは幅しか分からず
  高さが不明な状態で保存されているため、画像デコード完了前後でレイアウトシフトが起きる余地があった。
  `.notif-item-body img` / `.console-card-body img`に固定高さ＋`object-fit:cover`を`!important`で
  適用し（保存済みHTMLのインラインstyleより優先させる必要があるため）、パネルサイズが画像読み込みで
  後から変わらないようにした。`.console-block-thumb`（配信エディタのアップロード画像プレビュー）にも
  同様に固定サイズを適用
- ローカルでダミーデータ（異なる縦横比の画像2種）を使い、タブ切替を繰り返してもパネルが閉じず・
  画像サイズも一定であることを確認。既存のカート・ログイン等への回帰なし

## 2026-08-02 セッション11（決済未完了注文ツール・文字数カウンター・マイページ本格実装）

ユーザーから「簡単なタスクを出してほしい」と依頼を受けて3件着手。3件目（ログインゲート）の相談から
「マイページを本格実装したい」という話に発展し、そのまま実装した。

- **`/console`に「決済未完了の注文」セクションを追加**: 新規`api/admin-orders.js`
  （GET一覧/DELETE、`orders.status='pending'`が対象）。削除してもSquare Webhookが後から届いた場合は
  `square_order_id`で該当行が見つからず静かに無視されるだけなので安全（`api/webhooks/square.js`の
  既存ロジックのまま、コード変更なし）
- **文字数カウンター**: お問い合わせフォーム（`message`）、`/console`のタイトル・段落・ハイライト
  ブロック・お問い合わせ返信欄に、サーバー側の上限（`MAX_MESSAGE`/`MAX_PARAGRAPH_LEN`/
  `MAX_REPLY_LEN`等）と一致した`maxlength`＋残り文字数表示を追加
- **マイページを本格実装**（`members.html`を`[data-auth-gate]`の準備中プレースホルダーから刷新）:
  - 新規`api/my-orders.js`: `api/checkout.js`と同じ方式でSupabaseアクセストークンを再検証し、
    本人の`orders`のみを返す（他人の注文は見えない設計）
  - `members.html`: 挨拶文・ページ内ログアウト・購入履歴（ステータス別バッジ：支払い済み/手続き中/失敗）・
    通知（「あなたへのお知らせ」/「TFMからのお知らせ」タブ、ヘッダーの`Notifications`オブジェクトの
    キャッシュをそのまま再利用し二重実装を避けた）を表示
  - `js/layout.js`のNAV_ITEMSに「マイページ」を追加してナビから直接アクセス可能に
  - `js/ui.js`のアカウントモーダル（ヘッダーの「マイページ」ボタン押下時）に`members.html`への
    リンクを追加
  - **設計判断（ユーザーとの相談で確認済み）**: ヘッダーの通知ベルは今まで通りどのページにいても
    常時表示（「ログインしたら通知がどこでも見える」という要望を既に満たしている）。マイページは
    それとは別に「全件をじっくり見返す場所」という役割分担。ドレスコードの`members-only.html`
    （挨拶文・お知らせ・購入履歴の構成）を参考にした
- **チケット/カートのログイン必須の分かりやすさを改善**（ユーザー確認: 「未ログインの人が購入を
  押したら強制的にログインさせる」動作は元々あったが、分かりにくかったため文言で明示）:
  `js/store.js`のチケット購入モーダル・カートの「ご購入手続きへ」ボタンが、未ログイン時は
  最初から「ログインして購入する」/「ログインしてご購入手続きへ」という文言＋注意書きになるよう変更
  （購入不可の仕様自体はすでにあったため機能面の変更はなし）
- ローカルでダミーデータを使い、マイページの挨拶・購入履歴・通知タブ・ダークセクションでの
  タブ配色（`.section-invert .notif-tabs`を新規追加）を確認。コンソールエラーなし
- **今後の拡張候補として（未着手・要相談）**: アカウント設定（メール/パスワード変更）、
  お気に入り/ウィッシュリスト、自分のお問い合わせ履歴の確認、再購入ショートカットなど。
  「充実させたい」という要望があったため、次回以降に優先度を相談して着手する
- **開発メモ**: ローカルプレビュー中、`python3 -m http.server`のポートを変えずに複数回
  再起動すると、ブラウザプレビューツール側に強いキャッシュが乗ってJSの変更が反映されない
  現象に遭遇した（サーバー側は`curl`で確認する限り常に最新を返していた＝実際のコードの問題ではない）。
  ポート番号を変えると解消したため、`.claude/launch.json`のdemo-siteは`4174`に変更済み

## 2026-08-02 セッション12（マイページの分かりやすさ改善・注文番号の付与）

セッション11の続き。ユーザーからの追加フィードバック3点に対応。

- **マイページへの導線を1段階に短縮**: ヘッダーの「ログイン」ボタンは、ログイン中は今までアカウント
  メニュー（モーダル）を経由してからマイページへ、という二段階だったが、「マイページの場所が
  分かりにくい」との指摘を受けて**ボタンを押すと直接`members.html`へ遷移**するように変更
  （[js/ui.js](../js/ui.js)）。ボタンの表示文言も、ログイン中はメールアドレスの@より前ではなく
  常に「マイページ」に統一（[js/auth.js](../js/auth.js)の`refreshHeaderUI()`）。
  不要になったアカウントメニューのモーダル（`UI.openAccount`）は削除
- **決済にはログイン必須、を今後も守るための恒久ルール化**: 挙動自体は元々あったが
  （購入ボタンを押した瞬間にログインを要求）、`js/store.js`冒頭と`CLAUDE.md`に
  「今後、決済への入口を新設する場合も必ずこの作りにすること」を明記した
- **注文番号（`order_number`）を新規追加**: 内部的にはUUID（`orders.id`）で管理しているが、
  購入者が問い合わせ時に伝えやすいよう`TFM-YYYYMMDD-XXXX`形式の短い番号を`api/checkout.js`が
  注文作成時に生成（UNIQUE制約、衝突時は1回だけ再生成）。購入確認メール・購入完了ページ・
  マイページの購入履歴・`/console`の決済未完了一覧、すべてに表示されるようにした
  （`supabase/schema.sql`に`orders.order_number`列を追加。既存本番テーブルへは追記のALTER文で対応）
- ローカルでダミーデータを使い、チケット/カートの購入ボタン文言（未ログイン時「ログインして購入する」）・
  ヘッダーボタンからのマイページ直接遷移・注文番号の表示（購入完了ページ）を確認。コンソールエラーなし

## 2026-08-02 セッション13（DRESS CODE TOKYOのコードを精読し、良い部分を移植）

ユーザーから「ドレスコードのコードをたくさん見て、取り入れるべきところを取り入れてほしい」と依頼。
`/console`はセッション9で既にほぼ移植済みと確認した上で、`js/auth.js`・`members-only.html`・
`api/square-webhook.js`を中心に読み込み、以下2点を移植した（他は既に同等以上に実装済みと判断）。

- **当日の入場受付コード（`entry_code`）を新規追加**: DRESS CODE TOKYOの`assignEntryCode()`パターンを
  移植。`order_number`（注文作成時に発行、問い合わせ用の識別番号）とは別物で、**支払いが確定した時点**で
  `api/webhooks/square.js`が発行する。見間違いやすい文字（0/O, 1/I/L, U/V等）を除いた文字セットから
  ランダム4文字＋日付で生成し（`TFM-20260802-7K4M`形式）、UNIQUE制約違反時は最大5回まで再生成。
  **チケットを含む注文にだけ発行**（グッズのみの注文には不要と判断し、`orderLineItems`に`type: "ticket"`/
  `"goods"`を新規追加して判定に使用）。確認メール・アプリ内通知・購入完了ページ・マイページの
  購入履歴、すべてに表示
- **`members.html`のログインゲートを二値→三値に変更**: 「Supabase未設定（`Auth.client`がnull）」と
  「設定済みだが未ログイン」を区別できるよう、`js/auth.js`の`gateContent()`に
  `[data-auth-gate-unconfigured]`を追加（DRESS CODE TOKYOの`members-only.html`の
  unconfigured/guest/content の3状態パターンを参考にした）。この属性が無いページでは今まで通り
  二値のまま動作する（後方互換）
- **見送った項目**（理由付き、Exploreエージェントによる比較調査結果）:
  - アイコンのみのコンパクトヘッダーボタン（DRESS CODE TOKYOのモバイル対応パターン）は
    優先度が低いと判断し今回は見送り。必要になれば`.icon-btn`パターンを流用して追加できる
  - OAuth復帰の実装（`sessionStorage`保持方式 vs TFMの`localStorage`フラグ方式）は
    機能的にはほぼ同等のため変更なし
  - `/console`の検索・折りたたみ・セグメント配信等は、セッション9の時点で既にDRESS CODE TOKYOと
    同等のパターンで実装済みと確認（変更不要）
- ローカルでダミーデータを使い、`members.html`の3状態（未設定/未ログイン/ログイン中）の出し分け、
  購入完了ページでの注文番号・受付コード表示を確認。コンソールエラーなし
- **開発メモ**: ローカルプレビューでJSファイルを編集後、同じポートでサーバーを再起動しても
  ブラウザプレビューツール側のキャッシュでJSの変更が反映されないことがある（今回もセッション11に続き発生）。
  ポート番号を変えると解消する。`.claude/launch.json`のdemo-siteは`4175`に変更済み
  （変更のたびにポートを変える必要はなく、JSの変更を確認できないと感じた時だけ変えればよい）

## 2026-08-03 セッション14（ページ見出しに実写真を挿入・マイページ等は写真なしのプレーン見出しに）

ユーザーが `資料/` に7枚の横長スクリーンショット（イベント写真・チラシの合成バナー、約2700×840px）を
投入。撮影時間順に「ホーム・グッズ販売【郵送】・コンセプト・イベント・ニュース・特定商取引・
ボランティアスタッフ」の7ページに対応するとの指定を受けて反映した。

- **`資料/`内のファイル名を用途が分かる名前にリネーム**（例:「グッズ販売【郵送】（見出し背景）.png」。
  ホーム用のみ「ホーム（トップのスライド背景・3分割して使用）.png」）
- **ホーム**: 1枚目のバナー（3枚の写真の横並び合成）をImageMagickで3分割し、既存ヒーローの
  `img/hero/hero1〜3.jpg` を差し替え（既存の「3枚がふわっと切り替わる」スライドショー実装は
  そのまま活用。ユーザー要望「今みたいな三つの画像がふわふわする形」に合致）
- **他6ページ**: `img/page-head/`（新規フォルダ）にWeb用へ縮小したJPEG（横1800px・約110〜200KB）を
  配置し、`.page-head--photo`＋ページ別クラス（`--goods`/`--concept`/`--event`/`--news`/
  `--tokushoho`/`--volunteer`）で見出し帯の斜線の代わりに静止背景として表示。
  サブタイトル（`.page-sub`）は写真上でも読めるよう白チップに載せた
- **マイページ・購入完了ページは写真を入れない方針**（ユーザー判断:「入れるのは負担だから
  斜線をやめて大きく文字表示でいい」）→ 前セッションで適用済みの `.page-head--plain`
  （単色グレー背景）のまま
- ブラウザで7ページ全て確認（写真表示・タイトル可読性・ヒーローのスライド動作・コンソールエラーなし）
- 画像の差し替え方法はCSSのコメントに記載（`img/page-head/`の各jpgを置き換えるだけ。
  元データは`資料/`の「◯◯（見出し背景）.png」）

# 最終更新

**2026-08-03（セッション14）**
ユーザー提供の7枚の横長写真バナーを反映。ホームはヒーロー3分割スライド差し替え、
グッズ/コンセプト/イベント/ニュース/特定商取引/ボランティアの6ページは見出し帯の
写真背景化（`.page-head--photo`）。`資料/`のファイル名も用途別にリネーム。
詳細は「セッション14」節参照。

**2026-08-02（セッション13）**
DRESS CODE TOKYOのコードを精読し、当日の入場受付コード（`entry_code`）システムと、
マイページのログインゲートの3状態化（未設定/未ログイン/ログイン中）を移植。
`/console`は既に同等の水準にあると確認（追加移植なし）。詳細は「セッション13」節参照。

**2026-08-02（セッション12）**
マイページへの導線をヘッダーボタン1クリックに短縮し、常時「マイページ」表記に統一。
決済ログイン必須の恒久ルール化（CLAUDE.md記載）。注文番号（`order_number`、`TFM-YYYYMMDD-XXXX`形式）を
新規追加し、確認メール・購入完了ページ・マイページ・`/console`のすべてに表示。
`supabase/schema.sql`に列追加（要SQL再実行、下記「未完了の作業」参照）。詳細は「セッション12」節参照。

**2026-08-02（セッション11）**
決済未完了注文の管理ツール（`/console`）、文字数カウンター、マイページ本格実装
（購入履歴・お知らせ・挨拶・ログアウト）を追加。チケット/カートのログイン必須UXも分かりやすく改善。
新規ファイル: `api/admin-orders.js`, `api/my-orders.js`。詳細は「セッション11」節参照。

**2026-08-01（セッション10）**
ユーザー報告「タブ切替のたびにサムネイルがガタつく」を調査し、`js/notifications.js`の外側クリック
判定（`wrap.contains(e.target)`）が、タブ切替時のパネル再描画で切り離されたクリック元要素を
誤って「外側」と判定しパネルを閉じてしまうバグと特定・修正（`composedPath()`ベースの判定に変更）。
副次的な画像レイアウトシフト対策として`.notif-item-body img`/`.console-card-body img`/
`.console-block-thumb`に固定サイズを追加。詳細は「セッション10」節参照。

**2026-08-01（セッション9）**
姉妹プロジェクト DRESS CODE TOKYOの`/console`とほぼ同じ概要で、TFMに管理コンソール
（お知らせ配信・お問い合わせ管理）を新規実装。あわせて、これまで送信先未接続で機能していなかった
お問い合わせフォームの受信経路（`api/contact.js`＋`inquiries`テーブル）も新規に用意した。
新規ファイル: `admin-announcements.html`, `js/console.js`, `api/_mailer.js`, `api/_adminAuth.js`,
`api/admin-login.js`, `api/admin-announcements.js`, `api/admin-inquiries.js`,
`api/admin-preview-email.js`, `api/admin-upload-image.js`, `api/contact.js`。
`supabase/schema.sql`に追記（`notifications.body_html`列、`announcements`/`inquiries`テーブル、
既存テーブルの列は無変更）。既存の決済・Webhook・購入確認メールのフローは無変更。
ローカルでDOM構造・テキスト表示・コンソールエラー無しを確認したが、`/api`配下の実地動作
（Supabase/Resendの実クレデンシャルが必要）は未検証。詳細は「2026-08-01 セッション9」節と
「P0.5」参照。

**2026-07-29（セッション8）**
ドキュメント整合性チェックとタスクリストの詳細化。`CLAUDE.md`は最新の状態を確認（修正なし）。
`docs/PROJECT_STATE.md`/`README.md`で見つかった古い記述（`news.html`のナビ分類ミス、
廃止済み`NAV_SUB_ITEMS`への言及、`hagi.html`の説明の古さ）を修正。「未完了の作業」を
P0〜P6の優先度別・担当者明記（あなた/Claude）付きの詳細なタスクリストに再構成した。
コード変更は無し。

**2026-07-29（セッション7）**
サイトコンテンツを大幅改修。ナビの「その他」を廃止しボランティアスタッフのみ昇格、
「企業理念」→「コンセプト」に改名、チケット購入を詳細ページ形式（`event-detail.html`新規）に変更、
NEWSに公式サイトオープンの記事を追加しアコーディオン形式に変更、メンバーを植谷航輝1名に縮小、
hagi.htmlのスポンサー欄を一時削除、商品の`quickAdd`フラグ機構を追加、お問い合わせに種別セレクトを追加、
tokushoho.htmlの連絡先・支払方法を更新。事業者所在地（神奈川県）は履歴に記録が無く未反映
（ユーザーが取引先に確認中）。全変更をブラウザで確認済み、未コミット。

**2026-07-26（セッション6）**
Resendの事前準備を実施。`RESEND_API_KEY`がVercelに設定済み・ドメイン未接続という状況で、
`api/_email.js`に送信元アドレスの定数化（`FROM_EMAIL`）と、本番送信の明示的なスイッチ
（`RESEND_SEND_ENABLED`、`true`の時だけ実送信）を追加。ドメイン接続後は
「`RESEND_FROM_EMAIL`を変更→`RESEND_SEND_ENABLED`を`true`に→Redeploy」の3手順のみで
本番有効化できる構成にした。`.env.example`/`README.md`/`CLAUDE.md`も合わせて更新。

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
