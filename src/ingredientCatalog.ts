import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickwellCatalogApiUrl } from "./catalogApi";

export type CatalogIngredient = {
  id: string;
  name: string;
  description?: string;
};

type MealDbIngredient = {
  idIngredient?: string;
  strIngredient?: string;
  strDescription?: string | null;
};

type MealDbResponse = {
  meals?: MealDbIngredient[] | null;
  items?: CatalogIngredient[];
};

const endpoint = "https://www.themealdb.com/api/json/v1/1/list.php?i=list";
const cacheKey = "pickwell-ingredient-catalog-v1";

function normalize(items: MealDbIngredient[]): CatalogIngredient[] {
  const unique = new Map<string, CatalogIngredient>();
  items.forEach((item) => {
    const name = item.strIngredient?.trim();
    if (!name) return;
    const id = name.toLocaleLowerCase();
    unique.set(id, {
      id,
      name,
      description: item.strDescription?.trim() || undefined,
    });
  });
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadIngredientCatalog(): Promise<{ items: CatalogIngredient[]; source: "shared" | "live" | "cache" }> {
  const cached = await AsyncStorage.getItem(cacheKey);
  let cachedItems: CatalogIngredient[] = [];
  if (cached) {
    try { cachedItems = JSON.parse(cached) as CatalogIngredient[]; }
    catch { /* ignore a damaged cache */ }
  }

  try {
    const sharedEndpoint = pickwellCatalogApiUrl("/v1/ingredients");
    const response = await fetch(sharedEndpoint ?? endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Ingredient library request failed (${response.status}).`);
    const data = await response.json() as MealDbResponse;
    const items = data.items?.length ? normalizeCatalogItems(data.items) : normalize(data.meals ?? []);
    if (!items.length) throw new Error("The ingredient library returned no ingredients.");
    await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
    return { items, source: sharedEndpoint ? "shared" : "live" };
  } catch (error) {
    const sharedEndpoint = pickwellCatalogApiUrl("/v1/ingredients");
    if (sharedEndpoint) {
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Ingredient library request failed (${response.status}).`);
        const data = await response.json() as MealDbResponse;
        const items = normalize(data.meals ?? []);
        if (!items.length) throw new Error("The ingredient library returned no ingredients.");
        await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
        return { items, source: "live" };
      } catch {
        // Fall through to the device copy when both sources are unavailable.
      }
    }
    if (cachedItems.length) return { items: cachedItems, source: "cache" };
    throw error;
  }
}

function normalizeCatalogItems(items: CatalogIngredient[]) {
  const unique = new Map<string, CatalogIngredient>();
  for (const item of items) {
    const name = item.name?.trim();
    if (!name) continue;
    unique.set(name.toLocaleLowerCase(), {
      id: name.toLocaleLowerCase(),
      name,
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
    });
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}
