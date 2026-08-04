import assert from "node:assert/strict";
import test from "node:test";

import {
  deterministicOrder,
  selectRecommendationWindow,
  stableProfileKey,
} from "../worker/src/recommendation.ts";

function meal(id, category, area, ingredient) {
  return {
    idMeal: String(id),
    strMeal: `Meal ${id}`,
    strCategory: category,
    strArea: area,
    strIngredient1: ingredient,
    strMeasure1: "1 cup",
  };
}

test("profile cache keys ignore preference ordering and duplicate values", () => {
  assert.equal(
    stableProfileKey([" Chicken ", "rice", "chicken"]),
    stableProfileKey(["rice", "chicken"]),
  );
});

test("deterministic ordering is stable for retries and changes with the cursor seed", () => {
  const ids = Array.from({ length: 30 }, (_, index) => String(index + 1));
  assert.deepEqual(deterministicOrder(ids, "profile:0"), deterministicOrder(ids, "profile:0"));
  assert.notDeepEqual(deterministicOrder(ids, "profile:0"), deterministicOrder(ids, "profile:1"));
});

test("returns at most 18 meals, excludes recent/down-rated meals, and reserves exploration", () => {
  const matched = Array.from({ length: 30 }, (_, index) =>
    meal(index + 1, index % 2 ? "Chicken" : "Pasta", index % 3 ? "Italian" : "Canadian", "Chicken")
  );
  const exploration = Array.from({ length: 8 }, (_, index) =>
    meal(101 + index, index % 2 ? "Seafood" : "Vegetarian", index % 2 ? "Japanese" : "Greek", "Rice")
  );
  const selected = selectRecommendationWindow(matched, exploration, {
    likes: ["chicken"],
    seenIds: ["1", "2"],
    upIds: ["3"],
    downIds: ["4"],
    cursor: 0,
  });
  assert.equal(selected.length, 18);
  assert.equal(selected.some((item) => ["1", "2", "4"].includes(item.idMeal)), false);
  assert.equal(selected.filter((item) => Number(item.idMeal) >= 101).length, 3);
});

test("fails closed for unreviewed MealDB categories", () => {
  const selected = selectRecommendationWindow([
    meal(1, "Dessert", "American", "Sugar"),
    meal(2, "New Category", "Unknown", "Rice"),
    meal(3, "Breakfast", "British", "Egg"),
  ], [], {
    likes: ["egg"],
    seenIds: [],
    upIds: [],
    downIds: [],
    cursor: 0,
  });
  assert.deepEqual(selected.map((item) => item.idMeal), ["3"]);
});
