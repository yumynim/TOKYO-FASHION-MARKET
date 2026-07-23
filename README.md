# TOKYO FASHION MARKET（TFM）

ファッションインフルエンサーが集う、東京のPOPUP・フリーマーケットの公式サイトです。
サイト本体はビルド不要の静的HTML/CSS/JS。ログイン（Supabase Auth）と
決済（Square）だけ `/api` 配下の Vercel Serverless Functions（Node）で処理します。

## まず読む: 編集のしかた

- **仕様を決めてもらう** → [要件確認ヒアリングシート.docx](./要件確認ヒアリングシート.docx)（クライアント記入用Word）
- **文章・写真をもらう** → [指示テンプレート.txt](./指示テンプレート.txt)（クライアント記入用）
- **データ（イベント・商品・ニュース・FAQ）** → `js/data.js` を書き換えるだけで反映
- **各ページの文章** → 各HTMLの先頭コメントに「このページで編集する場所」を記載。`★` コメントが編集ポイント
- **メニュー・フッター** → `js/layout.js` の `NAV_ITEMS` / `NAV_SUB_ITEMS`
- **色・サイズ** → `css/style.css` 先頭の `:root`（`--black` を変えれば基調色が一括で変わる）

編集したらブラウザを再読み込みするだけ。フロント側の編集にビルドは不要です。

## 構成

| ファイル | 内容 |
|---|---|
| `index.html` | トップ（ヒーロー / チケット購入 / グッズ / NEWS / 開催紹介 / 会社 / FAQ / お問い合わせ） |
| `goods.html` | グッズ販売【郵送】（チェキ商品グリッド 24点） |
| `hagi.html` | 企業理念・運営者情報・メンバー・スポンサー |
| `event.html` | 過去のイベント一覧 |
| `tokushoho.html` | 特定商取引法に基づく表示 |
| その他 `*.html` | 採用・ボランティア・SDGs・協賛LP 等（`js/layout.js` の「その他」メニュー参照） |
| `checkout-complete.html` | Square決済完了後の戻り先ページ |
| `css/style.css` | モノクロテーマ（全ページ共通） |
| `js/data.js` | イベント・商品・ニュース・FAQ等のデータ（**まずここを編集**） |
| `js/layout.js` | 共通ヘッダー/フッターの注入・ナビ |
| `js/config.js` | Supabaseの接続先（公開してよい値のみ。**ここにservice_role keyは書かない**） |
| `js/auth.js` | ログイン管理（Google／メールアドレス、Supabase Auth） |
| `js/ui.js` | モーダル・ログイン画面・アカウントメニュー |
| `js/store.js` | カート・チェックアウト（ログイン確認 → Square決済へ） |
| `js/vendor/supabase.min.js` | Supabase JS SDK（CSPを`script-src 'self'`に保つため自己ホスト） |
| `api/checkout.js` | Square決済リンクを作成するサーバー関数（ログイン再検証・価格検証を実施） |
| `api/_catalog.js` | サーバー側の価格マスタ（`js/data.js`と手動で同期させる） |

## ログイン → 決済の仕組み

1. カートの「ご購入手続きへ」／チケットの「購入する」を押す
2. **未ログインなら** ログイン／新規登録モーダルが自動で開く（Googleまたはメールアドレス）
   - Googleは画面遷移をともなうため、ログイン後は**自動で決済処理を再開**します（`localStorage`に一時フラグを保存）
3. ログイン済みなら、カート内容を `/api/checkout` に送信
4. サーバー側で
   - Supabaseのアクセストークンを**再検証**（フロントのチェックだけを信用しない）
   - 金額は `api/_catalog.js` の価格マスタから取得（**ブラウザから送られた金額は使わない**＝改ざん対策）
   - Squareの決済リンク（Payment Link）を作成
5. 作成された決済ページへ遷移 → Square側で支払い → `checkout-complete.html` に戻る

⚠️ **今回実装していない範囲**: Square側の決済が実際に成功したかどうかの最終確認（Webhook）。
`checkout-complete.html` はURLを直接開いても表示されてしまうため、正式な注文確定・在庫管理を行うなら
Square Webhook（`payment.updated`等）を受けてSupabaseに記録する仕組みを別途追加してください。

## 今後の設定手順（Vercel / Supabase / Resend / Square）

### 1. Supabase
1. [supabase.com](https://supabase.com) で Organization「TFM」を作成し、Project を1つ作成
2. Authentication → Providers で **Google** を有効化（Google Cloud Console側でOAuthクライアントID/Secretを発行して設定）
3. Authentication → URL Configuration に本番URLと `http://localhost:xxxx` を Redirect URLs として登録
4. Authentication → Emails → SMTP Settings で **Resendを送信元に設定**（デフォルトのSupabaseメールは本番利用に非推奨・レート制限あり）
5. Project Settings → API から `Project URL` と `anon public key` を取得 → `js/config.js` に書く
6. 同じ画面の `service_role key` は **Vercelの環境変数にのみ** 設定（コードに書かない）
7. （フォーム保存やDB連携を追加するタイミングで）テーブル作成＋RLSを有効化

### 2. Resend
1. [resend.com](https://resend.com) で Team「TFM」を作成
2. 送信ドメイン（本ドメイン確定後、`mail.`等のサブドメイン推奨）を追加し、SPF/DKIM/DMARCのDNSレコードを設定
3. SupabaseのAuthメール送信用に、SMTP認証情報をSupabase側に設定（上記1-4）
4. お問い合わせ等のフォーム送信メール機能を作る場合は、送信専用スコープのAPIキーを発行してVercelの環境変数へ

### 3. Square
1. Square Developer Dashboard でアプリを作成し、**Sandbox**の Access Token でまず動作確認
2. 店舗情報から **Location ID** を取得
3. 本番公開前に Production の Access Token / Location ID を取得し、`SQUARE_ENVIRONMENT=production` に切り替え
4. 必要であれば Webhook（決済完了通知）を設定し、`api` に受信用エンドポイントを追加

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
| `SITE_URL` | 公開可（決済完了後の戻り先URLに使用） |

3. Deploy。`/api/checkout.js` は自動でサーバーレス関数として認識されます（追加設定不要）

## ダミーデータについて

以下は公開前に差し替えが必要です。

- **インフルエンサー名・商品**: `js/data.js` の `GOODS` / `PAST_INFLUENCERS`（実在の方の名前・写真は未使用）
- **チケット・商品価格**: `js/data.js` を変更したら、**`api/_catalog.js` にも同じ内容を必ず反映**（決済で使われる金額はこちらが正）
- **会社情報**: `hagi.html` / `tokushoho.html`
- **画像**: 一部CSSプレースホルダーのまま

## SEO / 公開ドメインについて

meta description・OGP・Twitterカード・JSON-LD構造化データ・sitemap.xml・robots.txt 設定済み。

⚠️ **公開ドメインが決まったら要更新**（現在は仮ドメイン `https://tokyo-fashion-market.vercel.app`）：
1. 全HTMLの `https://tokyo-fashion-market.vercel.app` を実ドメインに一括置換（canonical / og:url / og:image / JSON-LD）
2. `robots.txt` と `sitemap.xml` の同URLも置換
3. `.env` の `SITE_URL` も実ドメインに変更
4. 独自ドメインを使う場合はVercelのドメイン設定も行う

SNSシェア画像は `img/ogp.jpg`（1200×630）。差し替え可。

## セキュリティ

- `vercel.json` — CSP（`script-src 'self'`、インラインスクリプト不使用。Supabaseとの通信のみ `connect-src` で許可）／`X-Frame-Options: DENY`／HSTS／Referrer-Policy／Permissions-Policy
- 秘密情報（`service_role key` / Square Access Token）は **Vercelの環境変数にのみ**。コード・Git・メモリに書かない（`.gitignore`で`.env`除外済み）
- 決済金額はサーバー側カタログ（`api/_catalog.js`）から取得し、クライアントの送信値は信用しない
- `/api/checkout` はSupabaseのアクセストークンをサーバー側で毎回再検証（フロントのログイン確認だけでは突破できない設計）
- `404.html` — 存在しないURLへのアクセスにはモノクロの404ページを返却

## ローカルでの確認

このフォルダ（`~/Applications/TOKYO-FASHION-MARKET`）で:

```bash
python3 -m http.server 4173
# → http://localhost:4173 をブラウザで開く
```

フロント（見た目・カート・ログイン画面の表示）はこれで確認できますが、
`/api/checkout` はVercel環境でのみ動作します（`vercel dev` を使うとローカルでも試せます）。

## GitHubへの反映

```bash
git add -A
git commit -m "変更内容"
git push
```

Vercelを接続していれば、pushするだけで自動デプロイされます。
