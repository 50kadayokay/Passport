import { useState, useEffect } from "react";
import { getUser, onAuthChange, getSession } from "../lib/auth.js";

// Tracks the current authenticated user. `ready` flips true once the stored
// session has been validated/refreshed on mount.
export function useAuth() {
  const [user, setUser] = useState(getUser());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const off = onAuthChange(setUser);
    getSession().then((s) => { setUser(s?.user || null); setReady(true); });
    return off;
  }, []);
  return { user, ready, signedIn: !!user };
}
