import React, { useState, useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "./useAuth.js";
import { getMyRole, signOut } from "../lib/auth.js";
import LoginScreen from "./LoginScreen.jsx";

const Loader = () => (
  <div className="grid min-h-[100dvh] place-items-center bg-slate-50 text-slate-400">
    <Loader2 size={26} className="animate-spin text-emerald-500" />
  </div>
);

// Renders the login screen until authenticated; optionally requires role=admin.
export default function AuthGate({ children, title, subtitle, requireAdmin = false }) {
  const { signedIn, ready } = useAuth();
  const [role, setRole] = useState(undefined); // undefined = checking

  useEffect(() => {
    if (signedIn && requireAdmin) { setRole(undefined); getMyRole().then((r) => setRole(r || "company")); }
  }, [signedIn, requireAdmin]);

  if (!ready) return <Loader />;
  if (!signedIn) return <LoginScreen title={title} subtitle={subtitle} />;

  if (requireAdmin) {
    if (role === undefined) return <Loader />;
    if (role !== "admin") {
      return (
        <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500"><ShieldAlert size={28} /></div>
            <h1 className="text-[22px] font-extrabold text-slate-900">Admins only</h1>
            <p className="mt-2 text-[14px] text-slate-500">This account doesn't have admin access.</p>
            <button onClick={() => signOut()} className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white">Sign out</button>
          </div>
        </div>
      );
    }
  }
  return children;
}
