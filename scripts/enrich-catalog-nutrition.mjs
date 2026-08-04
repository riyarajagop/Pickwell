import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  canonicalUsdaQuery,
  normalizeMeasureText,
  parseQuantity,
  resolveIngredientGrams,
} from "../src/nutritionEstimator.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.resolve(process.env.PICKWELL_CATALOG_PATH || path.join(root, "src/data/mealdb-catalog.json"));
const cachePath = path.resolve(process.env.PICKWELL_USDA_CACHE_PATH || path.join(root, "src/data/usda-nutrition-cache.json"));
const outputPath = path.resolve(process.env.PICKWELL_ENRICHED_CATALOG_PATH || path.join(root, "src/data/mealdb-catalog-with-nutrition.json"));
const reviewPath = path.resolve(process.env.PICKWELL_NUTRITION_REVIEW_PATH || path.join(root, "src/data/mealdb-nutrition-review.json"));
const generatedAt = new Date().toISOString();
const sourceText = await fs.readFile(catalogPath, "utf8");
const sourceSha256 = createHash("sha256").update(sourceText).digest("hex");
const catalog = JSON.parse(sourceText);
const cache = JSON.parse(await fs.readFile(cachePath, "utf8"));

if (!catalog?.recipesById || typeof catalog.recipesById !== "object") {
  throw new Error("The MealDB catalog does not contain recipesById.");
}
if (cache?.version !== 5 || !cache.matches || typeof cache.matches !== "object") {
  throw new Error("The USDA cache must use version 5 and contain a matches dictionary.");
}

const enrichedRecipes = {};
const reviewRecipes = [];
const aggregate = {
  recipes: 0,
  ingredients: 0,
  usdaIngredients: 0,
  llmNutritionFallbacks: 0,
  llmGramFallbacks: 0,
  excludedIngredients: 0,
  unresolvedIngredients: 0,
  highConfidenceRecipes: 0,
  mediumConfidenceRecipes: 0,
  lowConfidenceRecipes: 0,
};

for (const [recipeId, recipe] of Object.entries(catalog.recipesById)) {
  const ingredientResults = [];
  const total = emptyMacros();
  let measuredGrams = 0;

  for (const ingredient of recipe.ingredients ?? []) {
    aggregate.ingredients += 1;
    const query = normalize(canonicalUsdaQuery(ingredient.name));
    const usda = cache.matches[query] ?? null;
    const nutritionSource = usda
      ? {
          kind: "usda",
          description: usda.description,
          fdcId: usda.fdcId,
          dataType: usda.dataType,
          publicationDate: usda.publicationDate ?? null,
          nutrientsPer100g: usda.nutrientsPer100g,
        }
      : llmNutritionFallback(ingredient.name, query);
    let grams = resolveIngredientGrams(ingredient.name, ingredient.measure ?? "", usda?.foodPortions ?? []);

    if (grams.status === "unresolved") {
      const fallback = llmGramFallback(ingredient.name, ingredient.measure ?? "");
      if (fallback) {
        grams = {
          status: "included",
          grams: fallback.grams,
          method: fallback.method,
          warning: fallback.warning,
        };
      }
    }
    if (
      grams.status === "included"
      && grams.grams > 100
      && /\boil\b/i.test(ingredient.name)
      && !/\boil\b/i.test(recipe.name)
      && /\b(?:deep[- ]?fry|fry|fried|frying)\b/i.test(recipe.instructions ?? "")
    ) {
      grams = {
        status: "included",
        grams: 30,
        method: "LLM-reviewed 30 g absorbed frying-oil assumption for the whole recipe",
        warning: `The recipe lists ${ingredient.measure ?? "an unmeasured amount"} of frying oil, but most remains in the cooking vessel; counted 30 g as absorbed.`,
      };
    }

    if (grams.status === "excluded") {
      aggregate.excludedIngredients += 1;
      ingredientResults.push({
        sourceName: ingredient.name,
        sourceMeasure: ingredient.measure ?? null,
        canonicalQuery: query,
        status: "excluded",
        reason: grams.reason,
        edibleGrams: null,
        gramConversion: null,
        nutritionSource: null,
        nutrients: null,
        warnings: [grams.reason],
      });
      continue;
    }

    if (grams.status === "unresolved" || !nutritionSource) {
      aggregate.unresolvedIngredients += 1;
      ingredientResults.push({
        sourceName: ingredient.name,
        sourceMeasure: ingredient.measure ?? null,
        canonicalQuery: query,
        status: "unresolved",
        reason: grams.status === "unresolved" ? grams.reason : "No USDA or LLM-reviewed nutrition profile was available.",
        edibleGrams: null,
        gramConversion: null,
        nutritionSource: null,
        nutrients: null,
        warnings: [grams.status === "unresolved" ? grams.reason : "No nutrition profile was available."],
      });
      continue;
    }

    const nutrients = scaleMacros(nutritionSource.nutrientsPer100g, grams.grams);
    addMacros(total, nutrients);
    measuredGrams += grams.grams;
    if (nutritionSource.kind === "usda") aggregate.usdaIngredients += 1;
    else aggregate.llmNutritionFallbacks += 1;
    if (grams.method.includes("LLM-reviewed")) aggregate.llmGramFallbacks += 1;

    ingredientResults.push({
      sourceName: ingredient.name,
      sourceMeasure: ingredient.measure ?? null,
      canonicalQuery: query,
      status: "included",
      reason: null,
      edibleGrams: round(grams.grams),
      gramConversion: grams.method,
      nutritionSource,
      nutrients,
      warnings: [grams.warning].filter(Boolean),
    });
  }

  const included = ingredientResults.filter((ingredient) => ingredient.status === "included");
  const excluded = ingredientResults.filter((ingredient) => ingredient.status === "excluded");
  const unresolved = ingredientResults.filter((ingredient) => ingredient.status === "unresolved");
  const usdaCount = included.filter((ingredient) => ingredient.nutritionSource?.kind === "usda").length;
  const llmNutritionCount = included.length - usdaCount;
  const llmGramCount = included.filter((ingredient) => ingredient.gramConversion?.includes("LLM-reviewed")).length;
  const servings = estimateCatalogServingCount(recipe, total.calories, measuredGrams);
  const wholeRecipe = roundMacros(total);
  const perServing = divideMacros(wholeRecipe, servings.count);
  const confidence = recipeConfidence(included.length, usdaCount, llmNutritionCount, llmGramCount, unresolved.length);
  aggregate[`${confidence}ConfidenceRecipes`] += 1;
  aggregate.recipes += 1;

  const warnings = [
    ...ingredientResults.flatMap((ingredient) => ingredient.warnings.map((warning) => `${ingredient.sourceName}: ${warning}`)),
    ...(unresolved.length ? [`${unresolved.length} ingredient(s) remain unresolved; totals exclude them.`] : []),
    ...(llmNutritionCount ? [`${llmNutritionCount} ingredient(s) use explicitly labeled LLM-reviewed generic macro profiles because USDA had no defensible match.`] : []),
    ...(llmGramCount ? [`${llmGramCount} ingredient quantity or portion weight(s) use explicitly labeled LLM-reviewed assumptions.`] : []),
  ];

  const nutrition = {
    schemaVersion: 1,
    rulesVersion: 2,
    generatedAt,
    sourceCatalogSha256: sourceSha256,
    status: unresolved.length ? "partial" : llmNutritionCount || llmGramCount ? "estimated" : "usda",
    confidence,
    wholeRecipe,
    perServing,
    servings: {
      count: servings.count,
      source: servings.basis.includes("stated yield") ? "recipe" : "estimated",
      basis: servings.basis,
    },
    coverage: {
      totalIngredients: ingredientResults.length,
      includedIngredients: included.length,
      excludedIngredients: excluded.length,
      unresolvedIngredients: unresolved.length,
      usdaIngredients: usdaCount,
      llmNutritionFallbacks: llmNutritionCount,
      llmGramFallbacks: llmGramCount,
    },
    ingredients: ingredientResults,
    warnings,
  };

  enrichedRecipes[recipeId] = { ...recipe, nutrition };
  if (confidence !== "high" || warnings.length) {
    reviewRecipes.push({
      id: recipe.id,
      name: recipe.name,
      status: nutrition.status,
      confidence,
      coverage: nutrition.coverage,
      warnings,
    });
  }
}

const enrichedCatalog = {
  ...catalog,
  nutritionSchemaVersion: 1,
  nutritionRulesVersion: 2,
  nutritionGeneratedAt: generatedAt,
  nutritionSourceCatalogSha256: sourceSha256,
  recipesById: enrichedRecipes,
};
const review = {
  schemaVersion: 1,
  generatedAt,
  sourceCatalogSha256: sourceSha256,
  aggregate,
  recipes: reviewRecipes,
};

await atomicJsonWrite(outputPath, enrichedCatalog);
await atomicJsonWrite(reviewPath, review);
process.stdout.write(`${JSON.stringify({ outputPath, reviewPath, sourceSha256, aggregate }, null, 2)}\n`);

function llmNutritionFallback(name, query) {
  const text = normalize(`${name} ${query}`);
  const profiles = [
    [/water|food colouring|bouquet garni|lime leaves|pandan leaves|vine leaves/, "negligible garnish or infusion ingredient", macros(0, 0, 0, 0)],
    [/salt|bicarbonate|baking soda/, "non-caloric seasoning or leavening ingredient", macros(0, 0, 0, 0)],
    [/oil|fat|shortening|lard|ghee|suet/, "generic cooking fat", macros(884, 0, 0, 100)],
    [/sugar|syrup|treacle|molasses|honey|jam|caramel|dulce|stroop/, "generic sugar, syrup, or preserve", macros(300, 0.5, 76, 0.2)],
    [/spice|masala|cajun|harissa|curry|seasoning|sumac|chilli|pepper|paprika|achiote|sazon|jerk|pul biber/, "generic dry seasoning blend", macros(300, 10, 55, 10)],
    [/sauce|gochujang|doubanjiang|prahok|paste|ketchup|mustard|relish/, "generic prepared sauce or paste", macros(120, 3, 20, 4)],
    [/wine|sherry|mirin|stout|beer|brandy|rum|liqueur/, "generic cooking alcoholic beverage", macros(85, 0.2, 5, 0)],
    [/cream|malai|fromage|mascarpone|quark/, "generic full-fat cultured dairy", macros(250, 4, 5, 24)],
    [/cheese|bryndza|manchego|stilton|panquehue|västerbottensost/, "generic full-fat cheese", macros(360, 23, 3, 29)],
    [/sausage|black pudding|doner|morcilla|ham|meat/, "generic prepared meat", macros(280, 18, 3, 22)],
    [/fish|prawn|pilchard|barramundi|hake|seafood/, "generic cooked seafood", macros(130, 22, 1, 4)],
    [/bread|baguette|ciabatta|biscuit|pastry|filo|marzipan|knafeh|pudding|nougat|cookie|oreo/, "generic baked grain or confection", macros(360, 7, 55, 13)],
    [/rice|oat|freekeh|farine|masarepa|sevaiiya|grain|flour/, "generic dry grain or flour", macros(365, 10, 76, 2)],
    [/almond|hazelnut|nut|seed|khus khus/, "generic nut or seed", macros(575, 20, 20, 49)],
    [/bean|pea|dal|lentil|soya/, "generic cooked legume", macros(130, 8, 23, 1)],
    [/apple|berry|currant|fig|peach|pear|fruit|ackee/, "generic fruit", macros(70, 0.8, 17, 0.5)],
    [/lettuce|beet|broccoli|chilli|pepper|callaloo|swede|rocket|vegetable|cabbage|daikon|galangal/, "generic non-starchy vegetable", macros(35, 2, 7, 0.4)],
  ];
  const selected = profiles.find(([pattern]) => pattern.test(text))
    ?? [null, "generic composite ingredient", macros(180, 6, 22, 8)];
  return {
    kind: "llm-estimate",
    description: `LLM-reviewed ${selected[1]}`,
    fdcId: null,
    dataType: null,
    publicationDate: null,
    nutrientsPer100g: selected[2],
  };
}

function llmGramFallback(name, rawMeasure) {
  const ingredient = normalize(name);
  const measure = normalizeMeasureText(rawMeasure || "");
  if (/\boptional\b|to taste|garnish/.test(`${ingredient} ${measure}`)) return null;

  const parenthesizedMass = measure.match(/\(?\s*(\d+(?:\.\d+)?)\s*(kg|g|mg|lb|lbs|pounds?|oz|ounces?)\s*\)?/);
  if (parenthesizedMass) {
    const count = parseQuantity(measure) ?? 1;
    const grams = count * Number(parenthesizedMass[1]) * massFactor(parenthesizedMass[2]);
    return assumedGrams(grams, `LLM-reviewed package interpretation of “${rawMeasure}”`);
  }

  const rangeMass = measure.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|pounds?|oz|ounces?)/);
  if (rangeMass) {
    const amount = (Number(rangeMass[1]) + Number(rangeMass[2])) / 2;
    return assumedGrams(amount * massFactor(rangeMass[3]), `LLM-reviewed midpoint of package range “${rawMeasure}”`);
  }

  const quantity = parseQuantity(measure)
    ?? (/\b(?:dash|splash|drizzle|dusting|topping|sprinkling|sprinking|handfull|handful|bunch|sprig|stalk|leaf|leaves|pod|knob|pot|packet|package|can|tin|bottle|scoop|head)\b/.test(measure) ? 1 : null);
  const amount = quantity ?? 1;
  let gramsPerUnit = null;
  let unit = "typical item";

  if (/\bquarts?\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient) * 4;
    unit = "quart";
  } else if (/\bpints?\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient) * 2;
    unit = "pint";
  } else if (/\bcups?| c\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient);
    unit = "cup";
  } else if (/\b(?:tbsp|tablespoons?)\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient) / 16;
    unit = "tablespoon";
  } else if (/\b(?:tsp|teaspoons?)\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient) / 48;
    unit = "teaspoon";
  } else if (/\bml|milliliters?\b/.test(measure)) {
    gramsPerUnit = densityPerCup(ingredient) / 236.588;
    unit = "milliliter";
  } else if (/\b(?:can|tin)\b/.test(measure)) {
    gramsPerUnit = /condensed milk/.test(ingredient) ? 397 : 400;
    unit = "can";
  } else if (/\bpot\b/.test(measure)) {
    gramsPerUnit = 200;
    unit = "pot";
  } else if (/\b(?:packet|package)\b/.test(measure)) {
    gramsPerUnit = /noodles|vermicelli|pasta/.test(ingredient) ? 250 : 200;
    unit = "package";
  } else if (/\bbottle\b/.test(measure)) {
    gramsPerUnit = 500;
    unit = "bottle";
  } else if (/\bscoop\b/.test(measure)) {
    gramsPerUnit = /ice cream/.test(ingredient) ? 66 : 30;
    unit = "scoop";
  } else if (/\b(?:dash|splash|drizzle)\b/.test(measure)) {
    gramsPerUnit = /oil/.test(ingredient) ? 5 : 10;
    unit = "small unmeasured addition";
  } else if (/\b(?:dusting|topping|sprinkling|sprinking)\b/.test(measure)) {
    gramsPerUnit = /sugar|flour|cheese|parmesan/.test(ingredient) ? 10 : 3;
    unit = "small topping";
  } else if (/\b(?:bunch|handfull|handful)\b/.test(measure)) {
    gramsPerUnit = /herb|parsley|coriander|cilantro|dill|mint|basil|chive/.test(ingredient) ? 30 : 150;
    unit = "bunch or handful";
  } else if (/\b(?:sprig|stalk|leaf|leaves|pod)\b/.test(measure)) {
    gramsPerUnit = /lime|bay|pandan|herb|thyme|rosemary|parsley|coriander|mint|basil/.test(ingredient) ? 1 : 10;
    unit = "sprig, stalk, leaf, or pod";
  } else if (/\bto serve\b/.test(measure)) {
    gramsPerUnit = typicalItemGrams(ingredient);
    unit = "typical side serving";
  } else if (/chopped|grated|beaten|boiled|steamed|sliced|crushed|ground|glaze|brushing|as required|large piece|thumb sized/.test(measure)) {
    gramsPerUnit = typicalItemGrams(ingredient);
    unit = "described but unmeasured item";
  } else {
    gramsPerUnit = typicalItemGrams(ingredient);
  }
  return assumedGrams(amount * gramsPerUnit, `LLM-reviewed ${amount} ${unit} assumption for “${rawMeasure || name}”`);
}

function densityPerCup(ingredient) {
  if (/oil|fat|ghee|lard|shortening/.test(ingredient)) return 216;
  if (/sugar/.test(ingredient)) return 200;
  if (/flour|starch|powder|spice|seasoning|cocoa/.test(ingredient)) return 125;
  if (/rice|lentil|bean|grain|oat/.test(ingredient)) return 185;
  if (/pasta|noodle|vermicelli/.test(ingredient)) return 100;
  if (/nut|seed|raisin|currant|dried/.test(ingredient)) return 140;
  if (/cheese|mozzarella|parmesan|feta/.test(ingredient)) return 125;
  if (/herb|parsley|coriander|cilantro|dill|mint|basil|spinach|lettuce/.test(ingredient)) return 30;
  if (/cream|milk|wine|water|sauce|vinegar|juice|stock|broth|paste/.test(ingredient)) return 240;
  return 150;
}

function typicalItemGrams(ingredient) {
  if (/salt|pepper|spice|seasoning|saffron/.test(ingredient)) return 1;
  if (/herb|parsley|coriander|cilantro|dill|mint|basil|thyme|rosemary|chive/.test(ingredient)) return 5;
  if (/egg yolk/.test(ingredient)) return 17;
  if (/\begg/.test(ingredient)) return 50;
  if (/garlic/.test(ingredient)) return 3;
  if (/vanilla pod|cinnamon stick|lemongrass/.test(ingredient)) return 5;
  if (/meat|beef|pork|lamb|veal|chicken|duck|fish|fillet|sausage/.test(ingredient)) return 170;
  if (/prawn|shrimp/.test(ingredient)) return 12;
  if (/bread|pita|naan|bun|roll/.test(ingredient)) return 60;
  if (/rice|pasta|noodle|custard|ice cream/.test(ingredient)) return 180;
  if (/almond|hazelnut|peanut|cashew|walnut|pistachio|pine nut|\bnut\b|\bseed\b/.test(ingredient)) return 1.5;
  if (/oil|butter|sauce|paste/.test(ingredient)) return 15;
  if (/fruit|apple|orange|lemon|lime|plantain|coconut/.test(ingredient)) return 120;
  if (/tomato|pepper|beet|turnip|squash|aubergine|courgette|zucchini|vegetable/.test(ingredient)) return 150;
  return 100;
}

function assumedGrams(grams, method) {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return {
    grams,
    method,
    warning: "No deterministic retail or USDA portion conversion was available; used an explicitly labeled LLM-reviewed quantity assumption.",
  };
}

function massFactor(unit) {
  if (/^kg|kilogram/.test(unit)) return 1000;
  if (/^mg|milligram/.test(unit)) return 0.001;
  if (/^lb|pound/.test(unit)) return 453.59237;
  if (/^oz|ounce/.test(unit)) return 28.349523125;
  return 1;
}

function macros(calories, protein, carbs, fat) {
  return { calories, protein, carbs, fat };
}

function emptyMacros() {
  return macros(0, 0, 0, 0);
}

function scaleMacros(per100g, grams) {
  const multiplier = grams / 100;
  return roundMacros(Object.fromEntries(Object.entries(per100g).map(([key, value]) => [
    key,
    Math.max(0, value) * multiplier,
  ])));
}

function addMacros(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key];
}

function roundMacros(value) {
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, round(amount)]));
}

function divideMacros(value, portions) {
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, round(amount / portions)]));
}

function recipeConfidence(included, usda, llmNutrition, llmGrams, unresolved) {
  if (unresolved) return "low";
  if (!included) return "low";
  const usdaCoverage = usda / included;
  const assumptionCoverage = (llmNutrition + llmGrams) / included;
  if (usdaCoverage >= 0.9 && assumptionCoverage <= 0.1) return "high";
  if (usdaCoverage >= 0.65 && assumptionCoverage <= 0.5) return "medium";
  return "low";
}

function estimateCatalogServingCount(recipe, totalCalories, measuredGrams) {
  if (!(totalCalories > 0)) {
    return {
      count: 1,
      basis: "Used 1 serving because the recipe has no positive calorie total.",
    };
  }

  const distanceFromRange = (caloriesPerServing) => caloriesPerServing < 500
    ? 500 - caloriesPerServing
    : caloriesPerServing > 1000
      ? caloriesPerServing - 1000
      : 0;
  const candidates = Array.from({ length: 32 }, (_, index) => {
    const count = index + 1;
    const caloriesPerServing = totalCalories / count;
    return {
      count,
      caloriesPerServing,
      rangeDistance: distanceFromRange(caloriesPerServing),
      midpointDistance: Math.abs(caloriesPerServing - 750),
    };
  }).sort((left, right) =>
    left.rangeDistance - right.rangeDistance
    || left.midpointDistance - right.midpointDistance
    || left.count - right.count
  );
  const selected = candidates[0];
  const roundedCalories = Math.round(selected.caloriesPerServing);
  const rangeNote = selected.rangeDistance === 0
    ? "within the 500–1,000 kcal target range"
    : "as close as possible to the 500–1,000 kcal target range";
  return {
    count: selected.count,
    basis: `Estimated ${selected.count} ${selected.count === 1 ? "serving" : "servings"} from ${Math.round(totalCalories)} whole-recipe calories, giving about ${roundedCalories} kcal per serving (${rangeNote}).`,
  };
}

async function atomicJsonWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporaryPath, filePath);
}

function normalize(value) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function round(value) {
  return Math.round(value * 100) / 100;
}
