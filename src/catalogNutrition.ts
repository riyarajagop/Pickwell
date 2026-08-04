import type { Recipe } from "./recipes";

export type CatalogNutrition = {
  status: "usda" | "estimated" | "partial";
  confidence: "high" | "medium" | "low";
  wholeRecipe: Recipe["nutrition"];
  perServing: Recipe["nutrition"];
  servings: {
    count: number;
    source: "recipe" | "estimated";
    basis: string;
  };
  coverage: {
    totalIngredients: number;
    includedIngredients: number;
    excludedIngredients: number;
    unresolvedIngredients: number;
    usdaIngredients: number;
    llmNutritionFallbacks: number;
    llmGramFallbacks: number;
  };
  warnings: string[];
};

function roundedMacros(macros: Recipe["nutrition"]): Recipe["nutrition"] {
  return {
    calories: Math.round(macros.calories),
    protein: Math.round(macros.protein),
    carbs: Math.round(macros.carbs),
    fat: Math.round(macros.fat),
  };
}

export function recipeNutritionFromCatalog(nutrition: CatalogNutrition): Pick<Recipe, "nutrition" | "nutritionEstimate"> {
  const providers: NonNullable<Recipe["nutritionEstimate"]>["providers"] = [];
  if (nutrition.coverage.usdaIngredients > 0) providers.push("USDA FoodData Central");
  if (nutrition.coverage.llmNutritionFallbacks > 0) providers.push("Model-reviewed estimate");
  const servings = Math.max(1, Math.round(nutrition.servings.count));

  return {
    nutrition: roundedMacros(nutrition.perServing),
    nutritionEstimate: {
      status: "ready",
      assumedServings: servings,
      servingLabel: `1 of ${servings} estimated ${servings === 1 ? "serving" : "servings"}`,
      matchedIngredients: nutrition.coverage.includedIngredients,
      consideredIngredients: nutrition.coverage.includedIngredients,
      assumptionCount: nutrition.coverage.llmNutritionFallbacks + nutrition.coverage.llmGramFallbacks,
      basis: nutrition.servings.basis,
      warnings: nutrition.warnings,
      unknownIngredients: [],
      wholeRecipeNutrition: roundedMacros(nutrition.wholeRecipe),
      confidence: nutrition.confidence,
      providers,
      source: "Precomputed catalog",
    },
  };
}
