const ADMIN_KEY = "whois-admin-secret";

function readStoredSecret(): string | null {
  return localStorage.getItem(ADMIN_KEY) ?? sessionStorage.getItem(ADMIN_KEY);
}

export function getAdminSecret(): string | null {
  return readStoredSecret();
}

export function setAdminSecret(secret: string): void {
  localStorage.setItem(ADMIN_KEY, secret);
  sessionStorage.removeItem(ADMIN_KEY);
}

export function clearAdminSecret(): void {
  localStorage.removeItem(ADMIN_KEY);
  sessionStorage.removeItem(ADMIN_KEY);
}

export async function verifyAdminSecret(secret: string): Promise<boolean> {
  const res = await fetch("/api/teach/verify", {
    method: "POST",
    headers: { "X-Admin-Secret": secret },
  });
  return res.ok;
}
