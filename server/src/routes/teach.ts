import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { indexTeachingFace } from "../services/customCollection.js";
import {
  countTeachings,
  isTeachingsEnabled,
  saveTeaching,
} from "../services/teachingsStore.js";
import { findWikipediaPage } from "../services/wikipedia.js";
import { parseImagePayload } from "../utils/imagePayload.js";

export const teachRouter = Router();

teachRouter.get("/status", async (_req, res) => {
  res.json({
    enabled: isTeachingsEnabled(),
    count: isTeachingsEnabled() ? await countTeachings() : 0,
  });
});

teachRouter.post("/verify", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

teachRouter.get("/count", requireAdmin, async (_req, res) => {
  res.json({ count: await countTeachings() });
});

teachRouter.post("/", requireAdmin, async (req, res) => {
  try {
    if (!isTeachingsEnabled()) {
      res.status(503).json({ error: "Teach mode is disabled" });
      return;
    }

    const parsed = parseImagePayload(req.body?.image);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const lang = typeof req.body?.lang === "string" ? req.body.lang : "en";
    const wikiUrl =
      typeof req.body?.wikipediaUrl === "string"
        ? req.body.wikipediaUrl.trim()
        : "";

    let wikipedia = wikiUrl
      ? {
          title: name,
          url: wikiUrl,
          lang: lang.split("-")[0].toLowerCase(),
        }
      : await findWikipediaPage(name, lang);

    if (!wikipedia) {
      res.status(404).json({
        error: "Wikipedia page not found. Provide a name that exists on Wikipedia.",
      });
      return;
    }

    const id = randomUUID();
    const faceId = await indexTeachingFace(parsed.base64, id);
    if (!faceId) {
      res.status(422).json({
        error: "No clear face found in the image. Try again with the face centered and well lit.",
      });
      return;
    }

    const record = {
      id,
      name: wikipedia.title,
      wikipedia,
      createdAt: new Date().toISOString(),
    };

    await saveTeaching(record);

    res.json({
      ok: true,
      teaching: record,
      faceId,
    });
  } catch (err) {
    console.error("Teach error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to save teaching",
    });
  }
});
