import { useCallback, useEffect, useState } from "react";
import {
  clearAdminSecret,
  getAdminSecret,
  setAdminSecret,
  verifyAdminSecret,
} from "./adminAuth.js";

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminSecret()));
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);

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
    unlockOpen,
    setUnlockOpen,
    onTitleTap,
    unlock,
    logout,
  };
}
