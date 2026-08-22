import dotenv from "dotenv";

import path from "path";

import { fileURLToPath } from "url";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "../../.env") });



import cors from "cors";

import express from "express";

import fs from "fs";

import { getAllowedOrigins, validateAdminSecret } from "./config/security.js";

import {

  adminVerifyRateLimit,

  identifyRateLimit,

  wikipediaRateLimit,

} from "./middleware/rateLimit.js";

import { identifyRouter } from "./routes/identify.js";

import { teachRouter } from "./routes/teach.js";

import { wikipediaRouter } from "./routes/wikipedia.js";

import { getFaceCropStatus } from "./services/faceCrop.js";

import { loadPreAwsQualityConfig } from "./services/imageQuality.js";

import { ensureFaceCollection, getFaceCollectionStatus } from "./services/faceCollection.js";

import { countTeachings, isTeachingsEnabled } from "./services/teachingsStore.js";

import {

  countWikidataActors,

  countWikidataBrActors,

  countWikidataBrInfluencers,

  countWikidataBrMusicians,

  countWikidataEuActors,

  countWikidataEuInfluencers,

  countWikidataEuMusicians,

  countWikidataIndexed,

  countWikidataAsiaActors,

  countWikidataAsiaMusicians,

  countWikidataLatamActors,

  countWikidataLatamMusicians,

  countWikidataMusicians,

  countWikidataUsInfluencers,

  wikidataStoreFileExists,

} from "./services/wikidataStore.js";



validateAdminSecret();



const app = express();

const PORT = Number(process.env.PORT) || 3001;



app.set("trust proxy", 1);



const allowedOrigins = getAllowedOrigins();

app.use(

  cors({

    origin(origin, callback) {

      if (!origin) {

        callback(null, true);

        return;

      }

      if (allowedOrigins.includes(origin)) {

        callback(null, true);

        return;

      }

      callback(null, false);

    },

  })

);

app.use(express.json({ limit: "6mb" }));



app.get("/api/health", async (_req, res) => {

  try {

    const collection = getFaceCollectionStatus();

    res.json({

      ok: true,

      provider: process.env.RECOGNITION_PROVIDER ?? "mock",

      minConfidence: Number(process.env.MIN_CONFIDENCE) || 90,

      preAwsQuality: loadPreAwsQualityConfig(),

      faceCrop: getFaceCropStatus(),

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

        usInfluencersIndexed: await countWikidataUsInfluencers(),

        euActorsIndexed: await countWikidataEuActors(),

        euMusiciansIndexed: await countWikidataEuMusicians(),

        euInfluencersIndexed: await countWikidataEuInfluencers(),

        brActorsIndexed: await countWikidataBrActors(),

        brMusiciansIndexed: await countWikidataBrMusicians(),

        brInfluencersIndexed: await countWikidataBrInfluencers(),

        latamActorsIndexed: await countWikidataLatamActors(),

        latamMusiciansIndexed: await countWikidataLatamMusicians(),

        asiaActorsIndexed: await countWikidataAsiaActors(),

        asiaMusiciansIndexed: await countWikidataAsiaMusicians(),

        storeFileFound: await wikidataStoreFileExists(),

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



app.use("/api/identify", identifyRateLimit, identifyRouter);

app.use("/api/teach", teachRouter);

app.use("/api/wikipedia", wikipediaRateLimit, wikipediaRouter);



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

  console.log(`CORS origins: ${allowedOrigins.join(", ")}`);

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


