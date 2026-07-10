# RE FASHION MARKET — Demo（モノクロ版）

インフルエンサーフリーマーケットイベントサイトのデモ実装です。
既存サイトの**ページ構成・機能仕様**を参考に、白黒基調のデザインで
ビルド不要の静的サイト（素のHTML/CSS/JS）としてゼロから実装しています。

## まず読む: 編集のしかた

- **仕様を決めてもらう** → [要件確認ヒアリングシート.docx](./要件確認ヒアリングシート.docx)（クライアント記入用Word。ドメイン・ログイン・決済・SNS・掲載する人の許諾・特商法・表示件数・フォーム送信先などの決定事項）
- **文章・写真をもらう** → [指示テンプレート.txt](./指示テンプレート.txt)（クライアント記入用。末尾に制作者用の対応表あり）
- **データ（イベント・商品・ニュース・FAQ）** → `js/data.js` を書き換えるだけで反映
- **各ページの文章** → 各HTMLの先頭コメントに「このページで編集する場所」を記載。`★` コメントが編集ポイント
- **メニュー・フッター** → `js/layout.js` の `NAV_ITEMS` / `NAV_SUB_ITEMS`
- **色・サイズ** → `css/style.css` 先頭の `:root`（`--black` を変えれば基調色が一括で変わる）

編集したらブラウザを再読み込みするだけ。ビルドは不要です。

## 構成

| ファイル | 内容 |
|---|---|
| `index.html` | トップ（ヒーロー / チケット購入 / グッズ / NEWS / 開催紹介 / 会社 / FAQ / お問い合わせ） |
| `goods.html` | グッズ販売【郵送】（チェキ商品グリッド 24点） |
| `hagi.html` | 会社ページ（MISSION・VISION / 会社概要 / メンバー / スポンサー / 取材お問い合わせ） |
| `sponsorship.html` | ブース出店&サンプリング（協賛LP＋資料請求フォーム） |
| `event.html` | 過去のイベント一覧 |
| `recruit.html` | 採用情報（社長メッセージ / MVV / 募集要項） |
| `oubo-form.html` | 内定直結型インターン応募フォーム（選考ステップ付き） |
| `volunteer.html` | ボランティアスタッフ応募フォーム |
| `news.html` | ニュース（カテゴリフィルタ＋ページネーション） |
| `tokushoho.html` | 特定商取引法に基づく表示 |
| `sdgs.html` | SDGsの取り組み |
| `influencer-casting.html` | インフルエンサーキャスティング（POP IN LP） |
| `sample-sale.html` | サンプルセール出店申込フォーム |
| `members.html` | メンバー限定ページ（プレースホルダー） |
| `css/style.css` | モノクロテーマ（全ページ共通） |
| `js/layout.js` | 共通ヘッダー/フッターの注入・ナビ・デモフォーム処理 |
| `js/data.js` | イベント・商品・ニュース・FAQ等のデータ（**差し替えはここ**） |
| `js/main.js` | トップページの描画（カウントダウン・グリッド・FAQ等） |

## ダミーデータについて

以下は意図的にダミー/プレースホルダーにしています。公開・実運用の前に差し替えてください。

- **インフルエンサー名・商品**: `js/data.js` の `GOODS` / `PAST_INFLUENCERS`（実在の方の名前・写真は使用していません）
- **会社情報・代表者名・住所・電話・メール**: `hagi.html` / `tokushoho.html`（すべてダミー表記）
- **画像**: すべてCSSのプレースホルダー（元サイトの画像は使用していません）
- **フォーム**: 送信処理なし（バリデーション＋完了メッセージ表示のみのデモ）


## SEO / 公開ドメインについて

本番用にSEOを有効化済み（noindex解除・meta description・OGP・Twitterカード・JSON-LD構造化データ・sitemap.xml・robots.txt）。

⚠️ **公開ドメインが決まったら要更新**（現在は仮ドメイン `https://tokyo-fashion-market.vercel.app` で設定）：
1. 全HTMLの `https://tokyo-fashion-market.vercel.app` を実ドメインに一括置換（canonical / og:url / og:image / JSON-LD）
2. `robots.txt` と `sitemap.xml` の同URLも置換
3. 独自ドメインを使う場合はVercelのドメイン設定も行う

SNSシェア画像は `img/ogp.jpg`（1200×630）。差し替え可。

## Vercelへのデプロイ

1. VercelでこのGitHubリポジトリをImport
2. Framework Preset: **Other** / Build Command: **なし** / Output Directory: **そのまま（ルート）**
3. Deployを押すだけ（環境変数・ビルド設定は不要）

`vercel.json` のセキュリティヘッダーは自動で適用されます。

## デプロイ時のセキュリティ

- `vercel.json` — セキュリティヘッダー
  - CSP（`script-src 'self'` — インラインスクリプト全廃済み。`'unsafe-inline'` 不使用の厳格設定）
  - `X-Frame-Options: DENY` / `frame-ancestors 'none'`（クリックジャッキング対策）
  - `X-Content-Type-Options: nosniff` / HSTS / Referrer-Policy / Permissions-Policy
- `robots.txt` + 全ページ `noindex` メタ + `X-Robots-Tag` ヘッダー — 検索エンジンへのインデックス防止
- `404.html` — 存在しないURLへのアクセスにはモノクロの404ページを返却
- 静的サイトのため秘密情報・APIキーなし
- フォームはバックエンド未接続（実運用時は Formspree 等 + スパム対策を追加すること）
- 「ログイン」ボタンは見た目のみ（認証機能なし）

### 検索エンジンに載せたい場合

デモの段階では `noindex` を推奨します。正式に公開する場合は:

1. 全HTMLの `<meta name="robots" content="noindex, nofollow">` を削除
2. `vercel.json` の `X-Robots-Tag` ヘッダー行を削除
3. `robots.txt` を `Allow: /` に変更
4. ブランド名・会社情報・商品データを自分のものに差し替え（他社ブランドのままの公開はなりすましと見なされるリスクがあります）

## ローカルでの確認

このフォルダ（`~/Applications/Demo`）で:

```bash
python3 -m http.server 4173
# → http://localhost:4173 をブラウザで開く
```

## GitHubへの反映

```bash
git add -A
git commit -m "変更内容"
git push
```

Vercelを接続していれば、pushするだけで自動デプロイされます。
