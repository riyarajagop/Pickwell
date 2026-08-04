import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { recipeNutritionFromCatalog } from "../src/catalogNutrition.ts";

const enriched = JSON.parse(
  fs.readFileSync(new URL("../src/data/mealdb-catalog-with-nutrition.json", import.meta.url), "utf8"),
);
const appSource = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const adapterSource = fs.readFileSync(new URL("../src/mealDbRecipes.ts", import.meta.url), "utf8");

test("maps every catalog recipe to ready stored runtime nutrition", () => {
  for (const recipe of Object.values(enriched.recipesById)) {
    const mapped = recipeNutritionFromCatalog(recipe.nutrition);
    assert.equal(mapped.nutritionEstimate.status, "ready", recipe.id);
    assert.equal(mapped.nutritionEstimate.source, "Precomputed catalog", recipe.id);
    assert.equal(mapped.nutritionEstimate.assumedServings, recipe.nutrition.servings.count, recipe.id);
    assert.deepEqual(mapped.nutrition, {
      calories: Math.round(recipe.nutrition.perServing.calories),
      protein: Math.round(recipe.nutrition.perServing.protein),
      carbs: Math.round(recipe.nutrition.perServing.carbs),
      fat: Math.round(recipe.nutrition.perServing.fat),
    });
    assert.deepEqual(mapped.nutritionEstimate.wholeRecipeNutrition, {
      calories: Math.round(recipe.nutrition.wholeRecipe.calories),
      protein: Math.round(recipe.nutrition.wholeRecipe.protein),
      carbs: Math.round(recipe.nutrition.wholeRecipe.carbs),
      fat: Math.round(recipe.nutrition.wholeRecipe.fat),
    });
  }
});

test("the MealDB recommendation path uses the enriched file and does not trigger live estimation", () => {
  assert.match(adapterSource, /mealdb-catalog-with-nutrition\.json/);
  assert.doesNotMatch(appSource, /estimateMealNutrition/);
});
