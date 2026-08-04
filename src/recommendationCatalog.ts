import type { Recipe } from "./recipes";

export type RecommendationProfile = {
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  vegetarian: boolean;
  vegan: boolean;
  halalCompatible: boolean;
  kosherCompatible: boolean;
};

export type RecipeWindowOptions = {
  cursor?: number;
  seenIds?: string[];
  upIds?: string[];
  downIds?: string[];
  limit?: number;
};

export function recipeMatchesRecommendationProfile(recipe: Recipe, profile: RecommendationProfile) {
  if (profile.vegetarian && !recipe.vegetarian) return false;
  if (profile.vegan && !recipe.dietary.vegan) return false;
  if (profile.halalCompatible && !recipe.dietary.halalCompatible) return false;
  if (profile.kosherCompatible && !recipe.dietary.kosherCompatible) return false;

  const recipeKeys = recipePreferenceKeys(recipe);
  const restrictions = expandPreferenceKeys(profile.restrictions);
  const dislikes = expandPreferenceKeys(profile.dislikes);
  if ([...recipeKeys].some((item) => restrictions.has(item))) return false;
  if ([...recipeKeys].some((item) => dislikes.has(item))) return false;
  return true;
}

export function selectLocalRecipeWindow(
  recipes: Recipe[],
  profile: RecommendationProfile,
  options: RecipeWindowOptions = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? 18, 30));
  const cursor = Math.max(0, options.cursor ?? 0);
  const seen = new Set((options.seenIds ?? []).map(normalizeRecipeId));
  const down = new Set((options.downIds ?? []).map(normalizeRecipeId));
  const up = new Set((options.upIds ?? []).map(normalizeRecipeId));
  const likes = expandPreferenceKeys(profile.likes);

  const eligible = recipes.filter((recipe) =>
    recipeMatchesRecommendationProfile(recipe, profile) &&
    !seen.has(normalizeRecipeId(recipe.id)) &&
    !down.has(normalizeRecipeId(recipe.id))
  );
  const ranked = [...eligible].sort((left, right) => {
    const scoreDifference = recipeScore(right, likes, up) - recipeScore(left, likes, up);
    if (scoreDifference) return scoreDifference;
    return seededUnit(`${cursor}:${left.id}`) - seededUnit(`${cursor}:${right.id}`);
  });

  return {
    items: ranked.slice(0, limit),
    hasMore: ranked.length > limit,
    eligibleCount: ranked.length,
  };
}

function recipeScore(recipe: Recipe, likes: Set<string>, up: Set<string>) {
  const keys = recipePreferenceKeys(recipe);
  const likedIngredients = [...likes].filter((like) => keys.has(like)).length;
  return likedIngredients * 100 + (up.has(normalizeRecipeId(recipe.id)) ? 35 : 0);
}

function recipePreferenceKeys(recipe: Recipe) {
  const keys = new Set(
    [...recipe.tags, ...recipe.allergens, ...recipe.ingredientIds].map(normalize),
  );
  for (const ingredient of recipe.ingredientIds.map(normalize)) {
    if (ingredient.includes("cheese")) keys.add("cheese");
    if (ingredient.includes("spaghetti") || ingredient.includes("noodle") || ingredient.includes("macaroni")) keys.add("pasta");
    if (ingredient.includes("chicken")) keys.add("chicken");
  }
  return keys;
}

function expandPreferenceKeys(items: string[]) {
  const aliases: Record<string, string[]> = { egg: ["eggs"], eggs: ["egg"] };
  return new Set(items.flatMap((item) => {
    const key = normalize(item);
    return [key, ...(aliases[key] ?? [])];
  }).filter(Boolean));
}

function normalizeRecipeId(value: string) {
  return value.replace(/^mealdb-/, "").trim();
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function seededUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
