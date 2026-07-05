/** US musicians import — wrapper around import-wikidata.ts */
if (!process.argv.includes("--niche")) {
  process.argv.splice(2, 0, "--niche", "musicians");
}
await import("./import-wikidata.js");
