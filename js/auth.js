// ==========================================================
// Auth — ログイン管理（Supabase / Google・メールアドレス）
// ==========================================================
// 設定方法: js/config.js に SUPABASE_URL / SUPABASE_ANON_KEY を書くと有効になります。
// 未設定の間は Auth.client が null になり、ログイン関連の操作は
// 「設定が完了していません」という案内を出すだけで安全に無視されます。

const Auth = {
  client:
    typeof supabase !== "undefined" &&
    typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL &&
    !SUPABASE_URL.includes("YOUR-PROJECT")
      ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null,

  // js/config.js が未設定の間、ログイン系の呼び出し全てがこの形を返す
  // （Supabaseのレスポンス { data, error } と同じ形にして、呼び出し側の分岐を増やさない）
  _notReady() {
    return { data: null, error: { message: "Supabase未設定" } };
  },

  // ---------- セッション取得 ----------
  async getSession() {
    if (!this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session || null;
  },
  async getUser() {
    const session = await this.getSession();
    return session ? session.user : null;
  },

  // ---------- ログイン状態の変化を監視 ----------
  onChange(callback) {
    if (!this.client) return;
    this.client.auth.onAuthStateChange((_event, session) => callback(session));
  },

  // ---------- Googleでログイン（全画面遷移） ----------
  async signInWithGoogle() {
    if (!this.client) return this._notReady();
    await this.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    // ここでブラウザがGoogleへ移動するため、以降のコードは実行されません
  },

  // ---------- メールアドレスでログイン／新規登録 ----------
  async signInWithEmail(email, password) {
    if (!this.client) return this._notReady();
    return this.client.auth.signInWithPassword({ email, password });
  },
  async signUpWithEmail(email, password) {
    if (!this.client) return this._notReady();
    return this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href },
    });
  },
  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.refreshHeaderUI();
  },

  // ---------- ヘッダーの「ログイン」ボタンをログイン状態に応じて更新 ----------
  // ログイン中は常に「マイページ」表記にする（以前はメールアドレスの@より前を表示していたが、
  // 「押した先が何か分かりにくい」という声を受けて、押した先（members.html）が
  // そのまま名前になるよう統一した）
  async refreshHeaderUI() {
    const btn = document.querySelector(".btn-login");
    if (!btn) return;
    const user = await this.getUser();
    if (user) {
      btn.textContent = "マイページ";
      btn.classList.add("is-logged-in");
    } else {
      btn.textContent = "ログイン";
      btn.classList.remove("is-logged-in");
    }
  },

  // ---------- ログイン必須の操作の前に呼ぶ ----------
  // ログイン済みなら即 onReady(session) を実行。
  // 未ログインならログインモーダルを開き、成功後に onReady(session) を実行する。
  async requireLogin(onReady) {
    const session = await this.getSession();
    if (session) {
      onReady(session);
      return;
    }
    UI.openLogin({ onSuccess: (s) => onReady(s) });
  },

  // ---------- ログイン必須ページ／セクションの表示切り替え ----------
  // 使い方: 会員限定の中身を `[data-auth-gate]` で囲み、
  // 未ログイン時の案内を `[data-auth-gate-locked]` で用意しておく（どちらもHTML側は hidden 属性つき）。
  // 任意で `[data-auth-gate-unconfigured]` を用意すると、js/config.js が未設定（Auth.client が null）の間だけ
  // 「ログインしてください」ではなく「準備中です」という別メッセージを出せる
  // （設定不備と未ログインを取り違えさせないため。用意しなければ今まで通り locked 側が表示される）。
  // ログイン状態が変わるたびに呼び直すことで表示を追従させる（onChangeから呼ばれる）。
  async gateContent() {
    const content = document.querySelector("[data-auth-gate]");
    const locked = document.querySelector("[data-auth-gate-locked]");
    const unconfigured = document.querySelector("[data-auth-gate-unconfigured]");
    if (!content && !locked && !unconfigured) return;

    if (!this.client) {
      if (content) content.hidden = true;
      if (locked) locked.hidden = !!unconfigured; // unconfigured側が無ければ従来通りlocked側を表示
      if (unconfigured) unconfigured.hidden = false;
      return;
    }
    if (unconfigured) unconfigured.hidden = true;

    const user = await this.getUser();
    if (content) content.hidden = !user;
    if (locked) locked.hidden = !!user;
  },

  // ---------- Supabaseのエラーメッセージを日本語に ----------
  translateError(err) {
    const msg = (err && err.message) || "";
    if (msg.includes("Supabase未設定")) return "ログイン機能はまだ設定中です。しばらくお待ちください。";
    if (msg.includes("Invalid login credentials")) return "メールアドレスまたはパスワードが正しくありません。";
    if (msg.includes("User already registered")) return "このメールアドレスは既に登録されています。ログインをお試しください。";
    if (msg.includes("Password should be at least")) return "パスワードは6文字以上で入力してください。";
    if (msg.includes("Email not confirmed")) return "メールアドレスの確認が完了していません。届いたメールをご確認ください。";
    return "エラーが発生しました。時間をおいて再度お試しください。";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.refreshHeaderUI();
  Auth.gateContent();
  Auth.onChange(() => {
    Auth.refreshHeaderUI();
    Auth.gateContent();
  });
});
