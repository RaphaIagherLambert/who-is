/** Latin America + Mexico musicians import — wrapper around import-wikidata.ts */
if (!process.argv.includes("--niche")) {
  process.argv.splice(2, 0, "--niche", "latam-musicians");
}
await import("./import-wikidata.js");
