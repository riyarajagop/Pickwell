import {
  deterministicOrder,
  isRecommendationMeal,
  normalize,
  normalizeMealId,
  selectRecommendationWindow,
  stableProfileKey,
  type RawMeal,
} from "./recommendation.ts";

type MealSummary = {
  idMeal?: string | null;
  strMeal?: string | null;
  strMealThumb?: string | null;
};

type MealDbResponse<T> = { meals?: T[] | null };

type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
};

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledController {
  cron: string;
}

interface Env {
  DB: D1Database;
  MEALDB_API_KEY?: string;
  MEALDB_ENABLE_V2?: string;
  CORS_ORIGIN?: string;
  USDA_FDC_API_KEY?: string;
  NUTRITIONIX_APP_ID?: string;
  NUTRITIONIX_APP_KEY?: string;
}

type CacheRow = {
  key: string;
  namespace: string;
  payload: string;
  fetched_at: number;
  fresh_until: number;
  stale_until: number;
};

type MealRow = {
  meal_id: string;
  payload: string;
  fetched_at: number;
  fresh_until: number;
  stale_until: number;
};

type Cached<T> = {
  value: T;
  status: "fresh" | "stale";
  fetchedAt: number;
};

const FILTER_FRESH_MS = 3 * 24 * 60 * 60 * 1000;
const FILTER_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const MEAL_FRESH_MS = 14 * 24 * 60 * 60 * 1000;
const MEAL_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const PROFILE_FRESH_MS = 24 * 60 * 60 * 1000;
const PROFILE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const INGREDIENT_FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const INGREDIENT_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const USDA_SEARCH_FRESH_MS = 60 * 24 * 60 * 60 * 1000;
const USDA_SEARCH_STALE_MS = 180 * 24 * 60 * 60 * 1000;
const USDA_FOOD_FRESH_MS = 90 * 24 * 60 * 60 * 1000;
const USDA_FOOD_STALE_MS = 180 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 60 * 60 * 1000;
const RESULT_LIMIT = 18;
const MAX_HYDRATIONS_PER_REQUEST = 18;
const DEFAULT_INGREDIENTS = ["chicken", "salmon", "rice", "spaghetti"];
const EXCLUDED_CATEGORIES = ["Dessert", "Side", "Starter"];
const IGNORED_PREFERENCES = new Set([
  "mild",
  "spicy",
  "crunchy",
  "mixed textures",
  "simple texture",
]);
const INGREDIENT_ALIASES: Record<string, string> = {
  pasta: "spaghetti",
  cheese: "cheddar cheese",
  chicken: "chicken breast",
  tuna: "canned tuna",
  eggs: "egg",
  beans: "black beans",
};

const inFlight = new Map<string, Promise<unknown>>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), env);
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM mealdb_meals").first<{ count: number }>();
        return json({
          ok: true,
          catalogMeals: Number(count?.count ?? 0),
          usdaConfigured: Boolean(env.USDA_FDC_API_KEY?.trim()),
          nutritionixConfigured: Boolean(env.NUTRITIONIX_APP_ID?.trim() && env.NUTRITIONIX_APP_KEY?.trim()),
        }, env);
      }
      if (url.pathname === "/v1/ingredients" && request.method === "GET") {
        return json(await ingredientCatalog(env), env, 200, {
          "Cache-Control": "public, max-age=3600",
        });
      }
      if (url.pathname === "/v1/recommendations" && request.method === "POST") {
        const input = await recommendationInput(request);
        return json(await recommendations(input, env, ctx), env);
      }
      if (url.pathname === "/v1/nutrition/fallback" && request.method === "POST") {
        const input = await nutritionFallbackInput(request);
        const key = `nutrition-fallback:v2:${normalize(input.name)}:${normalize(input.measure)}:${input.grams ?? "unknown"}`;
        return json({ estimate: await singleFlight(key, () => fallbackNutrition(input, env)) }, env);
      }
      if (url.pathname === "/v1/usda/search" && request.method === "POST") {
        const query = await usdaSearchInput(request);
        return json({ foods: await cachedUsdaSearch(query, env) }, env);
      }
      if (url.pathname === "/v1/usda/food" && request.method === "POST") {
        const fdcId = await usdaFoodInput(request);
        return json({ food: await cachedUsdaFood(fdcId, env) }, env);
      }
      return json({ error: "Not found." }, env, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected catalog error.";
      return json({ error: message }, env, message.includes("must") ? 400 : 502);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === "37 3 * * *" && env.MEALDB_ENABLE_V2 === "true") {
      ctx.waitUntil(syncLatest(env));
      return;
    }
    ctx.waitUntil(syncNextLetter(env));
  },
};

type UsdaNutrient = {
  nutrientId?: number;
  nutrientName?: string;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
};

type UsdaPortion = {
  amount?: number;
  gramWeight: number;
  portionDescription?: string;
  modifier?: string;
  unitName?: string;
  unitAbbreviation?: string;
};

type UsdaFood = {
  fdcId: number;
  description: string;
  dataType: string;
  publicationDate?: string;
  brandOwner?: string;
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[];
};

class ProviderError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean) {
    super(message);
    this.transient = transient;
  }
}

async function usdaSearchInput(request: Request) {
  const value = await smallJsonObject(request, 4_000);
  const query = typeof value.query === "string" ? normalize(value.query) : "";
  if (!query || query.length > 160) throw new Error("A USDA search query of at most 160 characters is required.");
  return query;
}

async function usdaFoodInput(request: Request) {
  const value = await smallJsonObject(request, 4_000);
  const fdcId = Number(value.fdcId);
  if (!Number.isInteger(fdcId) || fdcId <= 0) throw new Error("A positive USDA FDC ID is required.");
  return fdcId;
}

async function smallJsonObject(request: Request, maximumBytes: number) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > maximumBytes) throw new Error(`The request must be at most ${maximumBytes} bytes.`);
  let value: unknown;
  try { value = await request.json(); }
  catch { throw new Error("A JSON request body is required."); }
  if (!isRecord(value)) throw new Error("A JSON object is required.");
  return value;
}

async function cachedUsdaSearch(query: string, env: Env): Promise<UsdaFood[]> {
  requireUsdaKey(env);
  const key = `usda:search:v4:${query}`;
  const cached = await readApiCache<UsdaFood[]>(key, env);
  if (cached?.status === "fresh") return cached.value;
  try {
    return await singleFlight(key, async () => {
      const payload = await usdaRequest("foods/search", env, {
        method: "POST",
        body: JSON.stringify({
          query,
          dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
          pageSize: 25,
        }),
      });
      const foods = Array.isArray(payload.foods)
        ? payload.foods.filter(isRecord).map(normalizeUsdaFood).filter((food): food is UsdaFood => Boolean(food))
        : [];
      await writeApiCache(
        key,
        foods.length ? "usda-search" : "usda-search-negative",
        foods,
        foods.length ? USDA_SEARCH_FRESH_MS : NEGATIVE_CACHE_MS,
        foods.length ? USDA_SEARCH_STALE_MS : NEGATIVE_CACHE_MS,
        env,
      );
      return foods;
    });
  } catch (error) {
    if (cached && error instanceof ProviderError && error.transient) return cached.value;
    throw error;
  }
}

async function cachedUsdaFood(fdcId: number, env: Env): Promise<UsdaFood | null> {
  requireUsdaKey(env);
  const key = `usda:food:v1:${fdcId}`;
  const cached = await readApiCache<{ food: UsdaFood | null }>(key, env);
  if (cached?.status === "fresh") return cached.value.food;
  try {
    return await singleFlight(key, async () => {
      const payload = await usdaRequest(`food/${fdcId}`, env);
      const food = normalizeUsdaFood(payload);
      await writeApiCache(
        key,
        food ? "usda-food" : "usda-food-negative",
        { food },
        food ? USDA_FOOD_FRESH_MS : NEGATIVE_CACHE_MS,
        food ? USDA_FOOD_STALE_MS : NEGATIVE_CACHE_MS,
        env,
      );
      return food;
    });
  } catch (error) {
    if (cached && error instanceof ProviderError && error.transient) return cached.value.food;
    throw error;
  }
}

function requireUsdaKey(env: Env) {
  const key = env.USDA_FDC_API_KEY?.trim();
  if (!key) throw new Error("USDA_FDC_API_KEY is not configured on the Pickwell Worker.");
  return key;
}

async function usdaRequest(path: string, env: Env, init?: RequestInit) {
  const url = new URL(`https://api.nal.usda.gov/fdc/v1/${path}`);
  url.searchParams.set("api_key", requireUsdaKey(env));
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ProviderError("USDA FoodData Central timed out or encountered a network error.", true);
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    if (response.status === 429) {
      throw new ProviderError(`USDA FoodData Central rate limited the request${retryAfter ? `; retry after ${retryAfter}` : ""}.`, true);
    }
    if (response.status >= 500) throw new ProviderError(`USDA FoodData Central returned HTTP ${response.status}.`, true);
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("The configured USDA FoodData Central API key was rejected.", false);
    }
    if (response.status === 404) return {};
    throw new ProviderError(`USDA FoodData Central returned HTTP ${response.status}.`, false);
  }
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new ProviderError("USDA FoodData Central returned malformed JSON.", true);
  }
}

function normalizeUsdaFood(value: Record<string, unknown>): UsdaFood | null {
  const fdcId = Number(value.fdcId);
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const dataType = typeof value.dataType === "string" ? value.dataType.trim() : "";
  if (!Number.isInteger(fdcId) || !description || !dataType) return null;
  const foodNutrients = Array.isArray(value.foodNutrients)
    ? value.foodNutrients.filter(isRecord).flatMap((item) => {
      const nutrient = isRecord(item.nutrient) ? item.nutrient : {};
      const nutrientId = numeric(item.nutrientId ?? nutrient.id);
      const amount = numeric(item.value ?? item.amount);
      if (nutrientId === null || amount === null) return [];
      return [{
        nutrientId,
        nutrientName: String(item.nutrientName ?? nutrient.name ?? ""),
        nutrientNumber: String(item.nutrientNumber ?? nutrient.number ?? ""),
        unitName: String(item.unitName ?? nutrient.unitName ?? ""),
        value: amount,
      }];
    })
    : [];
  const foodPortions = Array.isArray(value.foodPortions)
    ? value.foodPortions.filter(isRecord).flatMap((portion) => {
      const gramWeight = finitePositive(portion.gramWeight);
      if (gramWeight === null) return [];
      const measureUnit = isRecord(portion.measureUnit) ? portion.measureUnit : {};
      return [{
        amount: finitePositive(portion.amount) ?? undefined,
        gramWeight,
        portionDescription: typeof portion.portionDescription === "string" ? portion.portionDescription : undefined,
        modifier: typeof portion.modifier === "string" ? portion.modifier : undefined,
        unitName: typeof measureUnit.name === "string" ? measureUnit.name : undefined,
        unitAbbreviation: typeof measureUnit.abbreviation === "string" ? measureUnit.abbreviation : undefined,
      }];
    })
    : [];
  return {
    fdcId,
    description,
    dataType,
    publicationDate: typeof value.publicationDate === "string"
      ? value.publicationDate
      : typeof value.publishedDate === "string" ? value.publishedDate : undefined,
    brandOwner: typeof value.brandOwner === "string" ? value.brandOwner : undefined,
    foodNutrients,
    foodPortions,
  };
}

type NutritionFallbackInput = {
  name: string;
  measure: string;
  grams: number | null;
};

type MacroProfile = { calories: number; protein: number; carbs: number; fat: number };

type NutritionFallbackEstimate = {
  provider: "Nutritionix" | "Open Food Facts";
  description: string;
  nutrition: MacroProfile;
  resolvedGrams: number | null;
};

async function nutritionFallbackInput(request: Request): Promise<NutritionFallbackInput> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 8_000) throw new Error("The nutrition fallback request must be at most 8 KB.");
  let value: unknown;
  try { value = await request.json(); }
  catch { throw new Error("A JSON request body is required."); }
  if (!isRecord(value)) throw new Error("A JSON object is required.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const measure = typeof value.measure === "string" ? value.measure.trim() : "";
  const grams = value.grams === null || value.grams === undefined ? null : Number(value.grams);
  if (!name || name.length > 120 || measure.length > 120) throw new Error("A valid ingredient name and measure are required.");
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0 || grams > 100_000)) throw new Error("Ingredient grams must be positive and at most 100000.");
  return { name, measure, grams };
}

async function fallbackNutrition(input: NutritionFallbackInput, env: Env): Promise<NutritionFallbackEstimate | null> {
  if (env.NUTRITIONIX_APP_ID?.trim() && env.NUTRITIONIX_APP_KEY?.trim()) {
    try {
      const estimate = await nutritionixNutrition(input, env);
      if (estimate) return estimate;
    } catch { /* continue to Open Food Facts */ }
  }
  if (input.grams !== null) {
    try { return await openFoodFactsNutrition(input); }
    catch { return null; }
  }
  return null;
}

async function nutritionixNutrition(input: NutritionFallbackInput, env: Env): Promise<NutritionFallbackEstimate | null> {
  const response = await fetch("https://trackapi.nutritionix.com/v2/natural/nutrients", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-app-id": env.NUTRITIONIX_APP_ID!.trim(),
      "x-app-key": env.NUTRITIONIX_APP_KEY!.trim(),
    },
    body: JSON.stringify({ query: `${input.measure} ${input.name}`.trim() }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as Record<string, unknown>;
  const foods = Array.isArray(payload.foods) ? payload.foods.filter(isRecord) : [];
  if (!foods.length) return null;
  const macros = macroProfile({
    calories: sumField(foods, "nf_calories"),
    protein: sumField(foods, "nf_protein"),
    carbs: sumField(foods, "nf_total_carbohydrate"),
    fat: sumField(foods, "nf_total_fat"),
  });
  if (!macros) return null;
  const resolvedGrams = foods.reduce((sum, food) => sum + (finitePositive(food.serving_weight_grams) ?? 0), 0) || null;
  return {
    provider: "Nutritionix",
    description: foods.map((food) => String(food.food_name ?? "")).filter(Boolean).join(", ") || input.name,
    nutrition: macros,
    resolvedGrams,
  };
}

async function openFoodFactsNutrition(input: NutritionFallbackInput): Promise<NutritionFallbackEstimate | null> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", input.name);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("fields", "product_name,generic_name,brands,nutriments");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Pickwell/1.0 (https://pickwell-mobile-web-riyarajagop.zocomputer.io/)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as Record<string, unknown>;
  const products = Array.isArray(payload.products) ? payload.products.filter(isRecord) : [];
  const terms = meaningfulTerms(input.name);
  const candidates = products.flatMap((product) => {
    const label = [product.generic_name, product.product_name, product.brands].filter((value) => typeof value === "string").join(" ");
    const normalizedLabel = normalize(label);
    const overlap = terms.filter((term) => normalizedLabel.includes(term)).length;
    if (!terms.length || overlap < Math.max(1, Math.ceil(terms.length * 0.75))) return [];
    const nutrients = isRecord(product.nutriments) ? product.nutriments : {};
    const per100g = macroProfile({
      calories: numeric(nutrients["energy-kcal_100g"]),
      protein: numeric(nutrients.proteins_100g),
      carbs: numeric(nutrients.carbohydrates_100g),
      fat: numeric(nutrients.fat_100g),
    });
    if (!per100g) return [];
    return [{
      product,
      label,
      per100g,
      score: overlap * 10 + (normalize(String(product.generic_name ?? product.product_name ?? "")) === normalize(input.name) ? 20 : 0),
    }];
  }).sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  if (!selected || input.grams === null) return null;
  const multiplier = input.grams / 100;
  return {
    provider: "Open Food Facts",
    description: String(selected.product.generic_name ?? selected.product.product_name ?? selected.label),
    nutrition: {
      calories: selected.per100g.calories * multiplier,
      protein: selected.per100g.protein * multiplier,
      carbs: selected.per100g.carbs * multiplier,
      fat: selected.per100g.fat * multiplier,
    },
    resolvedGrams: input.grams,
  };
}

function macroProfile(value: Record<keyof MacroProfile, number | null>): MacroProfile | null {
  return Object.values(value).every((amount) => amount !== null && Number.isFinite(amount) && amount >= 0) ? value as MacroProfile : null;
}

function sumField(items: Record<string, unknown>[], field: string) {
  const values = items.map((item) => numeric(item[field]));
  return values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
}

function finitePositive(value: unknown) {
  const amount = numeric(value);
  return amount !== null && amount > 0 ? amount : null;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function meaningfulTerms(value: string) {
  return normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !["fresh", "chopped", "sliced", "diced"].includes(term));
}

type RecommendationInput = {
  likes: string[];
  seenIds: string[];
  upIds: string[];
  downIds: string[];
  cursor: number;
};

async function recommendationInput(request: Request): Promise<RecommendationInput> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 32_000) throw new Error("The recommendation request must be at most 32 KB.");
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error("A JSON request body is required.");
  }
  if (!isRecord(value)) throw new Error("A JSON object is required.");
  const likes = stringList(value.likes, 10);
  const seenIds = stringList(value.seenIds, 80).map(normalizeMealId).filter(isMealId);
  const upIds = stringList(value.upIds, 80).map(normalizeMealId).filter(isMealId);
  const downIds = stringList(value.downIds, 80).map(normalizeMealId).filter(isMealId);
  const cursor = typeof value.cursor === "number" && Number.isInteger(value.cursor)
    ? Math.max(0, Math.min(value.cursor, 10_000))
    : 0;
  return { likes, seenIds, upIds, downIds, cursor };
}

async function recommendations(input: RecommendationInput, env: Env, ctx: ExecutionContext) {
  const normalizedLikes = input.likes
    .map(normalize)
    .filter((item) => item && !IGNORED_PREFERENCES.has(item))
    .map((item) => INGREDIENT_ALIASES[item] ?? item)
    .slice(0, 5);
  const queries = normalizedLikes.length ? normalizedLikes : DEFAULT_INGREDIENTS;
  let candidateIds = await profileCandidateIds(queries, env);
  if (!candidateIds.length && normalizedLikes.length) {
    candidateIds = await profileCandidateIds(DEFAULT_INGREDIENTS, env);
  }
  if (!candidateIds.length) throw new Error("TheMealDB returned no recipe candidates.");

  const excluded = new Set([...input.seenIds, ...input.downIds]);
  const cachedCandidates = await readMeals(candidateIds, env);
  const freshCandidateMeals: RawMeal[] = [];
  const staleCandidateMeals: RawMeal[] = [];
  const missingIds: string[] = [];
  for (const id of candidateIds) {
    if (excluded.has(id)) continue;
    const cached = cachedCandidates.get(id);
    if (!cached) missingIds.push(id);
    else if (cached.status === "fresh") freshCandidateMeals.push(cached.value);
    else staleCandidateMeals.push(cached.value);
  }

  const usableCached = [...freshCandidateMeals, ...staleCandidateMeals].filter(isRecommendationMeal);
  const hydrateCount = Math.min(
    MAX_HYDRATIONS_PER_REQUEST,
    Math.max(0, RESULT_LIMIT - usableCached.length),
    missingIds.length,
  );
  const orderedMisses = deterministicOrder(
    missingIds,
    `${stableProfileKey(queries)}:${input.cursor}`,
  ).slice(0, hydrateCount);
  const hydrated = await mapLimit(orderedMisses, 4, async (id) => {
    try {
      return await fetchMeal(id, env);
    } catch {
      return null;
    }
  });
  const hydratedMeals = hydrated.filter((meal): meal is RawMeal => Boolean(meal));
  if (hydratedMeals.length) await writeMeals(hydratedMeals, env);

  if (staleCandidateMeals.length) {
    ctx.waitUntil(refreshMeals(staleCandidateMeals.map((meal) => meal.idMeal), env));
  }

  const matchedMeals = [...usableCached, ...hydratedMeals];
  const explorationMeals = await explorationCatalog(
    new Set(candidateIds),
    new Set([...input.seenIds, ...input.downIds]),
    env,
  );
  const items = selectRecommendationWindow(matchedMeals, explorationMeals, {
    ...input,
    likes: queries,
    limit: RESULT_LIMIT,
  });
  if (!items.length) throw new Error("No eligible recipes were available for this profile.");

  return {
    items,
    nextCursor: input.cursor + 1,
    hasMore: candidateIds.some((id) => !excluded.has(id) && !items.some((meal) => meal.idMeal === id)),
    meta: {
      catalogCandidates: candidateIds.length,
      returned: items.length,
      hydrated: hydratedMeals.length,
      freshCacheHits: freshCandidateMeals.length,
      staleCacheHits: staleCandidateMeals.length,
      exploration: items.filter((meal) => !candidateIds.includes(meal.idMeal)).length,
    },
  };
}

async function profileCandidateIds(queries: string[], env: Env) {
  const profileKey = stableProfileKey(queries);
  const cachedProfile = await readCache<string[]>(profileKey, env);
  if (cachedProfile?.status === "fresh") return cachedProfile.value;

  const ingredientSpecs = queries.map((value) => ({
    key: `mealdb:filter:v1:ingredient:${normalize(value).replace(/\s+/g, "_")}`,
    namespace: "mealdb-filter",
    endpoint: "filter.php",
    params: { i: value.replace(/\s+/g, "_") },
  }));
  const excludedSpecs = EXCLUDED_CATEGORIES.map((value) => ({
    key: `mealdb:filter:v1:category:${normalize(value)}`,
    namespace: "mealdb-filter",
    endpoint: "filter.php",
    params: { c: value },
  }));
  try {
    const filterResults = await filterIdLists([...ingredientSpecs, ...excludedSpecs], env);
    const ingredientResults = filterResults.slice(0, ingredientSpecs.length);
    const excludedResults = filterResults.slice(ingredientSpecs.length);
    const excluded = new Set(excludedResults.flat());
    const ids = [...new Set(ingredientResults.flat())].filter((id) => !excluded.has(id));
    if (ids.length) {
      await writeCache(profileKey, "recommendation-profile", ids, PROFILE_FRESH_MS, PROFILE_STALE_MS, env);
    } else if (cachedProfile) {
      return cachedProfile.value;
    }
    return ids;
  } catch (error) {
    if (cachedProfile) return cachedProfile.value;
    throw error;
  }
}

type FilterSpec = {
  key: string;
  namespace: string;
  endpoint: string;
  params: Record<string, string>;
};

async function filterIdLists(specs: FilterSpec[], env: Env) {
  const cached = await readCaches<string[]>(specs.map((spec) => spec.key), env);
  return mapLimit(specs, 4, async (spec) => {
    const hit = cached.get(spec.key);
    if (hit?.status === "fresh") return hit.value;
    try {
      return await singleFlight(spec.key, async () => {
        const data = await mealDbRequest<MealSummary>(spec.endpoint, spec.params, env);
        const ids = (data.meals ?? [])
          .map((meal) => String(meal.idMeal ?? ""))
          .filter(isMealId);
        await writeCache(spec.key, spec.namespace, ids, FILTER_FRESH_MS, FILTER_STALE_MS, env);
        return ids;
      });
    } catch (error) {
      if (hit) return hit.value;
      return [];
    }
  });
}

async function ingredientCatalog(env: Env) {
  const key = "mealdb:list:v1:ingredients";
  const cached = await readCache<Array<{ id: string; name: string; description?: string }>>(key, env);
  if (cached?.status === "fresh") {
    return { items: cached.value, cacheStatus: "fresh" };
  }
  try {
    const items = await singleFlight(key, async () => {
      const data = await mealDbRequest<Record<string, string | null>>("list.php", { i: "list" }, env);
      const unique = new Map<string, { id: string; name: string; description?: string }>();
      for (const item of data.meals ?? []) {
        const name = item.strIngredient?.trim();
        if (!name) continue;
        unique.set(normalize(name), {
          id: normalize(name),
          name,
          ...(item.strDescription?.trim() ? { description: item.strDescription.trim() } : {}),
        });
      }
      const normalized = [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
      await writeCache(key, "mealdb-list", normalized, INGREDIENT_FRESH_MS, INGREDIENT_STALE_MS, env);
      return normalized;
    });
    return { items, cacheStatus: "refreshed" };
  } catch (error) {
    if (cached) return { items: cached.value, cacheStatus: "stale" };
    throw error;
  }
}

async function explorationCatalog(candidateIds: Set<string>, excludedIds: Set<string>, env: Env) {
  try {
    const result = await env.DB.prepare(
      `SELECT payload FROM mealdb_meals
       WHERE stale_until > ?
       ORDER BY fetched_at DESC
       LIMIT 400`,
    ).bind(Date.now()).all<{ payload: string }>();
    return result.results
      .map((row) => parseJson<RawMeal>(row.payload))
      .filter((meal): meal is RawMeal => Boolean(meal))
      .filter((meal) => !candidateIds.has(meal.idMeal) && !excludedIds.has(meal.idMeal))
      .filter(isRecommendationMeal);
  } catch {
    return [];
  }
}

async function readMeals(ids: string[], env: Env) {
  const output = new Map<string, Cached<RawMeal>>();
  const now = Date.now();
  for (const chunk of chunks([...new Set(ids)], 80)) {
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => "?").join(",");
    try {
      const result = await env.DB.prepare(
        `SELECT meal_id, payload, fetched_at, fresh_until, stale_until
         FROM mealdb_meals
         WHERE meal_id IN (${placeholders}) AND stale_until > ?`,
      ).bind(...chunk, now).all<MealRow>();
      for (const row of result.results) {
        const meal = parseJson<RawMeal>(row.payload);
        if (!meal) continue;
        output.set(row.meal_id, {
          value: meal,
          status: row.fresh_until > now ? "fresh" : "stale",
          fetchedAt: row.fetched_at,
        });
      }
    } catch {
      // A provider fallback can still satisfy a request if D1 is temporarily unavailable.
    }
  }
  return output;
}

async function writeMeals(meals: RawMeal[], env: Env) {
  const now = Date.now();
  const statement = env.DB.prepare(
    `INSERT INTO mealdb_meals (
       meal_id, name, category, area, image_url, payload, fetched_at, fresh_until, stale_until
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(meal_id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       area = excluded.area,
       image_url = excluded.image_url,
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       fresh_until = excluded.fresh_until,
       stale_until = excluded.stale_until`,
  );
  for (const chunk of chunks(meals, 40)) {
    try {
      await env.DB.batch(chunk.map((meal) => statement.bind(
        meal.idMeal,
        meal.strMeal,
        meal.strCategory ?? null,
        meal.strArea ?? null,
        meal.strMealThumb ?? null,
        JSON.stringify(meal),
        now,
        now + MEAL_FRESH_MS,
        now + MEAL_STALE_MS,
      )));
    } catch {
      // A successful provider response remains usable even if a cache write fails.
    }
  }
}

async function fetchMeal(id: string, env: Env) {
  return singleFlight(`meal:${id}`, async () => {
    const data = await mealDbRequest<RawMeal>("lookup.php", { i: id }, env);
    const meal = data.meals?.[0];
    if (!meal?.idMeal) throw new Error(`MealDB meal ${id} was not found.`);
    return meal;
  });
}

async function refreshMeals(ids: string[], env: Env) {
  const refreshed = await mapLimit([...new Set(ids)], 3, async (id) => {
    try {
      return await fetchMeal(id, env);
    } catch {
      return null;
    }
  });
  const meals = refreshed.filter((meal): meal is RawMeal => Boolean(meal));
  if (meals.length) await writeMeals(meals, env);
}

async function syncNextLetter(env: Env) {
  const state = await env.DB.prepare(
    "SELECT value FROM mealdb_sync_state WHERE key = ?",
  ).bind("alphabet-cursor").first<{ value: string }>();
  const current = /^[a-z]$/.test(state?.value ?? "") ? state!.value : "a";
  const data = await mealDbRequest<RawMeal>("search.php", { f: current }, env);
  const meals = (data.meals ?? []).filter((meal) => meal.idMeal);
  if (meals.length) await writeMeals(meals, env);
  const next = current === "z" ? "a" : String.fromCharCode(current.charCodeAt(0) + 1);
  await env.DB.prepare(
    `INSERT INTO mealdb_sync_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind("alphabet-cursor", next, Date.now()).run();
}

async function syncLatest(env: Env) {
  const data = await mealDbRequest<RawMeal>("latest.php", {}, env, 2);
  const meals = (data.meals ?? []).filter((meal) => meal.idMeal);
  if (meals.length) await writeMeals(meals, env);
  await env.DB.prepare(
    `INSERT INTO mealdb_sync_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind("latest-sync", new Date().toISOString(), Date.now()).run();
}

async function mealDbRequest<T>(
  endpoint: string,
  params: Record<string, string>,
  env: Env,
  version = 1,
): Promise<MealDbResponse<T>> {
  const key = env.MEALDB_API_KEY?.trim() || "1";
  const url = new URL(`https://www.themealdb.com/api/json/v${version}/${encodeURIComponent(key)}/${endpoint}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("TheMealDB request timed out or encountered a network error.");
  }
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(`TheMealDB rate limited the catalog${retryAfter ? `; retry after ${retryAfter}` : ""}.`);
    }
    throw new Error(`TheMealDB returned HTTP ${response.status}.`);
  }
  try {
    return await response.json() as MealDbResponse<T>;
  } catch {
    throw new Error("TheMealDB returned malformed JSON.");
  }
}

async function readCache<T>(key: string, env: Env) {
  const hits = await readCaches<T>([key], env);
  return hits.get(key);
}

async function readApiCache<T>(key: string, env: Env): Promise<Cached<T> | undefined> {
  const now = Date.now();
  try {
    const row = await env.DB.prepare(
      `SELECT key, namespace, payload, fetched_at, fresh_until, stale_until
       FROM api_cache
       WHERE key = ? AND stale_until > ?`,
    ).bind(key, now).first<CacheRow>();
    if (!row) return undefined;
    const value = parseJson<T>(row.payload);
    if (value === null) return undefined;
    return {
      value,
      status: row.fresh_until > now ? "fresh" : "stale",
      fetchedAt: row.fetched_at,
    };
  } catch {
    return undefined;
  }
}

async function writeApiCache(
  key: string,
  namespace: string,
  value: unknown,
  freshMs: number,
  staleMs: number,
  env: Env,
) {
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO api_cache (key, namespace, payload, fetched_at, fresh_until, stale_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         namespace = excluded.namespace,
         payload = excluded.payload,
         fetched_at = excluded.fetched_at,
         fresh_until = excluded.fresh_until,
         stale_until = excluded.stale_until`,
    ).bind(key, namespace, JSON.stringify(value), now, now + freshMs, now + staleMs).run();
  } catch {
    // The provider response remains usable when the durable cache is unavailable.
  }
}

async function readCaches<T>(keys: string[], env: Env) {
  const output = new Map<string, Cached<T>>();
  if (!keys.length) return output;
  const now = Date.now();
  const placeholders = keys.map(() => "?").join(",");
  try {
    const result = await env.DB.prepare(
      `SELECT key, namespace, payload, fetched_at, fresh_until, stale_until
       FROM mealdb_cache
       WHERE key IN (${placeholders}) AND stale_until > ?`,
    ).bind(...keys, now).all<CacheRow>();
    for (const row of result.results) {
      const value = parseJson<T>(row.payload);
      if (value === null) continue;
      output.set(row.key, {
        value,
        status: row.fresh_until > now ? "fresh" : "stale",
        fetchedAt: row.fetched_at,
      });
    }
  } catch {
    // Treat D1 read failures as misses and use the provider path.
  }
  return output;
}

async function writeCache(
  key: string,
  namespace: string,
  value: unknown,
  freshMs: number,
  staleMs: number,
  env: Env,
) {
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO mealdb_cache (key, namespace, payload, fetched_at, fresh_until, stale_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         namespace = excluded.namespace,
         payload = excluded.payload,
         fetched_at = excluded.fetched_at,
         fresh_until = excluded.fresh_until,
         stale_until = excluded.stale_until`,
    ).bind(key, namespace, JSON.stringify(value), now, now + freshMs, now + staleMs).run();
  } catch {
    // Cache write failures should not corrupt successful provider responses.
  }
}

async function singleFlight<T>(key: string, operation: () => Promise<T>) {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = operation().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

async function mapLimit<T, U>(items: T[], limit: number, operation: (item: T) => Promise<U>) {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  }));
  return results;
}

function stringList(value: unknown, limit: number) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("List fields must be arrays.");
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => Boolean(item) && item.length <= 120)
    .slice(0, limit);
}

function isMealId(value: string) {
  return /^\d+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function json(body: unknown, env: Env, status = 200, headers?: Record<string, string>) {
  return withCors(Response.json(body, { status, headers }), env);
}

function withCors(response: Response, env: Env) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", env.CORS_ORIGIN?.trim() || "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
