import { Router } from "express";
import {
  findWikipediaPage,
  searchWikipediaSuggestions,
} from "../services/wikipedia.js";

export const wikipediaRouter = Router();

wikipediaRouter.get("/search/suggestions", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const lang = (req.query.lang as string) || "en";

    const suggestions = await searchWikipediaSuggestions(query, lang);
    res.json({ suggestions });
  } catch (err) {
    console.error("Wikipedia suggestions error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Wikipedia search failed",
    });
  }
});

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
