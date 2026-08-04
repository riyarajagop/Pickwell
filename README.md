# Pickwell mobile

The React Native/Expo version of Pickwell for iPhone and Android. Preferences,
recently shown meals, saved meals, ratings, and nutrition history remain private
on the device in AsyncStorage.

Pickwell bundles a generated local MealDB recipe catalog. The Today screen reads
that snapshot directly, returns profile-safe windows of 18 meals, and does not
contact MealDB while the app is running. The optional Cloudflare Worker remains
available for shared ingredient-catalog maintenance.

## Run it on a phone

1. Install Node.js LTS on the computer.
2. Install **Expo Go** on the iPhone or Android phone.
3. Open a terminal in this `mobile` folder.
4. Run `npm install` once. Do not mix npm and pnpm in this folder.
5. To use the shared catalog locally, complete **Run the shared catalog locally**
   below. To use the direct fallback, no backend setup is required.
6. Run `npx expo start --clear`.
7. Scan the displayed QR code with the phone. On iPhone, use the Camera app; on Android, use Expo Go’s scanner.

The phone and computer should be on the same Wi-Fi network. If that fails, run `npx expo start --tunnel` instead.

If this folder was previously installed with another package manager, remove `node_modules`, `pnpm-lock.yaml`, and `package-lock.json` before running `npm install` again.

## Run it in a simulator

- iPhone Simulator on a Mac: install Xcode, then run `npm run ios`.
- Android emulator: install Android Studio and an emulator, then run `npm run android`.

Expo Go is the simplest first option and does not require either simulator.

## Project structure

- `App.tsx`: mobile interface and local application state
- `src/recipes.ts`: shared recipe data types and legacy prototype fixtures (not used by the recommendation screen)
- `src/data/mealdb-catalog.json`: generated local MealDB recipe dictionary
- `src/mealDbRecipes.ts`: local recipe-catalog adapter and USDA estimate adapter
- `src/recommendationCatalog.ts`: hard profile filters and unseen 18-recipe window selection
- `src/ingredientCatalog.ts`: TheMealDB ingredient catalog loader and on-device cache
- `src/foodDataCentral.ts`: USDA FoodData Central search adapter
- `worker/src/index.ts`: Cloudflare Worker API, D1 cache-aside catalog, and scheduled synchronizer
- `worker/schema.sql`: D1 tables and indexes
- `worker/wrangler.jsonc`: local/deployed Worker bindings and Cron Triggers

## Run the shared catalog locally

Install dependencies, initialize the local D1 database, and start the Worker:

```bash
npm install
cp worker/.dev.vars.example worker/.dev.vars
npm run backend:db:local
npm run backend:dev
```

Leave the Worker running. In a second terminal, copy `.env.example` to `.env`
and start Expo:

```bash
cp .env.example .env
npx expo start --clear
```

`127.0.0.1` works for the web or an emulator configured to reach the host. A
physical phone must use the computer's LAN IP in
`EXPO_PUBLIC_PICKWELL_API_URL`, because `127.0.0.1` on the phone means the
phone itself. The development Worker listens on the local network so a phone
can reach it; use that mode only on a network you trust.

The Today screen labels bundled recipe recommendations as **LOCAL CATALOG**.

## Deploy the shared catalog

1. Authenticate Wrangler with the desired Cloudflare account.
2. Create the production database:

   ```bash
   npx wrangler d1 create pickwell-catalog
   ```

3. Replace the all-zero `database_id` in `worker/wrangler.jsonc` with the ID
   returned by Cloudflare.
4. Apply the production schema:

   ```bash
   npx wrangler d1 execute pickwell-catalog --remote --config worker/wrangler.jsonc --file worker/schema.sql
   ```

5. Store the MealDB key and your USDA FoodData Central key as Worker secrets:

   ```bash
   npx wrangler secret put MEALDB_API_KEY --config worker/wrangler.jsonc
   npx wrangler secret put USDA_FDC_API_KEY --config worker/wrangler.jsonc
   ```

6. If that is a supporter key, change `MEALDB_ENABLE_V2` to `true`.
7. Deploy:

   ```bash
   npm run backend:deploy
   ```

8. Set `EXPO_PUBLIC_PICKWELL_API_URL` to the deployed Worker URL when starting
   or building Expo. Never put the supporter key in an `EXPO_PUBLIC_*`
   variable; only the Worker URL belongs in the mobile bundle.

The Worker processes one MealDB starting letter every six hours, so a new
catalog completes its first A–Z pass in about one week without a request burst.
With V2 enabled, it also imports the latest meals daily. Recommendation requests
populate missing profile recipes immediately, so the app does not need to wait
for the first full sweep.

## Shared catalog behavior

- Ingredient filter results are fresh for 3 days and may be served stale for
  up to 30 days during a transient provider failure.
- Full recipes are fresh for 14 days and may be served stale for up to 90 days.
- Profile candidate-ID sets are fresh for 1 day and stale for 7 days.
- Each response contains at most 18 recipes even though D1 can hold hundreds.
- Up to three places in a full window are reserved for category/area exploration
  from the synchronized catalog.
- The phone sends only recent MealDB IDs and rating IDs for rotation. It does
  not upload the user's profile, saves, ratings, or meal log for persistence.
- Allergy and dietary screening still runs on the device and is never relaxed.
  MealDB metadata is not a dietary-safety or allergy guarantee.

## Ingredient library

The Taste tab loads the ingredient list from the shared Worker when configured,
then falls back to TheMealDB and finally the AsyncStorage copy. No key is stored
in the mobile app.

The starter ingredient groups are still bundled with the app. TheMealDB expands the searchable preference list; USDA search remains available for more specific prepared and branded foods. Ingredient-library choices are stored locally with the rest of the user's preferences.

The complete TheMealDB catalog is displayed alphabetically in pages of 30. Previous and Next move through every page. Search filters the complete catalog and paginates matching results without losing selections. The app remembers the user's separate full-catalog page, so clearing a search returns them to the page they were browsing.

## Dietary filters

The Taste tab includes vegetarian, vegan, Halal-compatible, and Kosher-compatible filters. They are deterministic filters applied before recipe ranking. Halal-compatible and Kosher-compatible are recipe-level screening labels, not certification: users still need to verify packaged ingredients, meat sourcing, preparation equipment, and the standards they follow.

If AI ranking is added later, these dietary and allergy filters must remain outside the AI model and must never be relaxed by it.

## Preference matching

Each recipe has canonical ingredient IDs that connect it to the Taste tab. Changing a preference immediately recomputes the recommendations: restrictions and dislikes remove matching recipes, likes raise the score of matching recipes, and unselected ingredients remain neutral. The app also resets the recommendation carousel to the strongest current match after a profile change.

Broad selectable foods such as `fish`, `berries`, `fruit`, `beans`, and `tree nut` were retired because they can create inaccurate preference assumptions. The starter list uses specific foods such as salmon, tuna, strawberries, blueberries, black beans, chickpeas, almonds, and cashews. Users can search TheMealDB for additional specific ingredients.

## Real recipes and estimated nutrition

The Today tab selects rotating windows of up to 18 real recipes from the bundled
catalog. “Refresh all 18 meals” excludes the entire current window plus recently
shown and down-rated IDs before selecting replacements. Every recipe is checked
against the reviewed MealDB meal-category allowlist, then dislikes, restrictions,
dietary filters, ratings, and local taste ranking are applied on the device. If
fewer than 18 unseen matches remain, Pickwell shows only those matches and never
relaxes a restriction to fill the list.

Nutrition is estimated only for the currently displayed recipe. Pickwell evaluates every measured MealDB ingredient, normalizes common MealDB quantity formats, converts each quantity with ingredient-aware gram assumptions, ranks non-branded USDA FoodData Central candidates, fetches the selected FDC detail record, and uses matching USDA `foodPortions` when local conversion rules are insufficient. It totals both whole-recipe and per-serving macros. A stated recipe yield such as `Serves 4` takes precedence; otherwise non-dessert servings are estimated from measured recipe weight. Ingredient nutrient matches are cached and reused under a versioned cache key.

When USDA cannot provide a complete match, Pickwell asks the configured Worker to try Nutritionix and then Open Food Facts. If the Worker is not configured, the app can still try Open Food Facts directly for an ingredient whose gram weight is known. If every provider misses an ingredient, Pickwell totals the ingredients it could estimate and names each omitted ingredient directly below the result. Provider names and ingredient coverage remain visible; a partial estimate must not be presented as a complete recipe total.

Nutritionix requires an account, credentials, visible attribution, and compliance with its current commercial terms; do not assume that production use or response caching is free. Keep its credentials in Worker secrets, never in `EXPO_PUBLIC_*` variables:

```bash
npx wrangler secret put NUTRITIONIX_APP_ID --config worker/wrangler.jsonc
npx wrangler secret put NUTRITIONIX_APP_KEY --config worker/wrangler.jsonc
```

Nutritionix may be omitted; the Worker skips it when credentials are absent. Open Food Facts is open data but crowd-sourced and product-oriented, so Pickwell requires a strong name match and complete per-100-g macros before using it.

The UI labels these values as estimates per serving, also displays the whole-recipe estimate, shows a high/medium/low ingredient-coverage confidence label, and lets the user correct the serving count before logging. Volume conversions, item-count weights, absorbed frying oil, unmatched ingredients, and TheMealDB's missing serving counts make the result unsuitable for medical use.

## USDA food search and API limits

The Taste tab and recipe estimator search USDA FoodData Central through the Pickwell Worker. The mobile app does not contain a USDA key and no longer falls back to USDA's public `DEMO_KEY`.

Request a personal data.gov API key. For local Worker development, copy
`worker/.dev.vars.example` to `worker/.dev.vars` and set:

```bash
USDA_FDC_API_KEY=your-personal-key
```

For the deployed Worker, store the same value with:

```bash
npx wrangler secret put USDA_FDC_API_KEY --config worker/wrangler.jsonc
```

Never put this key in an `EXPO_PUBLIC_*` variable; Expo embeds those values in
the app bundle. USDA canonical-query searches are cached for 60 days and their
stale results remain usable for up to 180 days during transient provider
failures. Full FDC nutrient and portion details are fresh for 90 days and stale
for 180 days. Repeated concurrent requests share one upstream request.

After configuring and starting the Worker, optionally warm and bundle the
ingredient-level USDA cache for the static MealDB catalog:

```bash
PICKWELL_API_URL=http://127.0.0.1:8787 npm run nutrition:precompute
```

This writes normalized USDA matches, nutrients, portions, FDC IDs, descriptions,
and publication dates to `src/data/usda-nutrition-cache.json`; it never writes
the API key. The command checkpoints every 25 canonical ingredient queries, so
it can resume without repeating completed lookups.

The Today screen no longer uses the original AI-assisted recipe fixtures. Those fixtures remain in `src/recipes.ts` only as legacy development data while the shared `Recipe` type is still defined there.

## Later: publish to app stores

Expo Go is for development. Shipping through the Apple App Store or Google Play requires a signed production build, store accounts, privacy disclosures, tested icons/screenshots, and additional safety review for the nutrition features.
