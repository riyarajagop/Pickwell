---
name: filter-mealdb-meals
description: Distinguish complete meals from desserts and other non-meal courses in TheMealDB recipe data, then enforce meal-only candidate retrieval and taste-profile ranking in Pickwell. Use when Codex implements, audits, tests, or debugs TheMealDB-backed recommendations; changes `strCategory` handling; sees desserts, sides, or starters in the Today feed; or updates the reviewed meal-category policy.
---

# Filter MealDB Meals

Keep course classification separate from taste matching. A recipe must first qualify as a complete meal; only then may likes, dislikes, restrictions, dietary preferences, or ratings affect its rank.

Read [references/classification-policy.md](references/classification-policy.md) before changing category rules or tests.

## Enforce the recommendation boundary

1. Normalize `strCategory` by trimming and lowercasing it.
2. Classify exact reviewed categories with `classifyMealDbCourse` in `src/mealClassifier.ts`.
3. Exclude `Dessert`, `Side`, and `Starter` summary IDs before hydrating full recipe details.
4. Re-check the full record with `isMealDbMealRecommendation` before converting or ranking it.
5. Fail closed when `strCategory` is missing or unknown. Review new upstream categories before allowing them.
6. Fall back to Pickwell's neutral savory ingredient queries only when a user's ingredient search produces no eligible meals. Never relax dislikes, restrictions, or dietary filters.

## Preserve taste-profile behavior

- Apply the course filter before taste scoring. A high like-match score must never rescue a dessert or unknown course.
- Keep ingredient likes as positive ranking signals after eligibility is established.
- Keep dislikes, restrictions, vegetarian, vegan, halal-compatible, and kosher-compatible filters as hard constraints.
- Do not use TheMealDB metadata as an allergen, dietary-safety, medical, or cooking-safety guarantee.

## Avoid heuristic classification

Do not infer dessert status from recipe names, ingredients, images, calories, or instructions. Keyword rules create false positives for savory foods such as crab cakes and meat pies. Use TheMealDB's explicit category and an auditable allowlist.

## Verify changes

Run from the mobile directory:

```bash
npm test
npm run typecheck
```

Add regression cases for every category policy change. Include dessert, side, starter, known meal, missing category, and unknown category coverage.
