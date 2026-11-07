import { Router } from "express";
import {
  enrichActorFromTmdb,
  fetchMovieCast,
  fetchTvCast,
  isTmdbConfigured,
  searchTmdbTitles,
} from "../services/tmdb.js";

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

/**
 * GET /api/tmdb/search?q=...&lang=pt|en
 * Title search for cast fallback (movie + TV).
 */
tmdbRouter.get("/search", async (req, res) => {
  try {
    if (!isTmdbConfigured()) {
      res.json({ results: [], configured: false });
      return;
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q || q.length > 160) {
      res.status(400).json({ error: "Missing or invalid query" });
      return;
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
    const results = await searchTmdbTitles(q, lang);
    res.json({ results, configured: true });
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "TMDB search failed",
    });
  }
});

/**
 * GET /api/tmdb/cast?mediaType=movie|tv&id=...&season=1&lang=pt|en
 */
tmdbRouter.get("/cast", async (req, res) => {
  try {
    if (!isTmdbConfigured()) {
      res.json({ cast: [], configured: false });
      return;
    }

    const mediaType =
      req.query.mediaType === "tv" || req.query.mediaType === "movie"
        ? req.query.mediaType
        : null;
    const id = Number(req.query.id);
    if (!mediaType || !Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "mediaType and id are required" });
      return;
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
    const season = Number(req.query.season);

    const cast =
      mediaType === "movie"
        ? await fetchMovieCast(id, lang)
        : await fetchTvCast(id, Number.isFinite(season) ? season : 1, lang);

    res.json({ cast, configured: true });
  } catch (err) {
    console.error("TMDB cast error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "TMDB cast lookup failed",
    });
  }
});
