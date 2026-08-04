import assert from "node:assert/strict";
import test from "node:test";

import {
  recipeMatchesRecommendationProfile,
  selectLocalRecipeWindow,
} from "../src/recommendationCatalog.ts";

function recipe(id, ingredient, overrides = {}) {
  return {
    id: `mealdb-${id}`,
    name: `Meal ${id}`,
    mealType: "Main meal",
    minutes: 0,
    description: "Catalog test meal",
    tags: [ingredient],
    allergens: ingredient === "milk" ? ["milk"] : [],
    vegetarian: true,
    dietary: { vegan: ingredient !== "milk", halalCompatible: true, kosherCompatible: true },
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    emoji: "🍽️",
    color: "#fff",
    foodGroups: [],
    ingredientIds: [ingredient],
    ingredients: [`1 cup ${ingredient}`],
    sourceIngredients: [{ id: ingredient, name: ingredient, measure: "1 cup" }],
    steps: ["Cook."],
    provider: "TheMealDB",
    ...overrides,
  };
}

const profile = {
  likes: ["rice"],
  dislikes: ["mushrooms"],
  restrictions: ["milk"],
  vegetarian: false,
  vegan: false,
  halalCompatible: false,
  kosherCompatible: false,
};

test("refresh replaces all 18 recipes with 18 unseen appropriate recipes", () => {
  const catalog = [
    ...Array.from({ length: 42 }, (_, index) => recipe(index + 1, "rice")),
    recipe(100, "milk"),
    recipe(101, "mushrooms"),
  ];
  const first = selectLocalRecipeWindow(catalog, profile, { cursor: 0 });
  const second = selectLocalRecipeWindow(catalog, profile, {
    cursor: 1,
    seenIds: first.items.map((item) => item.id),
  });

  assert.equal(first.items.length, 18);
  assert.equal(second.items.length, 18);
  assert.equal(second.items.some((item) => first.items.some((shown) => shown.id === item.id)), false);
  assert.ok([...first.items, ...second.items].every((item) => recipeMatchesRecommendationProfile(item, profile)));
  assert.equal([...first.items, ...second.items].some((item) => item.ingredientIds.includes("milk")), false);
  assert.equal([...first.items, ...second.items].some((item) => item.ingredientIds.includes("mushrooms")), false);
});

test("a depleted catalog returns fewer meals instead of relaxing restrictions", () => {
  const catalog = [
    ...Array.from({ length: 7 }, (_, index) => recipe(index + 1, "rice")),
    ...Array.from({ length: 20 }, (_, index) => recipe(index + 100, "milk")),
  ];
  const selection = selectLocalRecipeWindow(catalog, profile, { cursor: 0 });

  assert.equal(selection.items.length, 7);
  assert.ok(selection.items.every((item) => !item.ingredientIds.includes("milk")));
  assert.equal(selection.hasMore, false);
});
