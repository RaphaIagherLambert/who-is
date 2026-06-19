import type { Request, Response, NextFunction } from "express";

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Admin teach mode is not configured" });
    return;
  }

  const provided =
    req.header("x-admin-secret") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (!provided || provided !== secret) {
    res.status(401).json({ error: "Invalid admin secret" });
    return;
  }

  next();
}
