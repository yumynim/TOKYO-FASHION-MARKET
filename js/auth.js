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
  async refreshHeaderUI() {
    const btn = document.querySelector(".btn-login");
    if (!btn) return;
    const user = await this.getUser();
    if (user) {
      btn.textContent = user.email ? user.email.split("@")[0] : "マイページ";
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
  Auth.onChange(() => Auth.refreshHeaderUI());
});
