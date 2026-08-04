import { pickwellCatalogApiUrl } from "./catalogApi.ts";
import type { FdcFood } from "./nutritionEstimator.ts";

export type USDAFood = {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
};

export async function searchUSDAFoods(query: string): Promise<USDAFood[]> {
  const foods = await searchUSDANutritionFoods(query);
  return foods.slice(0, 15);
}

export async function searchUSDANutritionFoods(query: string): Promise<FdcFood[]> {
  const endpoint = pickwellCatalogApiUrl("/v1/usda/search");
  if (!endpoint) {
    throw new Error("USDA search requires the Pickwell Worker. Configure EXPO_PUBLIC_PICKWELL_API_URL.");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const detail = await errorMessage(response);
    throw new Error(detail || `USDA search failed (${response.status}).`);
  }
  const data = await response.json() as { foods?: FdcFood[] };
  return data.foods ?? [];
}

export async function getUSDAFood(fdcId: number): Promise<FdcFood | null> {
  const endpoint = pickwellCatalogApiUrl("/v1/usda/food");
  if (!endpoint) {
    throw new Error("USDA food details require the Pickwell Worker. Configure EXPO_PUBLIC_PICKWELL_API_URL.");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ fdcId }),
  });
  if (!response.ok) {
    const detail = await errorMessage(response);
    throw new Error(detail || `USDA food lookup failed (${response.status}).`);
  }
  const data = await response.json() as { food?: FdcFood | null };
  return data.food ?? null;
}

async function errorMessage(response: Response) {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error ?? "";
  } catch {
    return "";
  }
}
