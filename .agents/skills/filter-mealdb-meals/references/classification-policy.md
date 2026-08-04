# TheMealDB recommendation classification policy

## Decision table

| Normalized `strCategory` | Classification | Recommend? |
| --- | --- | --- |
| `dessert` | Dessert | No |
| `side`, `starter` | Non-meal course | No |
| `beef`, `breakfast`, `chicken`, `goat`, `lamb`, `miscellaneous`, `pasta`, `pork`, `seafood`, `vegan`, `vegetarian` | Meal | Yes |
| Missing or any other value | Unknown | No, pending review |

## Invariants

- Perform eligibility classification before taste scoring.
- Prefilter excluded category IDs to avoid unnecessary detail requests.
- Re-check hydrated full records because summary prefilter requests may fail and cached records may outlive policy changes.
- Treat upstream category text as crowd-sourced routing metadata, not a safety certification.
- Keep the allowlist synchronized with tests and `src/mealClassifier.ts`.

## Review procedure for a new category

1. Inspect representative full records from TheMealDB.
2. Decide whether the category ordinarily represents a complete breakfast, lunch, or dinner.
3. Add it to exactly one classifier branch.
4. Add positive and negative regression tests.
5. Run `npm test` and `npm run typecheck`.
