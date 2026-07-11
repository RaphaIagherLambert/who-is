/** Asian actors import — wrapper around import-wikidata.ts */
if (!process.argv.includes("--niche")) {
  process.argv.splice(2, 0, "--niche", "asia-actors");
}
await import("./import-wikidata.js");
