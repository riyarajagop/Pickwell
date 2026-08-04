import { pickwellCatalogApiUrl } from "./catalogApi.ts";
import type { MacroProfile } from "./nutritionEstimator.ts";

export type NutritionProvider = "USDA FoodData Central" | "Nutritionix" | "Open Food Facts";

export type IngredientFallbackEstimate = {
  provider: Exclude<NutritionProvider, "USDA FoodData Central">;
  description: string;
  nutrition: MacroProfile;
  resolvedGrams: number | null;
};

type FallbackInput = {
  name: string;
  measure: string;
  grams: number | null;
};

type OpenFoodFactsProduct = {
  product_name?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
};

type OpenFoodFactsResponse = { products?: OpenFoodFactsProduct[] };

export async function estimateIngredientWithFallback(input: FallbackInput): Promise<IngredientFallbackEstimate | null> {
  const endpoint = pickwellCatalogApiUrl("/v1/nutrition/fallback");
  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.ok) {
        const payload = await response.json() as { estimate?: IngredientFallbackEstimate | null };
        return payload.estimate ?? null;
      }
    } catch {
      // A direct Open Food Facts request remains available when the optional
      // Pickwell worker is not configured or temporarily unavailable.
    }
  }

  if (input.grams === null) return null;
  try {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.searchParams.set("search_terms", input.name);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "10");
    url.searchParams.set("fields", "product_name,generic_name,brands,nutriments");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json() as OpenFoodFactsResponse;
    return selectOpenFoodFactsEstimate(payload.products ?? [], input.name, input.grams);
  } catch {
    return null;
  }
}

export function selectOpenFoodFactsEstimate(
  products: OpenFoodFactsProduct[],
  ingredientName: string,
  grams: number,
): IngredientFallbackEstimate | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const terms = meaningfulTerms(ingredientName);
  if (!terms.length) return null;
  const candidates = products.flatMap((product) => {
    const label = [product.generic_name, product.product_name, product.brands].filter(Boolean).join(" ");
    const normalizedLabel = normalize(label);
    const overlap = terms.filter((term) => normalizedLabel.includes(term)).length;
    if (overlap < Math.max(1, Math.ceil(terms.length * 0.75))) return [];
    const nutrition = openFoodFactsMacros(product.nutriments, grams);
    if (!nutrition) return [];
    const exact = normalize(product.generic_name ?? product.product_name ?? "") === normalize(ingredientName) ? 20 : 0;
    return [{ product, label, nutrition, score: overlap * 10 + exact }];
  }).sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  return selected ? {
    provider: "Open Food Facts",
    description: selected.product.generic_name || selected.product.product_name || selected.label,
    nutrition: selected.nutrition,
    resolvedGrams: grams,
  } : null;
}

function openFoodFactsMacros(nutriments: Record<string, unknown> | undefined, grams: number): MacroProfile | null {
  if (!nutriments) return null;
  const per100g = {
    calories: numeric(nutriments["energy-kcal_100g"]),
    protein: numeric(nutriments.proteins_100g),
    carbs: numeric(nutriments.carbohydrates_100g),
    fat: numeric(nutriments.fat_100g),
  };
  if (!completeMacros(per100g)) return null;
  const multiplier = grams / 100;
  return {
    calories: per100g.calories * multiplier,
    protein: per100g.protein * multiplier,
    carbs: per100g.carbs * multiplier,
    fat: per100g.fat * multiplier,
  };
}

function completeMacros(value: Record<keyof MacroProfile, number | null>): value is MacroProfile {
  return Object.values(value).every((amount) => amount !== null && Number.isFinite(amount) && amount >= 0);
}

function meaningfulTerms(value: string) {
  return normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !["fresh", "chopped", "sliced", "diced"].includes(term));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}
