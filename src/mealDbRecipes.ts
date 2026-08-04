import AsyncStorage from "@react-native-async-storage/async-storage";
import mealDbCatalogJson from "./data/mealdb-catalog-with-nutrition.json";
import precomputedUsdaJson from "./data/usda-nutrition-cache.json";
import {
  recipeNutritionFromCatalog,
  type CatalogNutrition,
} from "./catalogNutrition";
import type { Recipe } from "./recipes";
import {
  isMealDbMealRecommendation,
} from "./mealClassifier";
import {
  selectLocalRecipeWindow,
  type RecommendationProfile,
} from "./recommendationCatalog";
import {
  canonicalUsdaQuery,
  estimateServingCount,
  rankUsdaCandidates,
  resolveIngredientGrams,
  type MacroProfile,
  type UsdaNutrientMatch,
} from "./nutritionEstimator";
import {
  estimateIngredientWithFallback,
  type NutritionProvider,
} from "./nutritionFallbacks";
import {
  getUSDAFood,
  searchUSDANutritionFoods,
} from "./foodDataCentral";
type RawMeal = Record<string, string | null | undefined> & {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
  strCategory?: string | null;
};
type LocalCatalogRecipe = {
  id: string;
  name: string;
  category: string | null;
  type: "meal" | "snack" | "drink" | "dessert";
  area: string | null;
  instructions: string | null;
  thumbnail: string | null;
  tags: string[];
  youtube: string | null;
  sourceUrl: string | null;
  ingredients: Array<{ name: string; measure: string | null }>;
  nutrition: CatalogNutrition;
};
type LocalCatalog = {
  fetchedAt: string;
  recipeCount: number;
  recipesById: Record<string, LocalCatalogRecipe>;
};

const localCatalog = mealDbCatalogJson as LocalCatalog;
const localCatalogMeals = Object.values(localCatalog.recipesById)
  .filter((meal) => meal.type === "meal")
  .map((meal) => ({ raw: catalogRecipeToRawMeal(meal), nutrition: meal.nutrition }))
  .filter(({ raw }) => isMealDbMealRecommendation(raw))
  .map(({ raw, nutrition }) => convertMeal(raw, nutrition));
const localCatalogMealsById = new Map(localCatalogMeals.map((recipe) => [recipe.id, recipe]));
// Retained only as a fallback for callers that supply a recipe outside the
// bundled MealDB catalog. Catalog recipes arrive with ready stored nutrition.
const nutritionCacheKey = "pickwell-usda-nutrients-v5";
const precomputedUsdaMatches = (precomputedUsdaJson as {
  version: number;
  matches: Record<string, UsdaNutrientMatch | null>;
}).version === 5
  ? (precomputedUsdaJson as { matches: Record<string, UsdaNutrientMatch | null> }).matches
  : {};

export type NutritionEstimateMeta = {
  status: "pending" | "ready" | "unavailable";
  assumedServings: number;
  servingLabel: string;
  matchedIngredients: number;
  consideredIngredients: number;
  assumptionCount: number;
  basis: string;
  warnings: string[];
  unknownIngredients: string[];
  wholeRecipeNutrition: MacroProfile;
  confidence: "high" | "medium" | "low";
  providers: NutritionProvider[];
  source: "USDA FoodData Central" | "USDA and fallback databases" | "Fallback nutrition databases";
};

export type RecommendationPageOptions = {
  cursor?: number;
  seenIds?: string[];
  upIds?: string[];
  downIds?: string[];
};

export type RecommendationPage = {
  items: Recipe[];
  nextCursor: number;
  hasMore: boolean;
  source: "local" | "shared" | "device";
  meta?: {
    catalogCandidates?: number;
    returned?: number;
    hydrated?: number;
    freshCacheHits?: number;
    staleCacheHits?: number;
    exploration?: number;
  };
};

export function getLocalMealDbRecipe(id: string): Recipe | undefined {
  return localCatalogMealsById.get(id);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function ingredientsFromMeal(meal: RawMeal) {
  return Array.from({ length: 20 }, (_, index) => {
    const name = meal[`strIngredient${index + 1}`]?.trim() ?? "";
    const measure = meal[`strMeasure${index + 1}`]?.trim() ?? "";
    return name ? { id: normalize(name), name, measure } : null;
  }).filter(Boolean) as Array<{ id: string; name: string; measure: string }>;
}

function containsAny(values: string[], terms: string[]) {
  return values.some((value) => terms.some((term) => value.includes(term)));
}

function convertMeal(meal: RawMeal, catalogNutrition: CatalogNutrition): Recipe {
  const sourceIngredients = ingredientsFromMeal(meal);
  const ids = sourceIngredients.map((item) => item.id);
  const meat = ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "ham", "sausage", "duck", "goat", "veal"];
  const fish = ["salmon", "tuna", "cod", "haddock", "trout", "sardine", "anchovy", "mackerel"];
  const animalProducts = [...meat, ...fish, "egg", "milk", "cheese", "cream", "butter", "yogurt", "honey", "gelatin"];
  const vegetarian = !containsAny(ids, [...meat, ...fish, "shrimp", "prawn", "crab", "lobster", "mussel", "clam"]);
  const vegan = !containsAny(ids, animalProducts);
  const hasProhibited = containsAny(ids, ["pork", "bacon", "ham", "lard", "wine", "beer", "brandy", "rum", "vodka"]);
  const fishOnly = !containsAny(ids, meat) && containsAny(ids, fish);
  const category = meal.strCategory ?? "Meal";
  const area = meal.strArea ?? "international";
  const instructions = meal.strInstructions?.trim() ?? "Open the source recipe for directions.";
  const steps = instructions.split(/\r?\n+/).map((step) => step.trim()).filter(Boolean);
  const allergens: string[] = [];
  if (containsAny(ids, ["milk", "cheese", "cream", "butter", "yogurt"])) allergens.push("milk");
  if (containsAny(ids, ["egg"])) allergens.push("egg");
  if (containsAny(ids, ["flour", "bread", "pasta", "noodle", "couscous", "tortilla"])) allergens.push("wheat");
  if (containsAny(ids, ["soy", "tofu", "miso"])) allergens.push("soy");
  if (containsAny(ids, fish)) allergens.push("fish");
  if (containsAny(ids, ["shrimp", "prawn", "crab", "lobster", "mussel", "clam"])) allergens.push("shellfish");
  if (containsAny(ids, ["peanut"])) allergens.push("peanut");
  if (containsAny(ids, ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut"])) allergens.push("tree nut");
  const foodGroups: Recipe["foodGroups"] = [];
  if (containsAny(ids, ["apple", "banana", "berry", "orange", "lemon", "lime", "mango", "peach", "pear", "grape", "avocado"])) foodGroups.push("fruit");
  if (containsAny(ids, ["carrot", "tomato", "onion", "pepper", "lettuce", "spinach", "broccoli", "cabbage", "potato", "corn", "cucumber", "mushroom"])) foodGroups.push("vegetables");
  if (containsAny(ids, ["rice", "pasta", "noodle", "bread", "flour", "oat", "barley", "couscous", "tortilla"])) foodGroups.push("grains");
  if (containsAny(ids, [...meat, ...fish, "egg", "bean", "lentil", "chickpea", "tofu", "nut"])) foodGroups.push("protein");
  if (containsAny(ids, ["milk", "cheese", "cream", "butter", "yogurt"])) foodGroups.push("dairy");
  const categoryLower = category.toLocaleLowerCase();
  const emoji = categoryLower.includes("seafood") ? "🐟" : categoryLower.includes("chicken") ? "🍗" : categoryLower.includes("beef") ? "🥩" : categoryLower.includes("breakfast") ? "🍳" : categoryLower.includes("dessert") ? "🍰" : vegetarian ? "🥗" : "🍽️";
  return {
    id: `mealdb-${meal.idMeal}`,
    name: meal.strMeal,
    mealType: categoryLower.includes("breakfast") ? "Breakfast" : categoryLower.includes("dessert") ? "Snack" : "Main meal",
    minutes: 0,
    description: `A ${area} ${category.toLocaleLowerCase()} recipe from TheMealDB.`,
    tags: [...ids, categoryLower, normalize(area)],
    allergens,
    vegetarian,
    dietary: { vegan, halalCompatible: !hasProhibited && (vegetarian || fishOnly), kosherCompatible: vegetarian || fishOnly },
    ...recipeNutritionFromCatalog(catalogNutrition),
    emoji,
    color: "#E5A74E",
    foodGroups,
    ingredientIds: ids,
    ingredients: sourceIngredients.map((item) => `${item.measure} ${item.name}`.trim()),
    sourceIngredients,
    steps,
    imageUrl: meal.strMealThumb || undefined,
    sourceUrl: meal.strSource || meal.strYoutube || undefined,
    provider: "TheMealDB",
  };
}

export async function loadMealDbRecommendationPage(
  profile: RecommendationProfile,
  options: RecommendationPageOptions = {},
): Promise<RecommendationPage> {
  const selection = selectLocalRecipeWindow(localCatalogMeals, profile, {
    ...options,
    limit: 18,
  });
  if (!selection.items.length) throw new Error("The local catalog has no unseen recipes that match this profile.");
  return {
    items: selection.items,
    nextCursor: (options.cursor ?? 0) + 1,
    hasMore: selection.hasMore,
    source: "local",
    meta: {
      catalogCandidates: localCatalogMeals.length,
      returned: selection.items.length,
      hydrated: 0,
      freshCacheHits: selection.items.length,
      staleCacheHits: 0,
      exploration: 0,
    },
  };
}

export async function loadMealDbRecommendations(likes: string[]): Promise<Recipe[]> {
  return (await loadMealDbRecommendationPage({
    likes,
    dislikes: [],
    restrictions: [],
    vegetarian: false,
    vegan: false,
    halalCompatible: false,
    kosherCompatible: false,
  })).items;
}

function catalogRecipeToRawMeal(recipe: LocalCatalogRecipe): RawMeal {
  const meal: RawMeal = {
    idMeal: recipe.id,
    strMeal: recipe.name,
    strCategory: recipe.category,
    strArea: recipe.area,
    strInstructions: recipe.instructions,
    strMealThumb: recipe.thumbnail,
    strTags: recipe.tags.join(","),
    strYoutube: recipe.youtube,
    strSource: recipe.sourceUrl,
  };
  recipe.ingredients.slice(0, 20).forEach((ingredient, index) => {
    meal[`strIngredient${index + 1}`] = ingredient.name;
    meal[`strMeasure${index + 1}`] = ingredient.measure;
  });
  return meal;
}

async function searchNutrients(query: string): Promise<UsdaNutrientMatch | null> {
  const foods = await searchUSDANutritionFoods(query);
  const selected = rankUsdaCandidates(foods, query);
  if (!selected) return null;
  const detail = await getUSDAFood(selected.fdcId);
  return detail ? rankUsdaCandidates([detail], query) : null;
}

export async function estimateMealNutrition(recipe: Recipe): Promise<{ nutrition: Recipe["nutrition"]; meta: NutritionEstimateMeta }> {
  let cache: Record<string, UsdaNutrientMatch | null> = { ...precomputedUsdaMatches };
  try {
    cache = {
      ...cache,
      ...JSON.parse(await AsyncStorage.getItem(nutritionCacheKey) ?? "{}") as Record<string, UsdaNutrientMatch | null>,
    };
  } catch { /* use bundled cache */ }
  const considered = recipe.sourceIngredients ?? [];
  let matched = 0;
  let consideredCount = 0;
  let assumptionCount = 0;
  let measuredGrams = 0;
  const warnings: string[] = [];
  const unknownIngredients: string[] = [];
  const providers = new Set<NutritionProvider>();
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of considered) {
    const initialGrams = resolveIngredientGrams(item.name, item.measure);
    if (initialGrams.status === "excluded") {
      warnings.push(`${item.name}: ${initialGrams.reason}`);
      continue;
    }
    consideredCount += 1;
    const query = canonicalUsdaQuery(item.name);
    const key = normalize(query);
    let usdaRequestFailed = false;
    if (!(key in cache)) {
      try {
        const match = await searchNutrients(query);
        if (match) cache[key] = match;
      }
      catch (error) {
        usdaRequestFailed = true;
        warnings.push(`${item.name}: ${error instanceof Error ? error.message : "USDA lookup failed."}`);
      }
    }
    const profile = cache[key];
    const grams = profile && initialGrams.status === "unresolved"
      ? resolveIngredientGrams(item.name, item.measure, profile.foodPortions)
      : initialGrams;
    if (grams.status === "included") {
      measuredGrams += grams.grams;
      if (grams.warning) {
        assumptionCount += 1;
        warnings.push(`${item.name}: ${grams.warning}`);
      }
    }
    if (profile && grams.status === "included") {
      matched += 1;
      providers.add("USDA FoodData Central");
      const multiplier = grams.grams / 100;
      const macros: MacroProfile = profile.nutrientsPer100g;
      total.calories += macros.calories * multiplier;
      total.protein += macros.protein * multiplier;
      total.carbs += macros.carbs * multiplier;
      total.fat += macros.fat * multiplier;
      continue;
    }
    if (profile) {
      warnings.push(`${item.name}: USDA matched “${profile.description}”, but no portion weight matched “${item.measure}”.`);
    } else if (!usdaRequestFailed) {
      warnings.push(`${item.name}: no complete USDA macro match was available for “${query}”; tried fallback databases.`);
    }
    if (grams.status === "unresolved") {
      warnings.push(`${item.name}: ${grams.reason} Tried quantity-aware fallback databases.`);
    }
    const fallback = await estimateIngredientWithFallback({
      name: item.name,
      measure: item.measure,
      grams: grams.status === "included" ? grams.grams : null,
    });
    if (fallback) {
      matched += 1;
      providers.add(fallback.provider);
      total.calories += fallback.nutrition.calories;
      total.protein += fallback.nutrition.protein;
      total.carbs += fallback.nutrition.carbs;
      total.fat += fallback.nutrition.fat;
      if (grams.status === "unresolved" && fallback.resolvedGrams) {
        measuredGrams += fallback.resolvedGrams;
        assumptionCount += 1;
      }
      warnings.push(`${item.name}: estimated with ${fallback.provider} as “${fallback.description}”.`);
      continue;
    }
    const sourceText = `${item.measure} ${item.name}`.trim();
    unknownIngredients.push(sourceText);
    warnings.push(`${item.name}: no nutrition estimate was available from USDA, Nutritionix, or Open Food Facts.`);
  }
  await AsyncStorage.setItem(nutritionCacheKey, JSON.stringify(cache));
  const servings = estimateServingCount(recipe, total.calories, measuredGrams);
  const wholeRecipeNutrition = Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value)])) as MacroProfile;
  const nutrition = Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value / servings.count)])) as Recipe["nutrition"];
  const coverage = consideredCount > 0 ? matched / consideredCount : 0;
  const confidence = coverage >= 0.9 ? "high" : coverage >= 0.65 ? "medium" : "low";
  const providerList = [...providers];
  const source = providerList.length === 1 && providerList[0] === "USDA FoodData Central"
    ? "USDA FoodData Central"
    : providerList.includes("USDA FoodData Central")
      ? "USDA and fallback databases"
      : "Fallback nutrition databases";
  return {
    nutrition,
    meta: {
      status: matched ? "ready" : "unavailable",
      assumedServings: servings.count,
      servingLabel: `1 of ${servings.count} estimated ${servings.count === 1 ? "serving" : "servings"}`,
      matchedIngredients: matched,
      consideredIngredients: consideredCount,
      assumptionCount,
      basis: servings.basis,
      warnings,
      unknownIngredients,
      wholeRecipeNutrition,
      confidence,
      providers: providerList,
      source,
    },
  };
}
