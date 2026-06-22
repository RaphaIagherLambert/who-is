import { useCallback, useEffect, useState } from "react";
import {
  clearAdminSecret,
  getAdminSecret,
  setAdminSecret,
  verifyAdminSecret,
} from "./adminAuth.js";

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getAdminSecret();
    if (!stored) {
      setReady(true);
      return;
    }

    verifyAdminSecret(stored).then((ok) => {
      if (ok) {
        setAdminSecret(stored);
        setIsAdmin(true);
      } else {
        clearAdminSecret();
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (tapCount === 0) return;
    const timer = window.setTimeout(() => setTapCount(0), 2500);
    return () => window.clearTimeout(timer);
  }, [tapCount]);

  const onTitleTap = useCallback(() => {
    setTapCount((count) => {
      const next = count + 1;
      if (next >= 5) {
        setUnlockOpen(true);
        return 0;
      }
      return next;
    });
  }, []);

  const unlock = useCallback(async (secret: string) => {
    const ok = await verifyAdminSecret(secret.trim());
    if (!ok) return false;
    setAdminSecret(secret.trim());
    setIsAdmin(true);
    setUnlockOpen(false);
    return true;
  }, []);

  const logout = useCallback(() => {
    clearAdminSecret();
    setIsAdmin(false);
  }, []);

  return {
    isAdmin,
    ready,
    unlockOpen,
    setUnlockOpen,
    onTitleTap,
    unlock,
    logout,
  };
}
