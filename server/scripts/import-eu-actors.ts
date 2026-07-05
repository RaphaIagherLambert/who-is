/** European actors import — wrapper around import-wikidata.ts */
if (!process.argv.includes("--niche")) {
  process.argv.splice(2, 0, "--niche", "eu-actors");
}
await import("./import-wikidata.js");
