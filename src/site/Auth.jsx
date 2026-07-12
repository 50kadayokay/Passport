import React, { useState, useEffect } from "react";
import { Loader2, Mail, Lock, AlertTriangle, CheckCircle2, Building2, LineChart, ArrowLeft } from "lucide-react";
import { signIn, signUp, getMyRole, requestPasswordReset, consumeHashSession, updatePassword } from "../lib/auth.js";

const qs = () => new URLSearchParams(window.location.search);

async function redirectByRole() {
  const role = await getMyRole();
  if (role === "admin") location.assign("/admin");
  else if (role === "investor") location.assign("/app");
  else location.assign("/onboarding"); // company → manage/build profile
}

// mode: "signup" | "login"
export default function Auth({ mode }) {
  const isSignup = mode === "signup";
  const [type, setType] = useState(qs().get("type") === "investor" ? "investor" : "company");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (isSignup) {
        const { session, needsConfirmation } = await signUp(email.trim(), password, { role: type });
        if (needsConfirmation && !session) { setConfirm(true); return; }
        // Company → straight into onboarding; investor → the app.
        location.assign(type === "company" ? "/onboarding?new=1" : "/app");
      } else {
        await signIn(email.trim(), password);
        await redirectByRole();
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] max-w-md flex-col justify-center px-6 py-16">
      <a href="/" className="mb-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-400 hover:text-slate-600"><ArrowLeft size={15} /> Back to home</a>
      <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-1.5 text-[15px] text-slate-500">{isSignup ? "Start free — publish your Passport in minutes." : "Sign in to your Passport account."}</p>

      {confirm ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-500"><CheckCircle2 size={24} /></div>
          <p className="text-[16px] font-bold text-slate-900">Check your email</p>
          <p className="mt-1.5 text-[14px] text-slate-500">Confirm <b>{email}</b>, then sign in.</p>
          <a href="/login" className="mt-4 inline-block text-[14px] font-bold text-emerald-600">Go to sign in</a>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          {isSignup && (
            <div className="grid grid-cols-2 gap-3">
              <TypeCard active={type === "company"} onClick={() => setType("company")} Icon={Building2} title="Company" sub="Build & publish a profile" />
              <TypeCard active={type === "investor"} onClick={() => setType("investor")} Icon={LineChart} title="Investor" sub="Discover & follow" />
            </div>
          )}
          <Field icon={Mail}><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>
          <Field icon={Lock}><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete={isSignup ? "new-password" : "current-password"} className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>
          {!isSignup && <div className="-mt-1 text-right"><a href="/reset" className="text-[13px] font-semibold text-slate-400 hover:text-slate-600">Forgot password?</a></div>}
          {error && <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isSignup ? (type === "company" ? "Create account & start onboarding" : "Create investor account") : "Sign in"}
          </button>
        </form>
      )}

      {!confirm && (
        <p className="mt-6 text-center text-[14px] text-slate-500">
          {isSignup ? "Already have an account? " : "New to Passport? "}
          <a href={isSignup ? "/login" : "/signup"} className="font-bold text-emerald-600">{isSignup ? "Sign in" : "Create one"}</a>
        </p>
      )}
    </div>
  );
}

// /reset — one page for both halves of the flow:
//  • arriving from the email link (recovery token in the URL hash) → set a new password
//  • otherwise → request a reset link
export function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { const r = consumeHashSession(); if (r && r.type === "recovery") setRecovery(true); }, []);

  const sendLink = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await requestPasswordReset(email.trim()); setSent(true); }
    catch (err) { setError(err.message || "Couldn't send reset email"); }
    finally { setBusy(false); }
  };
  const setNew = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await updatePassword(password); setDone(true); }
    catch (err) { setError(err.message || "Couldn't update password"); }
    finally { setBusy(false); }
  };

  const wrap = (children) => (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-16">
      <a href="/" className="mb-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-400 hover:text-slate-600"><ArrowLeft size={15} /> Back to home</a>
      {children}
    </div>
  );

  if (done) return wrap(
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
      <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
      <p className="mt-2 text-[16px] font-bold text-slate-900">Password updated</p>
      <a href="/login" className="mt-3 inline-block text-[14px] font-bold text-emerald-600">Sign in</a>
    </div>
  );
  if (recovery) return wrap(<>
    <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">Set a new password</h1>
    <form onSubmit={setNew} className="mt-8 space-y-4">
      <Field icon={Lock}><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>
      {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}Update password</button>
    </form>
  </>);
  if (sent) return wrap(
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
      <p className="mt-2 text-[16px] font-bold text-slate-900">Check your email</p>
      <p className="mt-1.5 text-[14px] text-slate-500">If an account exists for <b>{email}</b>, a reset link is on its way.</p>
    </div>
  );
  return wrap(<>
    <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">Reset your password</h1>
    <p className="mt-1.5 text-[15px] text-slate-500">We'll email you a link to set a new one.</p>
    <form onSubmit={sendLink} className="mt-8 space-y-4">
      <Field icon={Mail}><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className="w-full bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none" /></Field>
      {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}Send reset link</button>
    </form>
    <p className="mt-6 text-center text-[14px] text-slate-500"><a href="/login" className="font-bold text-emerald-600">Back to sign in</a></p>
  </>);
}

function TypeCard({ active, onClick, Icon, title, sub }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border-2 p-4 text-left transition ${active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <Icon size={20} className={active ? "text-slate-900" : "text-slate-400"} />
      <p className="mt-2 text-[15px] font-bold text-slate-900">{title}</p>
      <p className="text-[12.5px] text-slate-400">{sub}</p>
    </button>
  );
}
function Field({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 focus-within:border-slate-400">
      <Icon size={18} className="flex-shrink-0 text-slate-400" />
      {children}
    </div>
  );
}
