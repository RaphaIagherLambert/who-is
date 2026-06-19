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
import { ensureCustomCollection, getCustomCollectionStatus } from "./services/customCollection.js";
import { countTeachings, isTeachingsEnabled } from "./services/teachingsStore.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  const custom = getCustomCollectionStatus();
  res.json({
    ok: true,
    provider: process.env.RECOGNITION_PROVIDER ?? "mock",
    minConfidence: Number(process.env.MIN_CONFIDENCE) || 97,
    teach: {
      enabled: isTeachingsEnabled(),
      count: isTeachingsEnabled() ? await countTeachings() : 0,
      collection: custom.collectionId,
      collectionReady: custom.ready,
    },
  });
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
  if (isTeachingsEnabled()) {
    ensureCustomCollection()
      .then((ready) => {
        if (ready) {
          console.log("Custom face collection ready for teach mode");
        }
      })
      .catch((err) => console.warn("Custom collection init failed:", err));
  }
});
