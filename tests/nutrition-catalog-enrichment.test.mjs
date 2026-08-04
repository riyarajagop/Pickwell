import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  canonicalUsdaQuery,
  resolveIngredientGrams,
} from "../src/nutritionEstimator.ts";

const sourceText = fs.readFileSync(new URL("../src/data/mealdb-catalog.json", import.meta.url), "utf8");
const source = JSON.parse(sourceText);
const enriched = JSON.parse(fs.readFileSync(new URL("../src/data/mealdb-catalog-with-nutrition.json", import.meta.url), "utf8"));
const cache = JSON.parse(fs.readFileSync(new URL("../src/data/usda-nutrition-cache.json", import.meta.url), "utf8"));

test("preserves every source recipe and adds finite macro totals", () => {
  const expectedHash = createHash("sha256").update(sourceText).digest("hex");
  assert.equal(enriched.nutritionSourceCatalogSha256, expectedHash);
  assert.equal(Object.keys(enriched.recipesById).length, Object.keys(source.recipesById).length);

  for (const [id, sourceRecipe] of Object.entries(source.recipesById)) {
    const enrichedRecipe = enriched.recipesById[id];
    const sourceCopy = { ...enrichedRecipe };
    delete sourceCopy.nutrition;
    assert.deepEqual(sourceCopy, sourceRecipe);
    assert.equal(enrichedRecipe.nutrition.coverage.unresolvedIngredients, 0);
    for (const nutrition of [enrichedRecipe.nutrition.wholeRecipe, enrichedRecipe.nutrition.perServing]) {
      for (const macro of ["calories", "protein", "carbs", "fat"]) {
        assert.equal(Number.isFinite(nutrition[macro]), true, `${id} ${macro} must be finite`);
        assert.equal(nutrition[macro] >= 0, true, `${id} ${macro} must not be negative`);
      }
    }
  }
});

test("uses LLM nutrition only after a canonical USDA miss", () => {
  for (const recipe of Object.values(enriched.recipesById)) {
    for (const ingredient of recipe.nutrition.ingredients) {
      if (ingredient.nutritionSource?.kind === "usda") {
        assert.ok(cache.matches[ingredient.canonicalQuery], ingredient.canonicalQuery);
      }
      if (ingredient.nutritionSource?.kind === "llm-estimate") {
        assert.equal(cache.matches[ingredient.canonicalQuery], null, ingredient.canonicalQuery);
      }
    }
  }
});

test("normalizes pasta families and common MealDB unit aliases deterministically", () => {
  for (const name of ["rigatoni", "penne rigate", "linguine pasta", "fettuccine", "farfalle"]) {
    assert.equal(canonicalUsdaQuery(name), "pasta dry unenriched");
  }
  assert.equal(canonicalUsdaQuery("rice noodles"), "rice noodles dry");
  assert.equal(canonicalUsdaQuery("egg noodles"), "noodles egg dry");
  assert.equal(resolveIngredientGrams("Olive Oil", "2 tblsp").grams, 27);
  assert.equal(resolveIngredientGrams("Olive Oil", "2 tablespoons").grams, 27);
  assert.equal(resolveIngredientGrams("Coconut Milk", "400ml can").grams, 400);
});

test("uses integer serving counts targeting 500 to 1,000 calories per serving", () => {
  assert.equal(enriched.nutritionRulesVersion, 2);
  for (const recipe of Object.values(enriched.recipesById)) {
    const { wholeRecipe, perServing, servings } = recipe.nutrition;
    assert.equal(Number.isInteger(servings.count), true, `${recipe.id} serving count must be an integer`);
    assert.equal(servings.count >= 1 && servings.count <= 32, true, `${recipe.id} serving count must be between 1 and 32`);
    assert.equal(perServing.calories, Math.round((wholeRecipe.calories / servings.count) * 100) / 100);
    assert.match(servings.basis, /500–1,000 kcal target range/);

    if (wholeRecipe.calories < 1000) {
      assert.equal(servings.count, 1, `${recipe.id} has fewer than 1,000 calories and should be one serving`);
    }
    if (wholeRecipe.calories >= 500 && wholeRecipe.calories <= 32000) {
      assert.equal(
        perServing.calories >= 500 && perServing.calories <= 1000,
        true,
        `${recipe.id} should fall inside the target range`,
      );
    }
  }
});
