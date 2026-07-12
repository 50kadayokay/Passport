import React, { useState } from "react";
import { Loader2, Lock, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { signIn, signUp } from "../lib/auth.js";

// Email/password auth card. `title`/`subtitle` let callers reframe it
// (e.g. company hub vs. admin). onSuccess fires after a session is established.
export default function LoginScreen({ onSuccess, title = "Sign in to Passport", subtitle = "Manage your company profile" }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { session, needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation && !session) { setConfirm(true); return; }
      } else {
        await signIn(email.trim(), password);
      }
      onSuccess && onSuccess();
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  if (confirm) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-500"><CheckCircle2 size={28} /></div>
          <h1 className="text-[22px] font-extrabold text-slate-900">Check your email</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">We sent a confirmation link to <b>{email}</b>. Click it, then come back and sign in.</p>
          <button onClick={() => { setConfirm(false); setMode("signin"); }} className="mt-6 text-[14px] font-bold text-emerald-600">Back to sign in</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-emerald-600">Passport</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-slate-900">{mode === "signup" ? "Create your account" : title}</h1>
      <p className="mt-1.5 text-[14px] text-slate-500">{mode === "signup" ? "Start building your company profile." : subtitle}</p>

      <form onSubmit={submit} className="mt-6 space-y-3.5">
        <Field icon={Mail}><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>
        <Field icon={Lock}><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>

        {error && <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}

        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13.5px] text-slate-500">
        {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
        <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }} className="font-bold text-emerald-600">
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-[400px] rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.4)]">{children}</div>
    </div>
  );
}

function Field({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-emerald-400">
      <Icon size={18} className="flex-shrink-0 text-slate-400" />
      {children}
    </div>
  );
}
