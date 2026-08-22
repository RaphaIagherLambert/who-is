import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Best-effort client IP (Render sits behind a proxy). */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function createRateLimiter(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientIp(req);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      });
      return;
    }

    next();
  };
}

/** Expensive AWS-backed identify / face detection. */
export const identifyRateLimit = createRateLimiter(
  Number(process.env.RATE_LIMIT_IDENTIFY_MAX) || 40,
  Number(process.env.RATE_LIMIT_IDENTIFY_WINDOW_MS) || 15 * 60 * 1000
);

/** Admin password verification — slow brute force. */
export const adminVerifyRateLimit = createRateLimiter(
  Number(process.env.RATE_LIMIT_ADMIN_MAX) || 10,
  Number(process.env.RATE_LIMIT_ADMIN_WINDOW_MS) || 15 * 60 * 1000
);

/** Wikipedia proxy lookups. */
export const wikipediaRateLimit = createRateLimiter(
  Number(process.env.RATE_LIMIT_WIKI_MAX) || 80,
  Number(process.env.RATE_LIMIT_WIKI_WINDOW_MS) || 15 * 60 * 1000
);
