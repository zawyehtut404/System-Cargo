import React, { useState } from "react";

export default function LoginPanel({ configured, session, profile, authReady, authError, onLogin, onLogout }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return <div className="notice warning">
      <strong>Supabase is not connected.</strong>
      <span>Receipt editing still works locally. Add the project URL and publishable/anon key to your environment to enable login, history, and public tracking.</span>
    </div>;
  }

  if (!authReady) return <div className="notice">Checking Supabase session…</div>;

  if (session) {
    return <div className="auth-card">
      <div>
        <strong>{profile?.full_name || session.user.email}</strong>
        <span>{profile ? `${profile.role} · ${profile.is_active ? "Active" : "Awaiting admin activation"}` : "Loading staff profile…"}</span>
      </div>
      <button className="btn secondary" onClick={onLogout}>Sign out</button>
      {authError && <p className="form-error full">{authError}</p>}
      {profile && !profile.is_active && <p className="form-error full">This account is inactive. Ask an administrator to activate it before using cargo data.</p>}
    </div>;
  }

  return <form className="auth-card login-form" onSubmit={submit}>
    <div>
      <strong>Staff sign in</strong>
      <span>Sign in to save shipments and view cargo history.</span>
    </div>
    <label className="field"><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label className="field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    {(message || authError) && <p className="form-error full">{message || authError}</p>}
  </form>;
}
