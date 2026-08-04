import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalUsdaQuery,
  estimateServingCount,
  parseRecipeYield,
  rankUsdaCandidates,
  resolveIngredientGrams,
} from "../src/nutritionEstimator.ts";
import { selectOpenFoodFactsEstimate } from "../src/nutritionFallbacks.ts";

const macros = (calories, protein, carbs, fat) => [
  { nutrientId: 1008, unitName: "kcal", value: calories },
  { nutrientId: 1003, unitName: "g", value: protein },
  { nutrientId: 1005, unitName: "g", value: carbs },
  { nutrientId: 1004, unitName: "g", value: fat },
];

test("converts Banana Fritters quantities with ingredient-aware weights", () => {
  assert.equal(resolveIngredientGrams("Banana", "3 Medium").grams, 354);
  assert.equal(resolveIngredientGrams("All purpose flour", "1 cup").grams, 125);
  assert.equal(resolveIngredientGrams("Brown Sugar", "3 tablespoons").grams, 41.25);
  const oil = resolveIngredientGrams("Oil", "For frying");
  assert.equal(oil.status, "included");
  assert.equal(oil.grams, 30);
  assert.match(oil.warning, /absorbed/);
});

test("maps Banana Fritters ingredients to state-specific USDA searches", () => {
  assert.equal(canonicalUsdaQuery("Banana"), "bananas raw");
  assert.equal(canonicalUsdaQuery("All purpose flour"), "wheat flour white all purpose enriched");
  assert.equal(canonicalUsdaQuery("Oil"), "oil vegetable nfs");
});

test("normalizes common MealDB measure variants", () => {
  assert.equal(resolveIngredientGrams("Olive Oil", "2 tbs").grams, 27);
  assert.equal(resolveIngredientGrams("Red Wine Vinegar", "2 tblsp").grams, 30);
  assert.equal(Math.round(resolveIngredientGrams("Milk", "200ml").grams), 206);
  assert.equal(resolveIngredientGrams("Carrots", "2").grams, 122);
  assert.equal(resolveIngredientGrams("Lemon", "Juice of 1").grams, 48);
  assert.equal(resolveIngredientGrams("Parsley", "Handful").grams, 15);
});

test("converts Spinach and Ricotta Cannelloni package masses correctly", () => {
  assert.equal(resolveIngredientGrams("Chopped Tomatoes", "3 400g Cans").grams, 1200);
  assert.equal(resolveIngredientGrams("Parmesan", "100g").grams, 100);
  assert.equal(resolveIngredientGrams("Spinach", "1kg").grams, 1000);
});

test("uses a matching USDA food portion after local conversions miss", () => {
  const estimate = resolveIngredientGrams("Canned tomatoes", "2 cans", [{
    amount: 1,
    gramWeight: 411,
    portionDescription: "1 can",
    unitName: "can",
  }]);
  assert.equal(estimate.status, "included");
  assert.equal(estimate.grams, 822);
  assert.match(estimate.method, /USDA portion/);
});

test("ranks all-purpose flour ahead of an unrelated high-protein fish result", () => {
  const selected = rankUsdaCandidates([
    {
      fdcId: 1,
      description: "Fish, salmon, Atlantic, farm raised, raw",
      dataType: "Foundation",
      foodNutrients: macros(197, 20.3, 0, 13.1),
    },
    {
      fdcId: 2,
      description: "Wheat flour, white, all-purpose, enriched",
      dataType: "SR Legacy",
      foodNutrients: macros(364, 10.3, 76.3, 0.98),
    },
  ], "wheat flour white all purpose enriched");
  assert.equal(selected?.fdcId, 2);
  assert.equal(selected?.nutrientsPer100g.protein, 10.3);
});

test("estimates four servings for a Banana Fritters-sized dessert batch", () => {
  const estimate = estimateServingCount(
    { name: "Jamaican Banana Fritters", mealType: "Snack", description: "A Jamaican dessert recipe." },
    1200,
    552,
  );
  assert.equal(estimate.count, 4);
});

test("estimates non-dessert servings from measured recipe weight", () => {
  const estimate = estimateServingCount(
    { name: "Shared chicken meal", mealType: "Main meal", description: "A family-style dinner." },
    1200,
    1600,
  );
  assert.equal(estimate.count, 4);
  assert.match(estimate.basis, /1600 g/);
});

test("uses a stated recipe yield before estimating servings", () => {
  assert.equal(parseRecipeYield(["Simmer until tender.", "Serves 6"]), 6);
  const estimate = estimateServingCount(
    { name: "Family stew", mealType: "Main meal", description: "", steps: ["Cook gently.", "Serves 6"] },
    2400,
    3200,
  );
  assert.equal(estimate.count, 6);
  assert.match(estimate.basis, /stated yield/);
});

test("uses a strict Open Food Facts match and scales its per-100g macros", () => {
  const estimate = selectOpenFoodFactsEstimate([
    {
      product_name: "Tomato soup with cream",
      nutriments: { "energy-kcal_100g": 80, proteins_100g: 2, carbohydrates_100g: 10, fat_100g: 4 },
    },
    {
      generic_name: "Tomato puree",
      nutriments: { "energy-kcal_100g": 40, proteins_100g: 2, carbohydrates_100g: 8, fat_100g: 0.5 },
    },
  ], "tomato puree", 250);
  assert.equal(estimate?.provider, "Open Food Facts");
  assert.equal(estimate?.description, "Tomato puree");
  assert.deepEqual(estimate?.nutrition, { calories: 100, protein: 5, carbs: 20, fat: 1.25 });
});

test("rejects an unrelated Open Food Facts product", () => {
  const estimate = selectOpenFoodFactsEstimate([
    {
      product_name: "Chicken noodle soup",
      nutriments: { "energy-kcal_100g": 80, proteins_100g: 4, carbohydrates_100g: 9, fat_100g: 3 },
    },
  ], "tomato puree", 250);
  assert.equal(estimate, null);
});
