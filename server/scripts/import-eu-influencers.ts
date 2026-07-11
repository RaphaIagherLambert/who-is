/** European digital influencers — wrapper around import-wikidata.ts */
if (!process.argv.includes("--niche")) {
  process.argv.splice(2, 0, "--niche", "eu-influencers");
}
await import("./import-wikidata.js");
