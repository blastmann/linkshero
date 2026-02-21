import { readFile, writeFile } from "node:fs/promises";

const nextVersion = process.argv[2];

if (!nextVersion) {
  throw new Error("Missing version argument. Usage: node scripts/sync-manifest-version.mjs <version>");
}

const manifestPath = new URL("../public/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.version = nextVersion;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
