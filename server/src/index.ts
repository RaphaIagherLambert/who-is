import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

import cors from "cors";
import express from "express";
import fs from "fs";
import { identifyRouter } from "./routes/identify.js";
import { recognizeRouter } from "./routes/recognize.js";
import { teachRouter } from "./routes/teach.js";
import { wikipediaRouter } from "./routes/wikipedia.js";
import { ensureFaceCollection, getFaceCollectionStatus } from "./services/faceCollection.js";
import { countTeachings, isTeachingsEnabled } from "./services/teachingsStore.js";
import {
  countWikidataActors,
  countWikidataEuActors,
  countWikidataEuMusicians,
  countWikidataIndexed,
  countWikidataMusicians,
} from "./services/wikidataStore.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    const collection = getFaceCollectionStatus();
    res.json({
      ok: true,
      provider: process.env.RECOGNITION_PROVIDER ?? "mock",
      minConfidence: Number(process.env.MIN_CONFIDENCE) || 97,
      collection: {
        enabled: collection.enabled,
        ready: collection.ready,
        id: collection.collectionId,
        minSimilarity: collection.minSimilarity,
      },
      wikidata: {
        totalIndexed: await countWikidataIndexed(),
        usActorsIndexed: await countWikidataActors(),
        usMusiciansIndexed: await countWikidataMusicians(),
        euActorsIndexed: await countWikidataEuActors(),
        euMusiciansIndexed: await countWikidataEuMusicians(),
      },
      teach: {
        enabled: isTeachingsEnabled(),
        count: isTeachingsEnabled() ? await countTeachings() : 0,
      },
    });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Health check failed",
    });
  }
});

app.use("/api/recognize", recognizeRouter);
app.use("/api/identify", identifyRouter);
app.use("/api/teach", teachRouter);
app.use("/api/wikipedia", wikipediaRouter);

const clientDist = path.join(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Recognition provider: ${process.env.RECOGNITION_PROVIDER ?? "mock"}`);
  if (getFaceCollectionStatus().enabled) {
    ensureFaceCollection()
      .then((ready) => {
        if (ready) {
          console.log("Face collection ready");
        }
      })
      .catch((err) => console.warn("Face collection init failed:", err));
  }
});
