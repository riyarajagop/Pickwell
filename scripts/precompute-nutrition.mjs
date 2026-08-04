import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  canonicalUsdaQuery,
  rankUsdaCandidates,
} from "../src/nutritionEstimator.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.resolve(process.env.PICKWELL_CATALOG_PATH || path.join(root, "src/data/mealdb-catalog.json"));
const outputPath = path.resolve(process.env.PICKWELL_USDA_CACHE_PATH || path.join(root, "src/data/usda-nutrition-cache.json"));
const workerBase = (process.env.PICKWELL_API_URL || process.env.EXPO_PUBLIC_PICKWELL_API_URL || "").replace(/\/+$/, "");

if (!workerBase) {
  throw new Error("Set PICKWELL_API_URL to the deployed or local Pickwell Worker URL.");
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
const matches = existing.version === 5 && existing.matches && typeof existing.matches === "object"
  ? existing.matches
  : {};
const queries = [...new Set(
  Object.values(catalog.recipesById)
    .flatMap((recipe) => recipe.ingredients ?? [])
    .map((ingredient) => canonicalUsdaQuery(ingredient.name))
    .map(normalize),
)].sort();
const activeQueries = new Set(queries);
for (const key of Object.keys(matches)) {
  if (!activeQueries.has(key)) delete matches[key];
}

let completed = 0;
const failed = [];
let cursor = 0;
let persistChain = Promise.resolve();
const concurrency = 4;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < queries.length) {
    const query = queries[cursor];
    cursor += 1;
    if (!(query in matches)) {
      try {
        const search = await workerPost("/v1/usda/search", { query });
        let candidates = search.foods ?? [];
        let normalized = null;
        for (let attempt = 0; attempt < 10 && candidates.length; attempt += 1) {
          const selected = rankUsdaCandidates(candidates, query);
          if (!selected) break;
          const detail = await workerPost("/v1/usda/food", { fdcId: selected.fdcId });
          normalized = detail.food ? rankUsdaCandidates([detail.food], query) : null;
          if (normalized) break;
          candidates = candidates.filter((candidate) => candidate.fdcId !== selected.fdcId);
        }
        matches[query] = normalized;
      } catch (error) {
        failed.push({ query, error: error instanceof Error ? error.message : String(error) });
        process.stderr.write(`Could not resolve “${query}”: ${failed.at(-1).error}\n`);
      }
    }
    completed += 1;
    if (completed % 10 === 0 || completed === queries.length) {
      process.stdout.write(`Resolved ${completed}/${queries.length} canonical USDA queries.\n`);
      persistChain = persistChain.then(persist);
    }
  }
}));
await persistChain;
if (failed.length) {
  process.stderr.write(`${failed.length} queries failed transiently and were left uncached for a later retry.\n`);
  process.exitCode = 1;
}

async function persist() {
  const temporaryPath = `${outputPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify({
    version: 5,
    generatedAt: new Date().toISOString(),
    matches,
  }, null, 2)}\n`);
  await fs.rename(temporaryPath, outputPath);
}

async function workerPost(route, body) {
  const response = await fetch(`${workerBase}${route}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).error ?? ""; } catch { /* use status */ }
    throw new Error(detail || `${route} failed with HTTP ${response.status}.`);
  }
  return response.json();
}

function normalize(value) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
