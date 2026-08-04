export type RawMeal = Record<string, string | null | undefined> & {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strMealThumb?: string | null;
};

export type RecommendationSelection = {
  likes: string[];
  seenIds: string[];
  upIds: string[];
  downIds: string[];
  cursor: number;
  limit?: number;
};

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

export function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function normalizeMealId(value: string) {
  return value.replace(/^mealdb-/, "").trim();
}

export function isRecommendationMeal(meal: RawMeal) {
  return mealCategories.has(normalize(meal.strCategory ?? ""));
}

export function ingredientNames(meal: RawMeal) {
  return Array.from({ length: 20 }, (_, index) => normalize(meal[`strIngredient${index + 1}`] ?? ""))
    .filter(Boolean);
}

export function selectRecommendationWindow(
  matchedMeals: RawMeal[],
  explorationMeals: RawMeal[],
  selection: RecommendationSelection,
) {
  const limit = Math.max(1, Math.min(selection.limit ?? 18, 30));
  const explorationLimit = Math.min(3, Math.floor(limit * 0.2));
  const seen = new Set(selection.seenIds.map(normalizeMealId));
  const down = new Set(selection.downIds.map(normalizeMealId));
  const up = new Set(selection.upIds.map(normalizeMealId));
  const likes = selection.likes.map(normalize).filter(Boolean);
  const matchedIds = new Set(matchedMeals.map((meal) => meal.idMeal));
  const used = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const selected: RawMeal[] = [];

  const eligible = (meal: RawMeal) =>
    Boolean(meal.idMeal) &&
    isRecommendationMeal(meal) &&
    !seen.has(meal.idMeal) &&
    !down.has(meal.idMeal);

  const exploitation = dedupeMeals(matchedMeals).filter(eligible);
  const exploration = dedupeMeals(explorationMeals)
    .filter(eligible)
    .filter((meal) => !matchedIds.has(meal.idMeal));

  const pick = (pool: RawMeal[]) => {
    let best: RawMeal | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const meal of pool) {
      if (used.has(meal.idMeal)) continue;
      const category = normalize(meal.strCategory ?? "");
      const area = normalize(meal.strArea ?? "");
      const ingredients = ingredientNames(meal);
      const likedIngredients = likes.filter((like) =>
        ingredients.some((ingredient) => ingredient.includes(like) || like.includes(ingredient))
      ).length;
      const score =
        likedIngredients * 100 +
        (up.has(meal.idMeal) ? 35 : 0) -
        (categoryCounts.get(category) ?? 0) * 12 -
        (areaCounts.get(area) ?? 0) * 7 +
        seededUnit(`${selection.cursor}:${meal.idMeal}`) * 20;
      if (score > bestScore) {
        best = meal;
        bestScore = score;
      }
    }
    if (!best) return false;
    used.add(best.idMeal);
    selected.push(best);
    const category = normalize(best.strCategory ?? "");
    const area = normalize(best.strArea ?? "");
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    return true;
  };

  while (selected.length < limit - explorationLimit && pick(exploitation)) {
    // Greedy selection recalculates diversity penalties after each pick.
  }
  while (selected.length < limit && pick(exploration)) {
    // Reserve a small share for recipes outside the strongest profile pool.
  }
  while (selected.length < limit && pick(exploitation)) {
    // Backfill when the exploration catalog is still small.
  }
  while (selected.length < limit && pick(exploration)) {
    // Backfill from exploration if profile filters returned fewer than requested.
  }

  return selected;
}

export function stableProfileKey(values: string[]) {
  const normalized = [...new Set(values.map(normalize).filter(Boolean))].sort();
  return `recommendations:v2:${hashString(normalized.join("|")).toString(16)}`;
}

export function deterministicOrder(ids: string[], seed: string) {
  return [...ids].sort((left, right) =>
    seededUnit(`${seed}:${left}`) - seededUnit(`${seed}:${right}`)
  );
}

function dedupeMeals(meals: RawMeal[]) {
  const unique = new Map<string, RawMeal>();
  for (const meal of meals) {
    if (meal.idMeal) unique.set(meal.idMeal, meal);
  }
  return [...unique.values()];
}

function seededUnit(value: string) {
  return hashString(value) / 0xffffffff;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
