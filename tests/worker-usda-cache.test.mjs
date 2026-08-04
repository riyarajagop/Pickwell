import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/src/index.ts";

test("deduplicates and durably caches USDA searches and normalizes food details", async () => {
  const originalFetch = globalThis.fetch;
  const database = new MemoryD1();
  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    providerCalls += 1;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/foods/search")) {
      return Response.json({
        foods: [{
          fdcId: 123,
          description: "Tomatoes, red, ripe, raw",
          dataType: "Foundation",
          foodNutrients: [
            { nutrientId: 1008, unitName: "kcal", value: 18 },
            { nutrientId: 1003, unitName: "g", value: 0.9 },
            { nutrientId: 1005, unitName: "g", value: 3.9 },
            { nutrientId: 1004, unitName: "g", value: 0.2 },
          ],
        }],
      });
    }
    if (url.pathname.endsWith("/food/123")) {
      return Response.json({
        fdcId: 123,
        description: "Tomatoes, red, ripe, raw",
        dataType: "Foundation",
        publicationDate: "2026-04-01",
        foodNutrients: [
          { amount: 18, nutrient: { id: 1008, unitName: "kcal" } },
          { amount: 0.9, nutrient: { id: 1003, unitName: "g" } },
          { amount: 3.9, nutrient: { id: 1005, unitName: "g" } },
          { amount: 0.2, nutrient: { id: 1004, unitName: "g" } },
        ],
        foodPortions: [{
          amount: 1,
          gramWeight: 123,
          portionDescription: "1 medium",
          modifier: "medium",
          measureUnit: { name: "each", abbreviation: "ea" },
        }],
      });
    }
    return new Response(null, { status: 404 });
  };

  try {
    const env = { DB: database, USDA_FDC_API_KEY: "private-test-key", CORS_ORIGIN: "*" };
    const request = () => new Request("https://pickwell.test/v1/usda/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "tomatoes raw" }),
    });
    const [first, concurrent] = await Promise.all([
      worker.fetch(request(), env, { waitUntil() {} }),
      worker.fetch(request(), env, { waitUntil() {} }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(concurrent.status, 200);
    assert.equal(providerCalls, 1);

    const warm = await worker.fetch(request(), env, { waitUntil() {} });
    assert.equal(warm.status, 200);
    assert.equal(providerCalls, 1);

    const detail = await worker.fetch(new Request("https://pickwell.test/v1/usda/food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fdcId: 123 }),
    }), env, { waitUntil() {} });
    const payload = await detail.json();
    assert.equal(providerCalls, 2);
    assert.equal(payload.food.publicationDate, "2026-04-01");
    assert.equal(payload.food.foodNutrients[0].nutrientId, 1008);
    assert.deepEqual(payload.food.foodPortions[0], {
      amount: 1,
      gramWeight: 123,
      portionDescription: "1 medium",
      modifier: "medium",
      unitName: "each",
      unitAbbreviation: "ea",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

class MemoryD1 {
  cache = new Map();

  prepare(query) {
    return new MemoryStatement(this, query);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

class MemoryStatement {
  values = [];

  constructor(database, query) {
    this.database = database;
    this.query = query;
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.query.includes("FROM api_cache")) {
      const row = this.database.cache.get(this.values[0]);
      return row && row.stale_until > this.values[1] ? row : null;
    }
    return null;
  }

  async all() {
    return { results: [], success: true };
  }

  async run() {
    if (this.query.includes("INSERT INTO api_cache")) {
      const [key, namespace, payload, fetched_at, fresh_until, stale_until] = this.values;
      this.database.cache.set(key, { key, namespace, payload, fetched_at, fresh_until, stale_until });
    }
    return { results: [], success: true };
  }
}
