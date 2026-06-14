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
import { wikipediaRouter } from "./routes/wikipedia.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.RECOGNITION_PROVIDER ?? "mock",
    minConfidence: Number(process.env.MIN_CONFIDENCE) || 85,
  });
});

app.use("/api/recognize", recognizeRouter);
app.use("/api/identify", identifyRouter);
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
});
