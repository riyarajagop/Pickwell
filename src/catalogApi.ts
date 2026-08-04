export function pickwellCatalogApiUrl(path: string) {
  const base = process.env.EXPO_PUBLIC_PICKWELL_API_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function mealDbId(value: string) {
  return value.replace(/^mealdb-/, "").trim();
}
