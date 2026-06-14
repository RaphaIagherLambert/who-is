import { Router } from "express";
import { findWikipediaPage } from "../services/wikipedia.js";

export const wikipediaRouter = Router();

wikipediaRouter.get("/:name", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const lang = (req.query.lang as string) || "en";

    const page = await findWikipediaPage(name, lang);
    if (!page) {
      res.status(404).json({ error: "Wikipedia page not found" });
      return;
    }

    res.json(page);
  } catch (err) {
    console.error("Wikipedia lookup error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Wikipedia lookup failed",
    });
  }
});
