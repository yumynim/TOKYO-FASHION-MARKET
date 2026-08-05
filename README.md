# TOKYO FASHION MARKET（TFM）

ファッションインフルエンサーが集う、東京のPOPUP・フリーマーケットの公式サイトです。
サイト本体はビルド不要の静的HTML/CSS/JS。ログイン（Supabase Auth）と
決済（Square）だけ `/api` 配下の Vercel Serverless Functions（Node）で処理します。

## まず読む: 編集のしかた

- **仕様を決めてもらう** → [要件確認ヒアリングシート.docx](./要件確認ヒアリングシート.docx)（クライアント記入用Word）
- **文章・写真をもらう** → [指示テンプレート.txt](./指示テンプレート.txt)（クライアント記入用）
- **データ（イベント・商品・ニュース・FAQ）** → `js/data.js` を書き換えるだけで反映
- **各ページの文章** → 各HTMLの先頭コメントに「このページで編集する場所」を記載。`★` コメントが編集ポイント
- **メニュー・フッター** → `js/layout.js` の `NAV_ITEMS`（「その他」ドロップダウンは現在廃止中）
- **色・サイズ** → `css/style.css` 先頭の `:root`（`--black` を変えれば基調色が一括で変わる）

編集したらブラウザを再読み込みするだけ。フロント側の編集にビルドは不要です。

## 構成

| ファイル | 内容 |
|---|---|
| `index.html` | トップ（ヒーロー / チケット購入 / グッズ / NEWS / 開催紹介 / 会社 / FAQ / お問い合わせ） |
| `goods.html` | グッズ販売【郵送】（チェキ商品グリッド 24点） |
| `hagi.html` | コンセプト・運営者情報・メンバー（旧: 企業理念。スポンサー欄は一時削除） |
| `event.html` | 過去のイベント一覧 |
| `event-detail.html` | チケット詳細ページ（`?i=<EVENTSの配列番号>`。写真最大3枚対応） |
| `tokushoho.html` | 特定商取引法に基づく表示 |
| その他 `*.html`（`volunteer.html`除く） | 採用・SDGs・協賛LP 等。ページは現存するが現在ナビからは非表示 |
| `checkout-complete.html` | Square決済完了後の戻り先ページ（`/api/order-status`をポーリングし実際の結果を表示） |
| `admin-announcements.html`（`/console`） | 管理コンソール。運営からのお知らせ配信・お問い合わせ返信（合言葉ログイン） |
| `css/style.css` | モノクロテーマ（全ページ共通） |
| `js/data.js` | イベント・商品・ニュース・FAQ等のデータ（**まずここを編集**） |
| `js/layout.js` | 共通ヘッダー/フッターの注入・ナビ |
| `js/config.js` | Supabaseの接続先（公開してよい値のみ。**ここにservice_role keyは書かない**） |
| `js/auth.js` | ログイン管理（Google／メールアドレス、Supabase Auth）＋ログインゲート（`gateContent()`） |
| `js/notifications.js` | アプリ内通知（`notifications`＝あなたへのお知らせ、`announcements`＝TFMからのお知らせ）の取得・既読化・ヘッダーの通知ベルUI |
| `js/ui.js` | モーダル・ログイン画面・アカウントメニュー |
| `js/store.js` | カート・チェックアウト（ログイン確認 → Square決済へ） |
| `js/checkout-complete.js` | 購入完了ページの注文確認ポーリング・表示 |
| `js/console.js` | 管理コンソール（`/console`）の挙動。CSPのためインラインscriptにせず外出し |
| `js/vendor/supabase.min.js` | Supabase JS SDK（CSPを`script-src 'self'`に保つため自己ホスト） |
| `api/checkout.js` | Square決済リンクを作成するサーバー関数（ログイン再検証・価格検証・注文レコード作成） |
| `api/_catalog.js` | サーバー側の価格マスタ（`js/data.js`と手動で同期させる） |
| `api/_email.js` | 購入確認メール送信（Resend HTTP APIを直接fetch。既存の決済フロー専用） |
| `api/_mailer.js` | お知らせ配信・お問い合わせ対応用の共通メール送信処理（ブロックエディタのHTML生成含む） |
| `api/_adminAuth.js` | `/console`の合言葉トークン発行・検証 |
| `api/order-status.js` | 購入完了ページ用の注文ステータス確認API |
| `api/webhooks/square.js` | Square Webhook受信（署名検証→注文確定→確認メール送信→アプリ内通知作成） |
| `api/contact.js` | お問い合わせフォームの送信先（`inquiries`へ保存・運営通知・自動受付メール） |
| `api/admin-login.js` | `/console`のパスワード検証・トークン発行 |
| `api/admin-announcements.js` | お知らせ配信（全員／個人／購入者／決済未完了者）の投稿・削除 |
| `api/admin-inquiries.js` | `/console`のお問い合わせ一覧・返信 |
| `api/admin-preview-email.js` | 配信エディタのメールプレビュー生成（送信はしない） |
| `api/admin-upload-image.js` | 配信エディタの画像アップロード（Supabase Storage） |
| `supabase/schema.sql` | `orders` / `notifications` / `announcements` / `inquiries` テーブルのDDL（Supabase SQL Editorで実行） |

## ログイン → 決済 → 購入確認メールの仕組み

1. カートの「ご購入手続きへ」／チケットの「購入する」を押す
2. **未ログインなら** ログイン／新規登録モーダルが自動で開く（Googleまたはメールアドレス）
   - Googleは画面遷移をともなうため、ログイン後は**自動で決済処理を再開**します（`localStorage`に一時フラグを保存）
3. ログイン済みなら、カート内容を `/api/checkout` に送信
4. サーバー側（`api/checkout.js`）で
   - Supabaseのアクセストークンを**再検証**（フロントのチェックだけを信用しない）
   - 金額は `api/_catalog.js` の価格マスタから取得（**ブラウザから送られた金額は使わない**＝改ざん対策）
   - Supabaseの `orders` テーブルに `status: "pending"` の注文レコードを作成
   - Squareの決済リンク（Payment Link）を作成し、戻り先URLに `?order=<注文ID>` を付与
5. 作成された決済ページへ遷移 → Square側で支払い → `checkout-complete.html?order=...` に戻る
6. **`checkout-complete.html` はまだ「完了」と決め打ちしない**。`/api/order-status` を数秒おきにポーリングし、
   実際に Webhook で支払いが確認できてから購入内容を表示する
7. Square が決済確定後に `payment.updated` Webhook を `/api/webhooks/square` に送信
   - 署名（`SQUARE_WEBHOOK_SIGNATURE_KEY`）を検証
   - `orders` テーブルの該当行を `pending → paid` に更新（**`pending`の行だけを対象に更新**することで、
     Webhookの重複配信があってもメールが二重送信されない設計）
   - 更新できた場合のみ、Resend経由で購入確認メールを送信（`api/_email.js`）

これにより、購入者には実際に支払いが確定した時点でのみメールが届き、購入完了ページにも
実際の注文内容（商品名・数量・合計金額）が表示されます。

⚠️ **既知の制約**: マイページ（購入履歴の一覧・詳細）は未実装です。購入確認は
「購入完了ページでの表示」と「メール」と「ヘッダーの通知ベル」の3箇所のみで、
ログイン後に過去の注文履歴を振り返る画面はまだありません。

## 管理コンソール（`/console`）

運営が会員へのお知らせ配信・お問い合わせ対応をコード変更なしで行うための管理画面。
Supabaseの個人アカウントではなく、`ADMIN_CONSOLE_PASSWORD`（Vercel環境変数）を知っている人なら
誰でも使える合言葉方式。

- お知らせ配信: 「会員全員に送る」／「個人宛てに送る」／「購入者に送る（商品/チケット単位）」／
  「手続き中の人に送る（決済未完了）」の4種類。見出し・画像・ボタン等を組み立てるブロックエディタと、
  実際に届くメールのライブプレビュー付き
- お問い合わせ管理: サイトのお問い合わせフォーム（`/api/contact`）から届いた内容の一覧・返信
- 会員全員宛ての投稿は`announcements`テーブルに保存され、ヘッダーの通知ベル「TFMからのお知らせ」タブに
  会員全員へ表示される。個人／購入者／決済未完了者宛ては`notifications`テーブル（本人の「あなたへの
  お知らせ」タブにのみ表示）を使う

セットアップ:
1. `supabase/schema.sql`（`announcements`/`inquiries`テーブル・`notifications.body_html`列の追加分）を
   Supabase SQL Editorで実行
2. Vercel環境変数に `ADMIN_CONSOLE_PASSWORD`（必須）・`CONTACT_TO_EMAIL`（任意、お問い合わせの見逃し
   防止通知の宛先）を設定 → Redeploy
3. 画像アップロード機能を使う場合は、Supabase Storageに `announcement-images`（Publicバケット）を
   手動作成（未作成でも他の機能には影響しない）
4. `https://<本番ドメイン>/console` にアクセスし、合言葉でログイン

メール送信は購入確認メールと同じ安全スイッチ（`RESEND_API_KEY`/`RESEND_FROM_EMAIL`/
`RESEND_SEND_ENABLED=true`）を共有しているため、ドメイン未接続の間はお知らせ配信・お問い合わせ
返信のメールも自動的にスキップされる（サイト内通知・DB保存は影響を受けない）。

- 会員名簿: 会員1人ごとに登録情報・購入履歴（受付コード・入場状況）・配信したお知らせ・
  お問い合わせをまとめて確認できる。「支払い済みなのに受付コード未発行」の注文も
  ここで自動検知される（Webhook不達などの事故の早期発見用）

## 当日の入場確認（`/checkin`）

イベント当日、スタッフが受付コード（QR）を読み取って入場を記録するページ。

- **受付コードは「1人1コード」**。数量2でチケットを買うと別々のコードが2つ発行され、
  確認メール・通知にQR付きで届く（1コード＝1人＝1回入場。QRはサーバー側で生成して
  base64で直接埋め込むため、外部サービスの障害に左右されない）
- カメラでのQR読み取り（Android Chrome等の`BarcodeDetector`対応ブラウザ。iPhoneは手入力）と手入力の両対応
- 誤操作の取り消し、「コードが分からない方」をお名前・メールアドレスから探して入場させる機能付き
- **開催日ゲート**: `CURRENT_EVENT_ID`（例: `0927` = 9月27日）から開催日を判定し、
  当日以外の読み取りを拒否する。テスト時は `EVENT_DATE`（`YYYY-MM-DD` または `any`）で上書きできる
  （テスト後は必ず削除）

合言葉は2種類:
- `ADMIN_CONSOLE_PASSWORD` … 運営用。`/console` と `/checkin` の両方が使える
- `CHECKIN_PASSWORD`（任意） … 当日スタッフ用。`/checkin` だけ使える
  （お問い合わせ・会員名簿・一斉配信には触れない。ボランティアに渡すのはこちら）

セットアップ:
1. `supabase/schema.sql`（`entry_passes`/`entry_code_counters`テーブル・発行/入場/取り消し関数の追加分）を
   Supabase SQL Editorで実行
2. イベントが決まったらVercel環境変数に `CURRENT_EVENT_ID`（例: `0927`）を設定 → Redeploy
3. 当日スタッフに手伝ってもらう場合は `CHECKIN_PASSWORD` も設定
4. `https://<本番ドメイン>/checkin` を当日スタッフの端末で開き、合言葉でログイン

## 今後の設定手順（Vercel / Supabase / Resend / Square）

### 1. Supabase
1. [supabase.com](https://supabase.com) で Organization「TFM」を作成し、Project を1つ作成
2. Authentication → Providers で **Google** を有効化（Google Cloud Console側でOAuthクライアントID/Secretを発行して設定）
3. Authentication → URL Configuration に本番URLと `http://localhost:xxxx` を Redirect URLs として登録
4. Authentication → Emails → SMTP Settings で **Resendを送信元に設定**（デフォルトのSupabaseメールは本番利用に非推奨・レート制限あり）
5. Project Settings → API から `Project URL` と `anon public key` を取得 → `js/config.js` に書く
6. 同じ画面の `service_role key` は **Vercelの環境変数にのみ** 設定（コードに書かない）
7. **SQL Editor で [`supabase/schema.sql`](./supabase/schema.sql) の内容を実行**（`orders` / `notifications` の
   2テーブルを作成。`orders`は購入確認メール・購入完了ページの表示に必須、`notifications`はヘッダーの
   通知ベル表示に必須）

### 2. Resend
1. [resend.com](https://resend.com) で Team「TFM」を作成
2. 送信ドメイン（本ドメイン確定後、`mail.`等のサブドメイン推奨）を追加し、SPF/DKIM/DMARCのDNSレコードを設定
3. SupabaseのAuthメール送信用に、SMTP認証情報をSupabase側に設定（上記1-4）
4. **購入確認メール用**に送信専用スコープのAPIキーを発行し、Vercelの環境変数 `RESEND_API_KEY` に設定

**独自ドメイン接続前の現在の状態**: `RESEND_API_KEY` は設定済みだが `RESEND_SEND_ENABLED` を
`true` にしていないため、実際のメール送信はまだ無効（`api/_email.js` が常にスキップする）。
ドメイン接続後、以下の3ステップだけで本番送信を有効化できる（コード変更は不要）。
1. 上記2でドメインのDNS認証（SPF/DKIM/DMARC）を完了させる
2. Vercelの環境変数 `RESEND_FROM_EMAIL` を認証済みドメインの送信元アドレスに変更
3. Vercelの環境変数 `RESEND_SEND_ENABLED` を `true` に変更 → Redeploy

### 3. Square
1. Square Developer Dashboard でアプリを作成し、**Sandbox**の Access Token でまず動作確認
2. 店舗情報から **Location ID** を取得
3. **Webhookを設定**（Developer Dashboard → Webhooks → Subscriptions）
   - Notification URL: `{SITE_URL}/api/webhooks/square`
   - 購読イベント: `payment.updated`
   - 発行される Signature Key を Vercel の環境変数 `SQUARE_WEBHOOK_SIGNATURE_KEY` に設定
   - Sandboxで実際にテスト決済を行い、`checkout-complete.html` に購入内容が表示されメールが届くことを確認
4. 本番公開前に Production の Access Token / Location ID / Webhook（Sandboxとは別に本番用が必要）を取得し、
   `SQUARE_ENVIRONMENT=production` に切り替える

### 4. Vercel（デプロイ）
1. このGitHubリポジトリをImport（Framework Preset: **Other**、Build Command不要）
2. Project Settings → Environment Variables に以下を設定（値は `.env.example` を参照。実値はここに書かない）

| 変数名 | 公開可否 |
|---|---|
| `SUPABASE_URL` | 公開可（`js/config.js`にも同じ値を書く） |
| `SUPABASE_ANON_KEY` | 公開可（同上） |
| `SUPABASE_SERVICE_ROLE_KEY` | **非公開・Vercelのみ** |
| `SQUARE_ACCESS_TOKEN` | **非公開・Vercelのみ** |
| `SQUARE_LOCATION_ID` | 非公開推奨 |
| `SQUARE_ENVIRONMENT` | `sandbox` または `production` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | **非公開・Vercelのみ** |
| `RESEND_API_KEY` | **非公開・Vercelのみ** |
| `RESEND_FROM_EMAIL` | 公開可（送信元アドレス。★ドメイン接続後はこれだけ変更すればよい） |
| `RESEND_SEND_ENABLED` | 公開可。`true`の時だけ実際に送信する本番スイッチ（ドメイン接続完了までは未設定/`false`のままにする） |
| `SITE_URL` | 公開可（決済完了後の戻り先URL・Webhook署名検証に使用） |
| `ADMIN_CONSOLE_PASSWORD` | **非公開・Vercelのみ**（`/console`のログイン合言葉） |
| `CONTACT_TO_EMAIL` | 非公開推奨（お問い合わせフォームの「届きました」通知メールの宛先。未設定でも保存自体は動作する） |
| `CHECKIN_PASSWORD` | **非公開・Vercelのみ**（任意。当日スタッフ用の合言葉。`/checkin`だけ使える） |
| `ADMIN_TOKEN_SECRET` | **非公開・Vercelのみ**（任意・推奨。管理トークンの署名鍵。`openssl rand -hex 32`等で生成） |
| `CURRENT_EVENT_ID` | 公開可（今回のイベント識別番号。例: `0927`。受付コードの識別と開催日判定に使用） |
| `EVENT_DATE` | 公開可（テスト用。通常は未設定。`YYYY-MM-DD`か`any`。**テスト後は必ず削除**） |

3. Deploy。`/api` 配下のファイルは自動でサーバーレス関数として認識されます（追加設定不要）

## ダミーデータについて

以下は公開前に差し替えが必要です。

- **インフルエンサー名・商品**: `js/data.js` の `GOODS` / `PAST_INFLUENCERS`（実在の方の名前・写真は未使用）
- **チケット・商品価格**: `js/data.js` を変更したら、**`api/_catalog.js` にも同じ内容を必ず反映**（決済で使われる金額はこちらが正）
- **会社情報**: `hagi.html` / `tokushoho.html`
- **画像**: 一部CSSプレースホルダーのまま

## SEO / 公開ドメインについて

meta description・OGP・Twitterカード・JSON-LD構造化データ・sitemap.xml・robots.txt 設定済み。

**独自ドメイン `https://tokyofashionmarket.com` に接続済み**（2026-08-04、Vercel・Resendとも接続完了）。
全HTML・`robots.txt`・`sitemap.xml`のURLは一括置換済み。残っているのは以下のみ：
- [ ] Vercel環境変数 `SITE_URL` を `https://tokyofashionmarket.com` に変更 → Redeploy
  （Square Webhookを設定する際は、この`SITE_URL`を使ってNotification URLを組み立てるため、
  Square設定より前にこれを終わらせておくと二度手間にならない）

SNSシェア画像は `img/ogp.jpg`（1200×630）。差し替え可。

## セキュリティ

- `vercel.json` — CSP（`script-src 'self'`、インラインスクリプト不使用。Supabaseとの通信のみ `connect-src` で許可）／`X-Frame-Options: DENY`／HSTS／Referrer-Policy／Permissions-Policy
- 秘密情報（`service_role key` / Square Access Token）は **Vercelの環境変数にのみ**。コード・Git・メモリに書かない（`.gitignore`で`.env`除外済み）
- 決済金額はサーバー側カタログ（`api/_catalog.js`）から取得し、クライアントの送信値は信用しない
- `/api/checkout` はSupabaseのアクセストークンをサーバー側で毎回再検証（フロントのログイン確認だけでは突破できない設計）
- `/api/webhooks/square` はSquareの署名（`SQUARE_WEBHOOK_SIGNATURE_KEY`によるHMAC-SHA256）を毎回検証し、
  検証に失敗したリクエストは401で拒否する
- `orders` テーブルはRLSを有効化した上でポリシーを一切作成していない（anon/authenticatedからは常に不可視）。
  `/api/order-status` は推測困難なUUIDを条件に、service_role経由で最小限の情報のみを返す
- `404.html` — 存在しないURLへのアクセスにはモノクロの404ページを返却

## ローカルでの確認

このフォルダ（`~/アプリケーション/TOKYO-FASHION-MARKET`）で:

```bash
python3 -m http.server 4173
# → http://localhost:4173 をブラウザで開く
```

フロント（見た目・カート・ログイン画面の表示）はこれで確認できますが、
`/api` 配下（`checkout` / `order-status` / `webhooks/square`）はVercel環境でのみ動作します
（`vercel dev` を使うとローカルでも試せます。Square Webhookのローカル検証には
[Square CLI](https://developer.squareup.com/docs/square-cli/overview) 等でのトンネリングが必要）。

## GitHubへの反映

```bash
git add -A
git commit -m "変更内容"
git push
```

Vercelを接続していれば、pushするだけで自動デプロイされます。
