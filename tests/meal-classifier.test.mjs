import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMealDbCourse,
  isMealDbMealRecommendation,
} from "../src/mealClassifier.ts";

test("rejects TheMealDB desserts regardless of category casing or whitespace", () => {
  assert.equal(classifyMealDbCourse({ strCategory: " Dessert " }).kind, "dessert");
  assert.equal(isMealDbMealRecommendation({ strCategory: "dEsSeRt" }), false);
});

test("rejects sides and starters because they are not complete meal recommendations", () => {
  assert.equal(classifyMealDbCourse({ strCategory: "Side" }).kind, "non-meal");
  assert.equal(classifyMealDbCourse({ strCategory: "Starter" }).kind, "non-meal");
});

test("accepts reviewed TheMealDB meal categories", () => {
  for (const strCategory of ["Breakfast", "Chicken", "Pasta", "Seafood", "Vegan", "Vegetarian"]) {
    assert.equal(isMealDbMealRecommendation({ strCategory }), true, strCategory);
  }
});

test("fails closed when a category is missing or has not been reviewed", () => {
  assert.equal(classifyMealDbCourse({ strCategory: null }).kind, "unknown");
  assert.equal(isMealDbMealRecommendation({ strCategory: "New Category" }), false);
});
