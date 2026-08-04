export type Recipe = {
  id: string;
  name: string;
  mealType: string;
  minutes: number;
  description: string;
  tags: string[];
  allergens: string[];
  vegetarian: boolean;
  dietary: { vegan: boolean; halalCompatible: boolean; kosherCompatible: boolean };
  nutrition: { calories: number; protein: number; carbs: number; fat: number };
  nutritionEstimate?: {
    status: "pending" | "ready" | "unavailable";
    assumedServings: number;
    servingLabel: string;
    matchedIngredients: number;
    consideredIngredients: number;
    assumptionCount: number;
    basis: string;
    warnings: string[];
    unknownIngredients: string[];
    wholeRecipeNutrition: { calories: number; protein: number; carbs: number; fat: number };
    confidence: "high" | "medium" | "low";
    providers: Array<"USDA FoodData Central" | "Nutritionix" | "Open Food Facts" | "Model-reviewed estimate">;
    source: "USDA FoodData Central" | "USDA and fallback databases" | "Fallback nutrition databases" | "Precomputed catalog";
  };
  emoji: string;
  color: string;
  foodGroups: Array<"fruit" | "vegetables" | "grains" | "protein" | "dairy">;
  ingredientIds: string[];
  ingredients: string[];
  sourceIngredients?: Array<{ id: string; name: string; measure: string }>;
  steps: string[];
  imageUrl?: string;
  sourceUrl?: string;
  provider?: "TheMealDB";
};

type RecipeCard = Omit<Recipe, "foodGroups" | "ingredientIds" | "ingredients" | "steps" | "dietary">;

const recipeCards: RecipeCard[] = [
  { id: "butter-noodles", name: "Golden butter noodles", mealType: "Lunch", minutes: 15, description: "Silky noodles with parmesan and a crisp breadcrumb finish. Simple, warm, and reliably familiar.", tags: ["pasta", "cheese", "mild", "crunchy", "simple texture"], allergens: ["milk", "wheat"], vegetarian: true, nutrition: { calories: 480, protein: 17, carbs: 62, fat: 18 }, emoji: "🍝", color: "linear-gradient(145deg, #efd68b, #e5a74e)" },
  { id: "chicken-rice", name: "Cozy chicken & rice", mealType: "Dinner", minutes: 25, description: "Tender chicken over fluffy rice with a mild herb butter. Each ingredient stays pleasantly distinct.", tags: ["chicken", "rice", "mild", "simple texture"], allergens: ["milk"], vegetarian: false, nutrition: { calories: 520, protein: 36, carbs: 58, fat: 15 }, emoji: "🍗", color: "linear-gradient(145deg, #d9b886, #b97842)" },
  { id: "egg-toast", name: "Soft egg toast", mealType: "Breakfast", minutes: 10, description: "Creamy scrambled eggs on golden toast with crisp apple slices served separately on the side.", tags: ["eggs", "mild", "simple texture"], allergens: ["egg", "milk", "wheat"], vegetarian: true, nutrition: { calories: 390, protein: 20, carbs: 39, fat: 18 }, emoji: "🍳", color: "linear-gradient(145deg, #f3d56b, #e99144)" },
  { id: "crispy-chicken", name: "Crispy chicken bites", mealType: "Dinner", minutes: 30, description: "Oven-crisp chicken pieces with potato wedges and dipping sauce served on the side.", tags: ["chicken", "crunchy", "mild", "simple texture"], allergens: ["wheat", "egg"], vegetarian: false, nutrition: { calories: 560, protein: 39, carbs: 57, fat: 20 }, emoji: "🥔", color: "linear-gradient(145deg, #d5ae5e, #9d6330)" },
  { id: "cheese-quesadilla", name: "Crisp cheese quesadilla", mealType: "Lunch", minutes: 12, description: "A golden tortilla with melted cheese, sliced into dippable wedges. Salsa stays optional and separate.", tags: ["cheese", "crunchy", "mild", "simple texture"], allergens: ["milk", "wheat"], vegetarian: true, nutrition: { calories: 440, protein: 19, carbs: 42, fat: 22 }, emoji: "🧀", color: "linear-gradient(145deg, #efca54, #d47b2f)" },
  { id: "banana-oats", name: "Banana cinnamon oats", mealType: "Breakfast", minutes: 8, description: "Warm creamy oats with banana coins and cinnamon. Toppings are kept separate so you control every bite.", tags: ["fruit", "mild"], allergens: [], vegetarian: true, nutrition: { calories: 360, protein: 11, carbs: 64, fat: 8 }, emoji: "🍌", color: "linear-gradient(145deg, #ead77f, #b89d47)" },
  { id: "rice-bowl", name: "Build-your-own rice bowl", mealType: "Dinner", minutes: 20, description: "Fluffy rice with corn, avocado, and mild seasoned beans served in separate sections—not mixed together.", tags: ["rice", "beans", "mild", "simple texture"], allergens: [], vegetarian: true, nutrition: { calories: 510, protein: 16, carbs: 82, fat: 14 }, emoji: "🍚", color: "linear-gradient(145deg, #b9d2a1, #668b61)" },
  { id: "apple-sandwich", name: "Apple cheddar sandwich", mealType: "Lunch", minutes: 10, description: "Thin crisp apple and cheddar on toasted bread, with each flavor familiar and easy to identify.", tags: ["fruit", "cheese", "crunchy", "mild"], allergens: ["milk", "wheat"], vegetarian: true, nutrition: { calories: 410, protein: 16, carbs: 48, fat: 17 }, emoji: "🍎", color: "linear-gradient(145deg, #e47a64, #9d3d35)" },
  { id: "soy-noodles", name: "Simple sesame noodles", mealType: "Lunch", minutes: 15, description: "Springy noodles in a light savory sesame sauce with cucumber served separately for optional crunch.", tags: ["pasta", "mild", "crunchy"], allergens: ["wheat", "soy"], vegetarian: true, nutrition: { calories: 450, protein: 15, carbs: 67, fat: 14 }, emoji: "🥢", color: "linear-gradient(145deg, #d8b06a, #9a643c)" },
  { id: "salmon-rice", name: "Glazed salmon rice", mealType: "Dinner", minutes: 25, description: "Gently glazed salmon beside plain rice and crisp cucumber, plated separately for predictable bites.", tags: ["fish", "rice", "mild", "simple texture"], allergens: ["fish", "soy"], vegetarian: false, nutrition: { calories: 535, protein: 34, carbs: 56, fat: 19 }, emoji: "🐟", color: "linear-gradient(145deg, #e28e75, #9e5751)" },
  { id: "berry-yogurt", name: "Blueberry yogurt crunch", mealType: "Breakfast", minutes: 5, description: "Creamy yogurt, blueberries, and oat crunch served in separate sections so every spoonful is your choice.", tags: ["blueberries", "mild", "crunchy"], allergens: ["milk"], vegetarian: true, nutrition: { calories: 330, protein: 18, carbs: 48, fat: 8 }, emoji: "🫐", color: "linear-gradient(145deg, #9b8bc1, #5c568b)" },
  { id: "turkey-rollups", name: "Turkey cheddar roll-ups", mealType: "Lunch", minutes: 10, description: "Simple turkey and cheddar pinwheels with crackers, grapes, and cucumber kept neatly separate.", tags: ["cheese", "crunchy", "mild", "simple texture"], allergens: ["milk", "wheat"], vegetarian: false, nutrition: { calories: 430, protein: 30, carbs: 41, fat: 17 }, emoji: "🍇", color: "linear-gradient(145deg, #95b775, #547249)" },
  { id: "pita-hummus", name: "Warm pita snack plate", mealType: "Lunch", minutes: 12, description: "Toasty pita wedges, smooth hummus, carrots, and apple slices—nothing touches unless you want it to.", tags: ["crunchy", "mild", "beans", "fruit", "simple texture"], allergens: ["wheat"], vegetarian: true, nutrition: { calories: 405, protein: 13, carbs: 65, fat: 12 }, emoji: "🥕", color: "linear-gradient(145deg, #eaa05b, #b85f38)" },
  { id: "smoothie-toast", name: "Strawberry smoothie & toast", mealType: "Breakfast", minutes: 8, description: "A smooth strawberry-banana drink with crisp sunflower-butter toast for a predictable contrast.", tags: ["fruit", "mild", "crunchy"], allergens: ["milk", "wheat"], vegetarian: true, nutrition: { calories: 420, protein: 17, carbs: 63, fat: 13 }, emoji: "🍓", color: "linear-gradient(145deg, #e88f9a, #b44659)" },
  { id: "beef-tacos", name: "Build-your-own mild tacos", mealType: "Dinner", minutes: 25, description: "Mild ground beef, tortillas, cheese, lettuce, and corn served separately for total control.", tags: ["cheese", "mild", "crunchy", "simple texture"], allergens: ["milk", "wheat"], vegetarian: false, nutrition: { calories: 550, protein: 34, carbs: 52, fat: 23 }, emoji: "🌮", color: "linear-gradient(145deg, #d39a52, #8b5635)" },
];

const details: Record<string, Pick<Recipe, "foodGroups" | "ingredients" | "steps">> = {
  "butter-noodles": { foodGroups: ["grains", "dairy"], ingredients: ["2 oz pasta", "1 tbsp butter", "2 tbsp grated parmesan", "1 tbsp breadcrumbs", "Pinch of salt"], steps: ["Boil pasta until tender; reserve 2 tbsp cooking water.", "Drain and stir with butter, parmesan, and a splash of cooking water.", "Toast breadcrumbs in a dry pan and sprinkle on top—or serve them on the side."] },
  "chicken-rice": { foodGroups: ["grains", "protein", "dairy"], ingredients: ["4 oz chicken breast, diced", "3/4 cup cooked rice", "1 tsp butter", "Pinch of dried herbs", "Salt to taste"], steps: ["Cook chicken in a lightly oiled pan until it reaches 165°F.", "Warm rice and stir in butter.", "Plate chicken and rice separately; add herbs only where wanted."] },
  "egg-toast": { foodGroups: ["fruit", "grains", "protein", "dairy"], ingredients: ["2 eggs", "1 slice whole-grain bread", "1 tsp butter", "1/2 apple, sliced"], steps: ["Toast the bread to your preferred crispness.", "Whisk eggs and cook slowly with butter until just set.", "Serve eggs, toast, and apple slices in separate sections."] },
  "crispy-chicken": { foodGroups: ["vegetables", "grains", "protein"], ingredients: ["4 oz chicken breast, cubed", "1/3 cup breadcrumbs", "1 egg, beaten", "1 small potato, cut into wedges", "1 tsp olive oil"], steps: ["Heat oven to 425°F and oil a sheet pan.", "Dip chicken in egg, coat with breadcrumbs, and place beside potato wedges.", "Bake 20–25 minutes, turning once, until chicken reaches 165°F."] },
  "cheese-quesadilla": { foodGroups: ["grains", "dairy"], ingredients: ["1 flour tortilla", "1/2 cup shredded cheddar", "Optional mild salsa"], steps: ["Place cheese on half the tortilla and fold it closed.", "Cook in a dry pan for 2–3 minutes per side until crisp.", "Cut into wedges and keep salsa on the side."] },
  "banana-oats": { foodGroups: ["fruit", "grains", "dairy"], ingredients: ["1/2 cup rolled oats", "1 cup milk or fortified alternative", "1 banana", "Pinch of cinnamon"], steps: ["Simmer oats and milk for about 5 minutes, stirring often.", "Slice the banana.", "Serve banana and cinnamon on the side or add only as desired."] },
  "rice-bowl": { foodGroups: ["vegetables", "grains", "protein"], ingredients: ["3/4 cup cooked rice", "1/2 cup black beans, rinsed", "1/3 cup corn", "1/4 avocado", "Pinch of salt"], steps: ["Warm rice, beans, and corn separately.", "Slice the avocado.", "Arrange everything in separate sections so the bowl can be assembled bite by bite."] },
  "apple-sandwich": { foodGroups: ["fruit", "grains", "dairy"], ingredients: ["2 slices whole-grain bread", "1/2 apple, thinly sliced", "2 slices cheddar", "1 tsp butter"], steps: ["Layer cheddar and apple between the bread.", "Lightly butter the outside.", "Toast in a pan for 2–3 minutes per side, or serve the apple separately."] },
  "soy-noodles": { foodGroups: ["vegetables", "grains", "protein"], ingredients: ["2 oz noodles", "1 tbsp low-sodium soy sauce", "1 tsp sesame oil", "1/3 cucumber, sliced", "1/2 cup shelled edamame"], steps: ["Cook noodles and edamame according to package directions.", "Toss noodles with soy sauce and sesame oil.", "Serve cucumber and edamame separately for optional crunch."] },
  "salmon-rice": { foodGroups: ["vegetables", "grains", "protein"], ingredients: ["4 oz salmon", "3/4 cup cooked rice", "1 tsp low-sodium soy sauce", "1/3 cucumber, sliced", "1 tsp honey"], steps: ["Mix soy sauce and honey, then brush over salmon.", "Bake at 400°F for 12–15 minutes, until cooked through.", "Serve beside warm rice and cucumber."] },
  "berry-yogurt": { foodGroups: ["fruit", "grains", "dairy"], ingredients: ["3/4 cup plain or vanilla Greek yogurt", "1/2 cup blueberries", "1/4 cup oat cereal", "1 tsp honey, optional"], steps: ["Spoon yogurt into a bowl.", "Rinse and dry the blueberries.", "Place blueberries, cereal, and honey in separate sections or small cups."] },
  "turkey-rollups": { foodGroups: ["fruit", "vegetables", "grains", "protein", "dairy"], ingredients: ["3 slices turkey", "2 slices cheddar", "6 whole-grain crackers", "1/2 cup grapes", "1/3 cucumber"], steps: ["Lay turkey flat, add cheese, and roll tightly.", "Slice each roll into pinwheels if desired.", "Plate with crackers, grapes, and cucumber in separate sections."] },
  "pita-hummus": { foodGroups: ["fruit", "vegetables", "grains", "protein"], ingredients: ["1 small whole-wheat pita", "1/3 cup hummus", "1 carrot", "1/2 apple"], steps: ["Cut pita into wedges and warm for 3–4 minutes at 375°F.", "Slice the carrot and apple.", "Serve every item separately with hummus as an optional dip."] },
  "smoothie-toast": { foodGroups: ["fruit", "grains", "protein", "dairy"], ingredients: ["1 cup strawberries", "1/2 banana", "3/4 cup milk", "1 slice whole-grain bread", "1 tbsp sunflower seed butter"], steps: ["Blend strawberries, banana, and milk until completely smooth.", "Toast the bread.", "Spread with sunflower butter, or keep it on the side for dipping."] },
  "beef-tacos": { foodGroups: ["vegetables", "grains", "protein", "dairy"], ingredients: ["4 oz lean ground beef", "2 small tortillas", "1/4 cup shredded cheddar", "1/3 cup corn", "1/2 cup shredded lettuce"], steps: ["Cook beef in a pan until browned and fully cooked; season mildly.", "Warm tortillas and corn.", "Serve beef, tortillas, cheese, corn, and lettuce separately for self-assembly."] },
};

// These are recipe-level compatibility labels, not religious certification.
// Packaged ingredients, meat sourcing, and preparation environment still need verification.
const veganRecipeIds = new Set(["rice-bowl", "soy-noodles", "pita-hummus"]);
const halalCompatibleRecipeIds = new Set([
  "butter-noodles", "egg-toast", "cheese-quesadilla", "banana-oats", "rice-bowl",
  "apple-sandwich", "soy-noodles", "salmon-rice", "berry-yogurt", "pita-hummus", "smoothie-toast",
]);
const kosherCompatibleRecipeIds = new Set([
  "butter-noodles", "egg-toast", "cheese-quesadilla", "banana-oats", "rice-bowl",
  "apple-sandwich", "soy-noodles", "salmon-rice", "berry-yogurt", "pita-hummus", "smoothie-toast",
]);

// Canonical preference keys connect the taste catalog to recipes. Broad aliases
// such as "fish" and specific ingredients such as "salmon" are both included.
const recipeIngredientIds: Record<string, string[]> = {
  "butter-noodles": ["pasta", "butter", "parmesan", "cheese", "breadcrumbs"],
  "chicken-rice": ["chicken", "rice", "butter", "herbs"],
  "egg-toast": ["eggs", "bread", "butter", "apple"],
  "crispy-chicken": ["chicken", "breadcrumbs", "eggs", "potato"],
  "cheese-quesadilla": ["tortilla", "cheese", "salsa"],
  "banana-oats": ["oats", "milk", "banana", "cinnamon"],
  "rice-bowl": ["rice", "black beans", "corn", "avocado"],
  "apple-sandwich": ["bread", "apple", "cheese", "cheddar", "butter"],
  "soy-noodles": ["pasta", "noodles", "soy", "sesame", "cucumber", "edamame"],
  "salmon-rice": ["salmon", "rice", "soy", "cucumber", "honey"],
  "berry-yogurt": ["yogurt", "blueberries", "oats", "honey"],
  "turkey-rollups": ["turkey", "cheese", "cheddar", "crackers", "grapes", "cucumber"],
  "pita-hummus": ["bread", "pita", "hummus", "chickpeas", "carrot", "apple"],
  "smoothie-toast": ["strawberries", "banana", "milk", "bread", "sunflower seeds"],
  "beef-tacos": ["beef", "tortilla", "cheese", "cheddar", "corn", "lettuce"],
};

export const recipes: Recipe[] = recipeCards.map((recipe) => ({
  ...recipe,
  ...details[recipe.id],
  ingredientIds: recipeIngredientIds[recipe.id] ?? [],
  dietary: {
    vegan: veganRecipeIds.has(recipe.id),
    halalCompatible: halalCompatibleRecipeIds.has(recipe.id),
    kosherCompatible: kosherCompatibleRecipeIds.has(recipe.id),
  },
}));
