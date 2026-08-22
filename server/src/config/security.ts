const WEAK_ADMIN_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "admin",
  "password",
  "secret",
  "local-dev-secret",
]);

export function validateAdminSecret(): void {
  const secret = process.env.ADMIN_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const teachConfigured = Boolean(secret);

  if (!teachConfigured) {
    if (isProduction && process.env.CUSTOM_TEACH_ENABLED !== "false") {
      console.warn(
        "[security] ADMIN_SECRET is not set — admin teach mode is disabled."
      );
    }
    return;
  }

  const problems: string[] = [];

  if (secret.length < 24) {
    problems.push("ADMIN_SECRET must be at least 24 characters.");
  }
  if (WEAK_ADMIN_SECRETS.has(secret.toLowerCase())) {
    problems.push("ADMIN_SECRET is a known weak/default value.");
  }

  if (problems.length === 0) return;

  const message = `[security] ${problems.join(" ")}`;

  if (isProduction) {
    console.error(message);
    console.error(
      "[security] Refusing to start with a weak ADMIN_SECRET in production."
    );
    process.exit(1);
  }

  console.warn(`${message} (allowed in development only)`);
}

export function getAllowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) return configured;

  if (process.env.NODE_ENV === "production") {
    return ["https://who-is.onrender.com"];
  }

  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ];
}
