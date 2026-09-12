import { Router } from "express";
import { enrichActorFromTmdb, isTmdbConfigured } from "../services/tmdb.js";

export const tmdbRouter = Router();

/**
 * GET /api/tmdb/person?name=...&lang=pt|en
 * Returns filmography + regional watch providers for actors, or { enrichment: null }.
 */
tmdbRouter.get("/person", async (req, res) => {
  try {
    if (!isTmdbConfigured()) {
      res.json({ enrichment: null, configured: false });
      return;
    }

    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name || name.length > 120) {
      res.status(400).json({ error: "Missing or invalid name" });
      return;
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
    const enrichment = await enrichActorFromTmdb(name, lang);
    res.json({ enrichment, configured: true });
  } catch (err) {
    console.error("TMDB enrich error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "TMDB lookup failed",
    });
  }
});
