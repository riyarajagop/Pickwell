export type MealDbCourseRecord = {
  strCategory?: string | null;
};

export type MealDbCourseClassification =
  | { kind: "meal"; category: string; reason: string }
  | { kind: "dessert"; category: string; reason: string }
  | { kind: "non-meal"; category: string; reason: string }
  | { kind: "unknown"; category: string; reason: string };

export const MEALDB_EXCLUDED_RECOMMENDATION_CATEGORIES = [
  "Dessert",
  "Side",
  "Starter",
] as const;

const mealCategories = new Set([
  "beef",
  "breakfast",
  "chicken",
  "goat",
  "lamb",
  "miscellaneous",
  "pasta",
  "pork",
  "seafood",
  "vegan",
  "vegetarian",
]);

function normalizeCategory(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function classifyMealDbCourse(record: MealDbCourseRecord): MealDbCourseClassification {
  const category = normalizeCategory(record.strCategory);
  if (category === "dessert") {
    return { kind: "dessert", category, reason: "TheMealDB categorizes this recipe as Dessert." };
  }
  if (category === "side" || category === "starter") {
    return { kind: "non-meal", category, reason: `TheMealDB categorizes this recipe as ${record.strCategory?.trim()}.` };
  }
  if (mealCategories.has(category)) {
    return { kind: "meal", category, reason: `TheMealDB categorizes this recipe as ${record.strCategory?.trim()}.` };
  }
  return {
    kind: "unknown",
    category,
    reason: category
      ? `TheMealDB category “${record.strCategory?.trim()}” has not been reviewed for meal recommendations.`
      : "TheMealDB did not provide a recipe category.",
  };
}

export function isMealDbMealRecommendation(record: MealDbCourseRecord) {
  return classifyMealDbCourse(record).kind === "meal";
}
