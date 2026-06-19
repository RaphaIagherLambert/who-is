const ADMIN_KEY = "whois-admin-secret";

export function getAdminSecret(): string | null {
  return sessionStorage.getItem(ADMIN_KEY);
}

export function setAdminSecret(secret: string): void {
  sessionStorage.setItem(ADMIN_KEY, secret);
}

export function clearAdminSecret(): void {
  sessionStorage.removeItem(ADMIN_KEY);
}

export async function verifyAdminSecret(secret: string): Promise<boolean> {
  const res = await fetch("/api/teach/verify", {
    method: "POST",
    headers: { "X-Admin-Secret": secret },
  });
  return res.ok;
}
