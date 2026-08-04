CREATE TABLE IF NOT EXISTS mealdb_meals (
  meal_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  area TEXT,
  image_url TEXT,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  fresh_until INTEGER NOT NULL,
  stale_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mealdb_meals_category
ON mealdb_meals(category);

CREATE INDEX IF NOT EXISTS mealdb_meals_area
ON mealdb_meals(area);

CREATE INDEX IF NOT EXISTS mealdb_meals_stale_until
ON mealdb_meals(stale_until);

CREATE TABLE IF NOT EXISTS mealdb_cache (
  key TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  fresh_until INTEGER NOT NULL,
  stale_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mealdb_cache_namespace
ON mealdb_cache(namespace);

CREATE INDEX IF NOT EXISTS mealdb_cache_stale_until
ON mealdb_cache(stale_until);

CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  fresh_until INTEGER NOT NULL,
  stale_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS api_cache_namespace
ON api_cache(namespace);

CREATE INDEX IF NOT EXISTS api_cache_stale_until
ON api_cache(stale_until);

CREATE TABLE IF NOT EXISTS mealdb_sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
