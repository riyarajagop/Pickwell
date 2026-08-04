import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Recipe } from "./src/recipes";
import { searchUSDAFoods, type USDAFood } from "./src/foodDataCentral";
import { loadIngredientCatalog, type CatalogIngredient } from "./src/ingredientCatalog";
import {
  getLocalMealDbRecipe,
  loadMealDbRecommendationPage,
  type RecommendationPage,
} from "./src/mealDbRecipes";
import { recipeMatchesRecommendationProfile } from "./src/recommendationCatalog";

type Tab = "Today" | "Taste" | "Log" | "Saved";
type Mode = "likes" | "dislikes" | "restrictions";
type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
type FoodChoice = { fdcId: number; name: string; dataType: string; status: Mode };
type Preferences = { likes: string[]; dislikes: string[]; restrictions: string[]; vegetarian: boolean; vegan: boolean; halalCompatible: boolean; kosherCompatible: boolean; customFoods: FoodChoice[] };
type MealEntry = { id: string; name: string; nutrition: Nutrition; eatenAt: string; estimated: boolean };
type StoredState = {
  preferences: Preferences;
  saved: string[];
  savedRecipes?: Record<string, Recipe>;
  ratings: Record<string, "up" | "down">;
  recentRecipeIds?: string[];
  mealLog: MealEntry[];
};

const colors = { cream: "#F5F1E7", paper: "#FFFCF5", ink: "#1D2A25", forest: "#28483B", orange: "#D85F32", sage: "#DCE7D8", line: "#D9D5C9", muted: "#68736D", red: "#A94232", brown: "#83564B" };
const storageKey = "pickwell-mobile-state-v1";
const dailyReference: Nutrition = { calories: 2000, protein: 50, carbs: 275, fat: 78 };
const foodGroupLabels = { fruit: "Fruit", vegetables: "Vegetables", grains: "Grains", protein: "Protein", dairy: "Dairy" } as const;
const defaultPreferences: Preferences = { likes: ["pasta", "cheese"], dislikes: [], restrictions: [], vegetarian: false, vegan: false, halalCompatible: false, kosherCompatible: false, customFoods: [] };
const retiredBroadIngredients = new Set(["fruit", "fish", "berries", "beans", "tree nut"]);
const recentRecipeLimit = 500;

const ingredientGroups = [
  { name: "Proteins", items: [["chicken", "🍗"], ["turkey", "🥪"], ["beef", "🥩"], ["salmon", "🐟"], ["tuna", "🐟"], ["eggs", "🍳"], ["black beans", "🫘"], ["chickpeas", "🫘"], ["tofu", "◻️"], ["peanut", "🥜"], ["almonds", "🌰"], ["cashews", "🌰"]] },
  { name: "Grains & staples", items: [["pasta", "🍝"], ["rice", "🍚"], ["bread", "🍞"], ["wheat", "🌾"], ["oats", "🥣"], ["tortilla", "🫓"], ["potato", "🥔"], ["crackers", "🟫"]] },
  { name: "Fruit", items: [["apple", "🍎"], ["banana", "🍌"], ["strawberries", "🍓"], ["blueberries", "🫐"], ["grapes", "🍇"], ["orange", "🍊"], ["avocado", "🥑"]] },
  { name: "Vegetables", items: [["tomato", "🍅"], ["mushrooms", "🍄"], ["carrot", "🥕"], ["cucumber", "🥒"], ["corn", "🌽"], ["lettuce", "🥬"]] },
  { name: "Dairy & alternatives", items: [["cheese", "🧀"], ["milk", "🥛"], ["yogurt", "🥣"], ["soy", "🌱"]] },
  { name: "Texture & intensity", items: [["spicy", "🌶️"], ["mild", "☁️"], ["crunchy", "✨"], ["mixed textures", "🔀"]] },
] as const;
const allIngredients = ingredientGroups.flatMap((group) => group.items.map(([id]) => id));

const mealEstimates: Record<string, Nutrition> = {
  Sandwich: { calories: 450, protein: 22, carbs: 48, fat: 18 },
  "Rice bowl": { calories: 550, protein: 24, carbs: 78, fat: 16 },
  Pasta: { calories: 520, protein: 18, carbs: 76, fat: 17 },
  Salad: { calories: 380, protein: 22, carbs: 28, fat: 20 },
  Breakfast: { calories: 420, protein: 20, carbs: 50, fat: 16 },
  Snack: { calories: 220, protein: 7, carbs: 30, fat: 9 },
  Other: { calories: 500, protein: 20, carbs: 60, fat: 20 },
};
const portionMultipliers = { Small: 0.7, Medium: 1, Large: 1.35 } as const;

function total(entries: MealEntry[]): Nutrition {
  return entries.reduce((sum, entry) => ({ calories: sum.calories + entry.nutrition.calories, protein: sum.protein + entry.nutrition.protein, carbs: sum.carbs + entry.nutrition.carbs, fat: sum.fat + entry.nutrition.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function nutritionPerServing(nutrition: Nutrition, servings: number): Nutrition {
  return {
    calories: Math.round(nutrition.calories / servings),
    protein: Math.round(nutrition.protein / servings),
    carbs: Math.round(nutrition.carbs / servings),
    fat: Math.round(nutrition.fat / servings),
  };
}

function expandPreferenceKeys(items: string[]) {
  const aliases: Record<string, string[]> = {
    egg: ["eggs"], eggs: ["egg"],
  };
  return new Set(items.flatMap((item) => {
    const key = item.trim().toLocaleLowerCase();
    return [key, ...(aliases[key] ?? [])];
  }));
}

function recipePreferenceKeys(recipe: Recipe) {
  const keys = new Set([...recipe.tags, ...recipe.allergens, ...recipe.ingredientIds].map((item) => item.toLocaleLowerCase()));
  recipe.ingredientIds.forEach((item) => {
    if (item.includes("cheese")) keys.add("cheese");
    if (item.includes("spaghetti") || item.includes("noodle") || item.includes("macaroni")) keys.add("pasta");
    if (item.includes("chicken")) keys.add("chicken");
  });
  return keys;
}

function recommendationRequest(
  cursor: number,
  seenIds: string[],
  ratings: Record<string, "up" | "down">,
) {
  return {
    cursor,
    seenIds,
    upIds: Object.entries(ratings).filter(([, value]) => value === "up").map(([id]) => id),
    downIds: Object.entries(ratings).filter(([, value]) => value === "down").map(([id]) => id),
  };
}

function rank(recipe: Recipe, preferences: Preferences, rating?: "up" | "down") {
  const keys = recipePreferenceKeys(recipe);
  const liked = [...expandPreferenceKeys(preferences.likes)].filter((item) => keys.has(item));
  const ratingBoost = rating === "up" ? 8 : rating === "down" ? -15 : 0;
  const score = Math.max(1, Math.min(99, 50 + liked.length * 10 + (keys.has("mild") ? 4 : 0) + ratingBoost));
  return { recipe, score, reason: liked.length ? `Matches your love of ${liked.slice(0, 2).join(" and ")}` : "A gentle option with familiar ingredients" };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Today");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Record<string, Recipe>>({});
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [recentRecipeIds, setRecentRecipeIds] = useState<string[]>([]);
  const [mealLog, setMealLog] = useState<MealEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("likes");
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [alternateOpen, setAlternateOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [recipeChoices, setRecipeChoices] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recommendationSource, setRecommendationSource] = useState<RecommendationPage["source"]>("device");
  const [recommendationCursor, setRecommendationCursor] = useState(0);
  const [hasMoreRecommendations, setHasMoreRecommendations] = useState(true);
  const [nextRecommendationPage, setNextRecommendationPage] = useState<RecommendationPage>();
  const [loadingMoreRecommendations, setLoadingMoreRecommendations] = useState(false);
  const [refreshingRecommendations, setRefreshingRecommendations] = useState(false);
  const [recipesError, setRecipesError] = useState("");
  const [modalRecipe, setModalRecipe] = useState<Recipe>();

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((value) => {
      if (value) {
        try {
          const parsed = JSON.parse(value) as StoredState;
          const stored = { ...defaultPreferences, ...(parsed.preferences ?? {}) };
          setPreferences({
            ...stored,
            likes: stored.likes.filter((item) => !retiredBroadIngredients.has(item)),
            dislikes: stored.dislikes.filter((item) => !retiredBroadIngredients.has(item)),
            restrictions: stored.restrictions.filter((item) => !retiredBroadIngredients.has(item)),
          });
          setSaved(parsed.saved ?? []);
          setSavedRecipes(Object.fromEntries(
            Object.entries(parsed.savedRecipes ?? {}).map(([id, recipe]) => [
              id,
              getLocalMealDbRecipe(id) ?? recipe,
            ]),
          ));
          setRatings(parsed.ratings ?? {});
          setRecentRecipeIds(parsed.recentRecipeIds ?? []);
          setMealLog(parsed.mealLog ?? []);
        } catch { /* use safe defaults */ }
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKey, JSON.stringify({
      preferences,
      saved,
      savedRecipes,
      ratings,
      recentRecipeIds,
      mealLog,
    }));
  }, [preferences, saved, savedRecipes, ratings, recentRecipeIds, mealLog, hydrated]);

  const recipePreferenceQuery = JSON.stringify({
    likes: [...preferences.likes].sort(),
    dislikes: [...preferences.dislikes].sort(),
    restrictions: [...preferences.restrictions].sort(),
    vegetarian: preferences.vegetarian,
    vegan: preferences.vegan,
    halalCompatible: preferences.halalCompatible,
    kosherCompatible: preferences.kosherCompatible,
  });
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const timer = setTimeout(() => {
      setRecipesLoading(true); setRecipesError("");
      setNextRecommendationPage(undefined);
      loadMealDbRecommendationPage(preferences, recommendationRequest(0, recentRecipeIds, ratings))
        .then((page) => {
          if (!active) return;
          setRecipeChoices(page.items);
          setRecommendationCursor(page.nextCursor);
          setHasMoreRecommendations(page.hasMore);
          setRecommendationSource(page.source);
          setActiveIndex(0);
          setSavedRecipes((existing) => {
            const next = { ...existing };
            for (const recipe of page.items) {
              if (saved.includes(recipe.id)) next[recipe.id] = recipe;
            }
            return next;
          });
          if (!page.items.length) setRecipesError("The local catalog returned no recipes for this profile.");
        })
        .catch(() => { if (active) setRecipesError("The local catalog has no recipes that match this profile."); })
        .finally(() => { if (active) setRecipesLoading(false); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [hydrated, recipePreferenceQuery]);

  const matches = useMemo(() => {
    const restrictions = expandPreferenceKeys(preferences.restrictions);
    const dislikes = expandPreferenceKeys(preferences.dislikes);
    return recipeChoices
      .filter((recipe) => recipeMatchesRecommendationProfile(recipe, preferences))
      .filter((recipe) => ![...recipePreferenceKeys(recipe)].some((item) => restrictions.has(item)))
      .filter((recipe) => ![...recipePreferenceKeys(recipe)].some((item) => dislikes.has(item)))
      .map((recipe) => rank(recipe, preferences, ratings[recipe.id]))
      .sort((a, b) => b.score - a.score);
  }, [preferences, ratings, recipeChoices]);

  useEffect(() => setActiveIndex(0), [preferences]);
  const current = matches.length ? matches[activeIndex % matches.length] : null;
  const shouldPrefetchRecommendations =
    Boolean(matches.length) && activeIndex >= Math.max(0, matches.length - 5);

  useEffect(() => {
    if (
      !hydrated ||
      !hasMoreRecommendations ||
      nextRecommendationPage ||
      loadingMoreRecommendations ||
      !shouldPrefetchRecommendations
    ) return;
    let active = true;
    setLoadingMoreRecommendations(true);
    const excluded = [...new Set([
      ...recentRecipeIds,
      ...recipeChoices.map((recipe) => recipe.id),
    ])].slice(-recentRecipeLimit);
    loadMealDbRecommendationPage(
      preferences,
      recommendationRequest(recommendationCursor, excluded, ratings),
    )
      .then((page) => { if (active) setNextRecommendationPage(page); })
      .catch(() => {
        if (active) setHasMoreRecommendations(false);
      })
      .finally(() => { if (active) setLoadingMoreRecommendations(false); });
    return () => { active = false; };
  }, [
    hasMoreRecommendations,
    hydrated,
    nextRecommendationPage,
    recipePreferenceQuery,
    recommendationCursor,
    shouldPrefetchRecommendations,
  ]);

  function showAnother() {
    if (!current) return;
    setRecipeOpen(false);
    setModalRecipe(undefined);
    setRecentRecipeIds((items) => [...new Set([...items, current.recipe.id])].slice(-recentRecipeLimit));
    if (activeIndex + 1 < matches.length) {
      setActiveIndex((value) => value + 1);
      return;
    }
    if (nextRecommendationPage?.items.length) {
      setRecipeChoices(nextRecommendationPage.items);
      setRecommendationCursor(nextRecommendationPage.nextCursor);
      setHasMoreRecommendations(nextRecommendationPage.hasMore);
      setRecommendationSource(nextRecommendationPage.source);
      setNextRecommendationPage(undefined);
      setActiveIndex(0);
      return;
    }
    if (hasMoreRecommendations) return;
    setActiveIndex(0);
  }

  async function refreshAllRecommendations() {
    if (refreshingRecommendations) return;
    const excluded = [...new Set([
      ...recentRecipeIds,
      ...recipeChoices.map((recipe) => recipe.id),
    ])].slice(-recentRecipeLimit);
    setRefreshingRecommendations(true);
    setRecipesError("");
    setRecipeOpen(false);
    setModalRecipe(undefined);
    try {
      const page = await loadMealDbRecommendationPage(
        preferences,
        recommendationRequest(recommendationCursor, excluded, ratings),
      );
      setRecentRecipeIds(excluded);
      setRecipeChoices(page.items);
      setRecommendationCursor(page.nextCursor);
      setHasMoreRecommendations(page.hasMore);
      setRecommendationSource(page.source);
      setNextRecommendationPage(undefined);
      setActiveIndex(0);
      if (page.items.length < 18) {
        Alert.alert(
          "Fewer new meals remain",
          `Pickwell found ${page.items.length} unseen ${page.items.length === 1 ? "meal" : "meals"} that match every current restriction. It did not relax your profile to fill the list.`,
        );
      }
    } catch {
      Alert.alert(
        "No new matching meals",
        "You have seen every remaining meal that matches this profile. Pickwell did not relax any dislikes or restrictions.",
      );
    } finally {
      setRefreshingRecommendations(false);
    }
  }

  function toggleSavedRecipe() {
    if (!current) return;
    const recipe = current.recipe;
    if (saved.includes(recipe.id)) {
      setSaved((items) => items.filter((id) => id !== recipe.id));
      setSavedRecipes((items) => {
        const next = { ...items };
        delete next[recipe.id];
        return next;
      });
      return;
    }
    setSaved((items) => [...items, recipe.id]);
    setSavedRecipes((items) => ({ ...items, [recipe.id]: recipe }));
  }

  function logMeal(name: string, nutrition: Nutrition, estimated: boolean) {
    setMealLog((items) => [{ id: `${Date.now()}-${Math.random()}`, name, nutrition, estimated, eatenAt: new Date().toISOString() }, ...items]);
    setAlternateOpen(false);
    Alert.alert("Meal logged", `${name} was added to today’s nutrition log.`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.appHeader}><View style={styles.logo}><Text style={styles.logoMark}>P</Text><Text style={styles.logoText}>pickwell</Text></View><Text style={styles.privateText}>● Private on this device</Text></View>
      <View style={styles.content}>
        {tab === "Today" && <TodayScreen current={current} count={matches.length} index={activeIndex} saved={saved} rating={current ? ratings[current.recipe.id] : undefined} loading={recipesLoading} loadingMore={loadingMoreRecommendations} refreshing={refreshingRecommendations} source={recommendationSource} error={recipesError} onNext={showAnother} onRefresh={refreshAllRecommendations} onRecipe={() => { if (current) setModalRecipe(current.recipe); setRecipeOpen(true); }} onSave={toggleSavedRecipe} onRate={(value) => current && setRatings((items) => ({ ...items, [current.recipe.id]: value }))} onEat={(nutrition) => current && logMeal(current.recipe.name, nutrition, true)} onOther={() => setAlternateOpen(true)} />}
        {tab === "Taste" && <TasteScreen preferences={preferences} mode={mode} setMode={setMode} setPreferences={setPreferences} />}
        {tab === "Log" && <LogScreen mealLog={mealLog} remove={(id) => setMealLog((items) => items.filter((entry) => entry.id !== id))} />}
        {tab === "Saved" && <SavedScreen saved={saved} recipes={savedRecipes} open={(recipe) => { setModalRecipe(recipe); setRecipeOpen(true); }} />}
      </View>
      <View style={styles.tabs}>{(["Today", "Taste", "Log", "Saved"] as Tab[]).map((item) => <Pressable key={item} style={styles.tab} onPress={() => setTab(item)}><Text style={[styles.tabIcon, tab === item && styles.tabActive]}>{item === "Today" ? "⌂" : item === "Taste" ? "♥" : item === "Log" ? "▥" : "♡"}</Text><Text style={[styles.tabLabel, tab === item && styles.tabActive]}>{item}</Text></Pressable>)}</View>
      <RecipeModal recipe={modalRecipe ?? current?.recipe} visible={recipeOpen} close={() => { setRecipeOpen(false); setModalRecipe(undefined); }} />
      <AlternateModal visible={alternateOpen} close={() => setAlternateOpen(false)} log={logMeal} />
    </SafeAreaView>
  );
}

function TodayScreen({ current, count, index, saved, rating, loading, loadingMore, refreshing, source, error, onNext, onRefresh, onRecipe, onSave, onRate, onEat, onOther }: { current: ReturnType<typeof rank> | null; count: number; index: number; saved: string[]; rating?: "up" | "down"; loading: boolean; loadingMore: boolean; refreshing: boolean; source: RecommendationPage["source"]; error: string; onNext: () => void; onRefresh: () => void; onRecipe: () => void; onSave: () => void; onRate: (value: "up" | "down") => void; onEat: (nutrition: Nutrition) => void; onOther: () => void }) {
  const [servingOverrides, setServingOverrides] = useState<Record<string, number>>({});
  if (loading && !current) return <View style={styles.empty}><ActivityIndicator color={colors.orange} size="large" /><Text style={styles.title}>Finding real recipes</Text><Text style={styles.body}>Pickwell is matching your likes with TheMealDB.</Text></View>;
  if (error && !current) return <View style={styles.empty}><Text style={styles.emptyIcon}>◌</Text><Text style={styles.title}>Recipes unavailable</Text><Text style={styles.body}>{error}</Text></View>;
  if (!current) return <View style={styles.empty}><Text style={styles.emptyIcon}>◌</Text><Text style={styles.title}>No current matches</Text><Text style={styles.body}>Change a dislike or restriction to see more recipes. Pickwell never relaxes your choices automatically.</Text></View>;
  const { recipe, score } = current;
  const nutritionReady = recipe.nutritionEstimate?.status === "ready";
  const estimate = recipe.nutritionEstimate;
  const unknownIngredients = estimate?.unknownIngredients ?? [];
  const providerLabel = estimate?.providers?.length ? estimate.providers.join(" + ") : "available nutrition sources";
  const defaultServings = estimate?.assumedServings ?? 1;
  const selectedServings = servingOverrides[recipe.id] ?? defaultServings;
  const displayedNutrition = nutritionReady && estimate?.wholeRecipeNutrition
    ? nutritionPerServing(estimate.wholeRecipeNutrition, selectedServings)
    : recipe.nutrition;
  const servingSource = servingOverrides[recipe.id]
    ? "chosen"
    : estimate?.basis.startsWith("Used the recipe's stated yield") ? "stated" : "estimated";
  const changeServings = (change: number) => {
    setServingOverrides((values) => ({
      ...values,
      [recipe.id]: Math.min(32, Math.max(1, selectedServings + change)),
    }));
  };
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.eyebrow}>TODAY’S PICK · {index % count + 1} OF {count} · {source === "local" ? "LOCAL CATALOG" : source === "shared" ? "SHARED CATALOG" : "DEVICE FALLBACK"}</Text>
    <View style={styles.heroCard}><Text style={styles.match}>{score}% MATCH</Text>{recipe.imageUrl ? <Image source={{ uri: recipe.imageUrl }} style={styles.recipeImage} /> : <Text style={styles.foodEmoji}>{recipe.emoji}</Text>}</View>
    <Text style={styles.meta}>{recipe.mealType.toUpperCase()} · {recipe.minutes ? `${recipe.minutes} MINUTES` : "TIME VARIES"}</Text><Text style={styles.largeTitle}>{recipe.name}</Text><Text style={styles.body}>{recipe.description}</Text>
    <View style={styles.groupRow}>{Object.entries(foodGroupLabels).map(([key, label]) => <Text key={key} style={[styles.groupPill, recipe.foodGroups.includes(key as keyof typeof foodGroupLabels) && styles.groupIncluded]}>{label}</Text>)}</View>
    <View style={styles.nutritionRow}><NutritionCell value={nutritionReady ? `${displayedNutrition.calories}` : "…"} label="CALORIES" /><NutritionCell value={nutritionReady ? `${displayedNutrition.protein}g` : "…"} label="PROTEIN" /><NutritionCell value={nutritionReady ? `${displayedNutrition.carbs}g` : "…"} label="CARBS" /><NutritionCell value={nutritionReady ? `${displayedNutrition.fat}g` : "…"} label="FAT" /></View><Text style={styles.estimateNote}>{nutritionReady ? `Stored catalog estimate from ${providerLabel} · ${selectedServings} ${servingSource} ${selectedServings === 1 ? "serving" : "servings"} · ${estimate?.matchedIngredients}/${estimate?.consideredIngredients} ingredients estimated · ${estimate?.confidence} ingredient coverage` : "A stored nutrition estimate was unavailable for this recipe."}</Text>
    {nutritionReady && estimate?.wholeRecipeNutrition && <Text style={styles.wholeRecipeNote}>Whole recipe estimate: {estimate.wholeRecipeNutrition.calories} kcal · {estimate.wholeRecipeNutrition.protein}g protein · {estimate.wholeRecipeNutrition.carbs}g carbs · {estimate.wholeRecipeNutrition.fat}g fat.</Text>}
    {nutritionReady && <View style={styles.servingRow}><Text style={styles.servingLabel}>SERVINGS IN THIS RECIPE</Text><Pressable accessibilityLabel="Decrease servings" style={styles.servingButton} onPress={() => changeServings(-1)}><Text style={styles.servingButtonText}>−</Text></Pressable><Text style={styles.servingCount}>{selectedServings}</Text><Pressable accessibilityLabel="Increase servings" style={styles.servingButton} onPress={() => changeServings(1)}><Text style={styles.servingButtonText}>+</Text></Pressable></View>}
    {unknownIngredients.length > 0 && <Text style={styles.unknownIngredients}>Not included in this estimate: {unknownIngredients.join(", ")}.</Text>}
    <View style={styles.actionRow}><ActionButton label={loadingMore && index >= count - 5 ? "Loading more…" : "Another →"} primary onPress={onNext} /><ActionButton label="View recipe" onPress={onRecipe} /></View>
    <View style={styles.refreshRow}><ActionButton label={refreshing ? "Refreshing 18 meals…" : "↻ Refresh all 18 meals"} disabled={refreshing} onPress={onRefresh} /></View>
    <View style={styles.iconActions}><ActionButton label={saved.includes(recipe.id) ? "♥ Saved" : "♡ Save"} onPress={onSave} /><ActionButton label={rating === "up" ? "✓ Helpful" : "↑ Helpful"} onPress={() => onRate("up")} /><ActionButton label={rating === "down" ? "✓ Not for me" : "↓ Not for me"} onPress={() => onRate("down")} /></View>
    <View style={styles.checkin}><Text style={styles.eyebrow}>AFTER THE MEAL</Text><Text style={styles.cardTitle}>Did you choose this?</Text><Text style={styles.smallBody}>Logging one serving uses the whole-recipe estimate divided by the serving count selected above. Any ingredient named above is omitted.</Text><ActionButton label={nutritionReady ? "Yes, I ate this" : "Waiting for nutrition estimate"} primary disabled={!nutritionReady} onPress={() => onEat(displayedNutrition)} /><ActionButton label="No, I ate something else" onPress={onOther} /></View>
  </ScrollView>;
}

function TasteScreen({ preferences, mode, setMode, setPreferences }: { preferences: Preferences; mode: Mode; setMode: (mode: Mode) => void; setPreferences: React.Dispatch<React.SetStateAction<Preferences>> }) {
  const catalogPageSize = 30;
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogBrowsePage, setCatalogBrowsePage] = useState(1);
  const [catalogSearchPage, setCatalogSearchPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogSource, setCatalogSource] = useState<"shared" | "live" | "cache">("live");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<USDAFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    let active = true;
    loadIngredientCatalog()
      .then(({ items, source }) => { if (active) { setCatalog(items); setCatalogSource(source); setCatalogError(""); } })
      .catch(() => { if (active) setCatalogError("The ingredient library is unavailable. You can still use the starter foods and USDA search below."); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);
  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLocaleLowerCase();
    return catalog
      .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, catalogQuery]);
  const catalogIsSearching = Boolean(catalogQuery.trim());
  const catalogPageCount = Math.max(1, Math.ceil(filteredCatalog.length / catalogPageSize));
  const catalogPage = catalogIsSearching ? catalogSearchPage : catalogBrowsePage;
  const catalogStart = (catalogPage - 1) * catalogPageSize;
  const visibleCatalog = filteredCatalog.slice(catalogStart, catalogStart + catalogPageSize);
  const catalogRangeStart = filteredCatalog.length ? catalogStart + 1 : 0;
  const catalogRangeEnd = Math.min(catalogStart + catalogPageSize, filteredCatalog.length);
  function changeCatalogQuery(value: string) {
    setCatalogQuery(value);
    if (value.trim()) setCatalogSearchPage(1);
  }
  function changeCatalogPage(amount: number) {
    if (catalogIsSearching) {
      setCatalogSearchPage((page) => Math.max(1, Math.min(catalogPageCount, page + amount)));
    } else {
      setCatalogBrowsePage((page) => Math.max(1, Math.min(catalogPageCount, page + amount)));
    }
  }
  function mark(item: string) {
    setPreferences((previous) => {
      const fields: Mode[] = ["likes", "dislikes", "restrictions"];
      const selected = previous[mode].includes(item);
      const next = { ...previous };
      fields.forEach((field) => { next[field] = previous[field].filter((value) => value !== item); });
      if (!selected) next[mode] = [...next[mode], item];
      return next;
    });
  }
  function markRemaining(field: "likes" | "dislikes") {
    setPreferences((previous) => { const chosen = new Set([...previous.likes, ...previous.dislikes, ...previous.restrictions]); return { ...previous, [field]: [...previous[field], ...allIngredients.filter((item) => !chosen.has(item))] }; });
  }
  async function runFoodSearch() {
    if (foodQuery.trim().length < 2) return;
    setSearching(true); setSearchError("");
    try { setFoodResults(await searchUSDAFoods(foodQuery.trim())); }
    catch (error) { setSearchError(error instanceof Error ? error.message : "Food search failed."); }
    finally { setSearching(false); }
  }
  function markUSDAFood(food: USDAFood) {
    setPreferences((previous) => {
      const existing = previous.customFoods.find((item) => item.fdcId === food.fdcId);
      const without = previous.customFoods.filter((item) => item.fdcId !== food.fdcId);
      if (existing?.status === mode) return { ...previous, customFoods: without };
      return { ...previous, customFoods: [...without, { fdcId: food.fdcId, name: food.description, dataType: food.dataType, status: mode }] };
    });
  }
  return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.eyebrow}>YOUR TASTE PROFILE</Text><Text style={styles.largeTitle}>Mark what works</Text><Text style={styles.body}>Choose a mode, then tap foods to mark them. Anything you skip stays neutral. Your recipe choices update immediately whenever this profile changes.</Text>
    <View style={styles.modeRow}><ModeButton label={`♥ Like ${preferences.likes.length}`} active={mode === "likes"} color={colors.forest} onPress={() => setMode("likes")} /><ModeButton label={`× Dislike ${preferences.dislikes.length}`} active={mode === "dislikes"} color={colors.brown} onPress={() => setMode("dislikes")} /><ModeButton label={`! Can’t eat ${preferences.restrictions.length}`} active={mode === "restrictions"} color={colors.red} onPress={() => setMode("restrictions")} /></View>
    {ingredientGroups.map((group) => <View key={group.name} style={styles.ingredientGroup}><Text style={styles.groupHeading}>{group.name}</Text><View style={styles.ingredientGrid}>{group.items.map(([id, emoji]) => { const status: Mode | undefined = preferences.likes.includes(id) ? "likes" : preferences.dislikes.includes(id) ? "dislikes" : preferences.restrictions.includes(id) ? "restrictions" : undefined; return <Pressable key={id} onPress={() => mark(id)} style={[styles.ingredient, status === "likes" && styles.ingredientLike, status === "dislikes" && styles.ingredientDislike, status === "restrictions" && styles.ingredientRestriction]}><Text style={styles.ingredientEmoji}>{emoji}</Text><Text style={styles.ingredientName}>{id}</Text><Text>{status === "likes" ? "♥" : status === "dislikes" ? "×" : status === "restrictions" ? "!" : "+"}</Text></Pressable>; })}</View></View>)}
    <View style={styles.catalogSection}><Text style={styles.eyebrow}>INGREDIENT LIBRARY</Text><Text style={styles.cardTitle}>Browse every ingredient</Text><Text style={styles.smallBody}>The complete TheMealDB catalog is alphabetical and divided into pages of 30. Search checks the entire catalog, not only the current page, and clearing it returns you to your previous browsing page.</Text><View style={styles.catalogSearchRow}><TextInput value={catalogQuery} onChangeText={changeCatalogQuery} placeholder="Search ingredients, such as cod" placeholderTextColor="#89918D" style={[styles.input, styles.catalogSearchInput]} />{Boolean(catalogQuery) && <Pressable accessibilityRole="button" accessibilityLabel="Clear ingredient search" onPress={() => changeCatalogQuery("")} style={styles.clearSearch}><Text style={styles.clearSearchText}>Clear</Text></Pressable>}</View>{catalogLoading && <ActivityIndicator color={colors.orange} />}{Boolean(catalogError) && <Text style={styles.searchError}>{catalogError}</Text>}{!catalogLoading && !catalogError && <><Text style={styles.libraryMeta}>{catalog.length} ingredients available · {catalogSource === "cache" ? "saved offline copy" : catalogSource === "shared" ? "shared Pickwell catalog" : "updated from TheMealDB"}</Text><Text style={styles.rangeText}>Showing {catalogRangeStart}–{catalogRangeEnd} of {filteredCatalog.length}{catalogQuery.trim() ? " matching" : ""} ingredients</Text></>}<View style={styles.ingredientGrid}>{visibleCatalog.map((item) => { const status: Mode | undefined = preferences.likes.includes(item.id) ? "likes" : preferences.dislikes.includes(item.id) ? "dislikes" : preferences.restrictions.includes(item.id) ? "restrictions" : undefined; return <Pressable accessibilityLabel={`${item.name}, ${status ?? "neutral"}`} key={item.id} onPress={() => mark(item.id)} style={[styles.catalogIngredient, status === "likes" && styles.ingredientLike, status === "dislikes" && styles.ingredientDislike, status === "restrictions" && styles.ingredientRestriction]}><Text numberOfLines={2} style={styles.catalogIngredientName}>{item.name}</Text><Text style={styles.usdaStatus}>{status === "likes" ? "♥" : status === "dislikes" ? "×" : status === "restrictions" ? "!" : "+"}</Text></Pressable>; })}</View>{!catalogLoading && visibleCatalog.length === 0 ? <Text style={styles.smallBody}>No ingredient matched that search. Try a different spelling or USDA search for a prepared or branded food.</Text> : <View style={styles.pagination}><Pressable accessibilityRole="button" disabled={catalogPage === 1} onPress={() => changeCatalogPage(-1)} style={[styles.pageButton, catalogPage === 1 && styles.pageButtonDisabled]}><Text style={[styles.pageButtonText, catalogPage === 1 && styles.pageButtonTextDisabled]}>← Previous</Text></Pressable><Text style={styles.pageLabel}>Page {catalogPage} of {catalogPageCount}</Text><Pressable accessibilityRole="button" disabled={catalogPage === catalogPageCount} onPress={() => changeCatalogPage(1)} style={[styles.pageButton, catalogPage === catalogPageCount && styles.pageButtonDisabled]}><Text style={[styles.pageButtonText, catalogPage === catalogPageCount && styles.pageButtonTextDisabled]}>Next →</Text></Pressable></View>}<Text style={styles.sourceNote}>Ingredient names: TheMealDB. The catalog is cached on this device after the first successful load. “Can’t eat” choices are never relaxed automatically, but recipe labels must still be checked for allergies.</Text></View>
    <View style={styles.usdaSection}><Text style={styles.eyebrow}>SEARCH THOUSANDS MORE</Text><Text style={styles.cardTitle}>USDA FoodData Central</Text><Text style={styles.smallBody}>Search common and branded foods, then mark each result with the active Like, Dislike, or Can’t eat mode above.</Text><View style={styles.searchRow}><TextInput value={foodQuery} onChangeText={setFoodQuery} onSubmitEditing={runFoodSearch} returnKeyType="search" placeholder="Try ‘mac and cheese’" placeholderTextColor="#89918D" style={[styles.input, styles.searchInput]} /><Pressable onPress={runFoodSearch} style={styles.searchButton}><Text style={styles.searchButtonText}>Search</Text></Pressable></View>{searching && <ActivityIndicator color={colors.orange} />}{Boolean(searchError) && <Text style={styles.searchError}>{searchError}</Text>}{foodResults.map((food) => { const choice = preferences.customFoods.find((item) => item.fdcId === food.fdcId); return <Pressable key={food.fdcId} onPress={() => markUSDAFood(food)} style={[styles.usdaResult, choice?.status === "likes" && styles.ingredientLike, choice?.status === "dislikes" && styles.ingredientDislike, choice?.status === "restrictions" && styles.ingredientRestriction]}><View style={{ flex: 1 }}><Text style={styles.usdaName}>{food.description}</Text><Text style={styles.smallBody}>{food.brandOwner ? `${food.brandOwner} · ` : ""}{food.dataType}</Text></View><Text style={styles.usdaStatus}>{choice?.status === "likes" ? "♥" : choice?.status === "dislikes" ? "×" : choice?.status === "restrictions" ? "!" : "+"}</Text></Pressable>; })}<Text style={styles.sourceNote}>Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central. USDA-search restrictions are recorded, but only the curated restriction list above is currently used as an automatic recipe-safety filter.</Text></View>
    <View style={styles.bulk}><Text style={styles.smallBody}>For everything in the starter list not marked:</Text><View style={styles.actionRow}><ActionButton label="Mark all like" onPress={() => markRemaining("likes")} /><ActionButton label="Mark all dislike" onPress={() => markRemaining("dislikes")} /></View><Text style={[styles.smallBody, { marginTop: 8 }]}>All other ingredients remain neutral unless you select them.</Text></View>
    <View style={styles.dietarySection}><Text style={styles.eyebrow}>DIETARY PATTERNS</Text><Text style={styles.smallBody}>These filters are applied before meals are ranked and are never relaxed by recommendations.</Text>
      <DietarySwitch title="Vegetarian only" description="Hide meat and fish" value={preferences.vegetarian} onChange={(value) => setPreferences((previous) => ({ ...previous, vegetarian: value }))} />
      <DietarySwitch title="Vegan only" description="Hide meat, fish, dairy, eggs, and other animal-derived ingredients" value={preferences.vegan} onChange={(value) => setPreferences((previous) => ({ ...previous, vegan: value }))} />
      <DietarySwitch title="Halal-compatible only" description="Show recipes without known prohibited ingredients; verify certification and sourcing" value={preferences.halalCompatible} onChange={(value) => setPreferences((previous) => ({ ...previous, halalCompatible: value }))} />
      <DietarySwitch title="Kosher-compatible only" description="Show recipes with compatible ingredient combinations; verify certification and preparation" value={preferences.kosherCompatible} onChange={(value) => setPreferences((previous) => ({ ...previous, kosherCompatible: value }))} />
      <Text style={styles.sourceNote}>Compatibility is not certification. For strict observance, confirm package symbols, meat sourcing, equipment, and preparation with an appropriate trusted authority.</Text>
    </View>
  </ScrollView>;
}

function LogScreen({ mealLog, remove }: { mealLog: MealEntry[]; remove: (id: string) => void }) {
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [visibleMonth, setVisibleMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const selectedEntries = mealLog.filter((entry) => new Date(entry.eatenAt).toDateString() === selectedDate.toDateString());
  const weekEntries = mealLog.filter((entry) => new Date(entry.eatenAt) >= weekStart);
  const selectedTotals = total(selectedEntries); const weekTotals = total(weekEntries); const days = Math.max(1, new Set(weekEntries.map((entry) => new Date(entry.eatenAt).toDateString())).size);
  const average = { calories: Math.round(weekTotals.calories / days), protein: Math.round(weekTotals.protein / days), carbs: Math.round(weekTotals.carbs / days), fat: Math.round(weekTotals.fat / days) };
  const leadingBlanks = visibleMonth.getDay(); const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array.from({ length: leadingBlanks }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))];
  const changeMonth = (amount: number) => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1));
  return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.eyebrow}>NUTRITION CALENDAR</Text><Text style={styles.largeTitle}>Your year, day by day</Text><Text style={styles.body}>Every logged meal is attached to its real calendar date. Select any day to review it.</Text>
    <View style={styles.calendar}><View style={styles.calendarHeader}><Pressable onPress={() => changeMonth(-1)}><Text style={styles.monthArrow}>‹</Text></Pressable><Text style={styles.calendarTitle}>{visibleMonth.toLocaleDateString([], { month: "long", year: "numeric" })}</Text><Pressable onPress={() => changeMonth(1)}><Text style={styles.monthArrow}>›</Text></Pressable></View><View style={styles.weekdays}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text style={styles.weekdaysText} key={`${day}-${index}`}>{day}</Text>)}</View><View style={styles.calendarGrid}>{cells.map((date, index) => { if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />; const hasMeals = mealLog.some((entry) => new Date(entry.eatenAt).toDateString() === date.toDateString()); const selected = selectedDate.toDateString() === date.toDateString(); const isToday = now.toDateString() === date.toDateString(); return <Pressable key={date.toISOString()} onPress={() => setSelectedDate(date)} style={[styles.dayCell, selected && styles.daySelected]}><Text style={[styles.dayText, selected && styles.daySelectedText, isToday && !selected && styles.todayText]}>{date.getDate()}</Text>{hasMeals && <View style={[styles.dayDot, selected && { backgroundColor: "white" }]} />}</Pressable>; })}</View><Pressable onPress={() => { setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate())); setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}><Text style={styles.todayLink}>Return to today</Text></Pressable></View>
    <Summary title={selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} subtitle={`${selectedEntries.length} meals`} values={selectedTotals} /><Summary title="Current 7-day average" subtitle={`${days} days tracked`} values={average} />
    <Text style={[styles.cardTitle, { marginTop: 24 }]}>Meals on this day</Text>{selectedEntries.length === 0 ? <Text style={styles.body}>Nothing was logged on this date.</Text> : selectedEntries.map((entry) => <View key={entry.id} style={styles.historyItem}><View style={{ flex: 1 }}><Text style={styles.historyTitle}>{entry.name}</Text><Text style={styles.smallBody}>{new Date(entry.eatenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {entry.estimated ? "estimated" : "Pickwell recipe"}</Text></View><Text style={styles.historyNutrition}>{entry.nutrition.calories} cal{"\n"}{entry.nutrition.protein}g protein</Text><Pressable onPress={() => remove(entry.id)}><Text style={styles.remove}>Remove</Text></Pressable></View>)}
    <Text style={styles.disclaimer}>References: 2,000 calories, 50g protein, 275g carbohydrate, and 78g fat. Individual needs vary. Pickwell does not diagnose deficiencies.</Text>
  </ScrollView>;
}

function SavedScreen({ saved, recipes, open }: { saved: string[]; recipes: Record<string, Recipe>; open: (recipe: Recipe) => void }) {
  const items = saved.map((id) => recipes[id]).filter(Boolean);
  return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.eyebrow}>YOUR SHORTLIST</Text><Text style={styles.largeTitle}>Saved for later</Text>{items.length === 0 ? <Text style={styles.body}>Tap Save on a current TheMealDB recipe to begin your shortlist.</Text> : items.map((recipe) => <Pressable key={recipe.id} style={styles.savedCard} onPress={() => open(recipe)}>{recipe.imageUrl ? <Image source={{ uri: recipe.imageUrl }} style={styles.savedImage} /> : <Text style={styles.savedEmoji}>{recipe.emoji}</Text>}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{recipe.name}</Text><Text style={styles.smallBody}>{recipe.provider} · {recipe.nutritionEstimate?.status === "ready" ? `${recipe.nutrition.calories} estimated calories per serving` : "nutrition pending"}</Text></View><Text>→</Text></Pressable>)}</ScrollView>;
}

function RecipeModal({ recipe, visible, close }: { recipe?: Recipe; visible: boolean; close: () => void }) {
  if (!recipe) return null;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={styles.modal}><View style={styles.modalHeader}><Text style={styles.largeTitle}>Recipe</Text><Pressable onPress={close}><Text style={styles.close}>Done</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalContent}>{recipe.imageUrl ? <Image source={{ uri: recipe.imageUrl }} style={styles.modalRecipeImage} /> : <Text style={styles.foodEmoji}>{recipe.emoji}</Text>}<Text style={styles.meta}>{recipe.provider?.toUpperCase()} · {recipe.minutes ? `${recipe.minutes} MINUTES` : "TIME VARIES"}</Text><Text style={styles.largeTitle}>{recipe.name}</Text><Text style={styles.sectionTitle}>Ingredients</Text>{recipe.ingredients.map((item, index) => <Text key={`${item}-${index}`} style={styles.listItem}>— {item}</Text>)}<Text style={styles.sectionTitle}>Directions</Text>{recipe.steps.map((step, index) => <View key={`${step}-${index}`} style={styles.stepRow}><Text style={styles.stepNumber}>{index + 1}</Text><Text style={[styles.body, { flex: 1 }]}>{step}</Text></View>)}{recipe.sourceUrl && <Pressable onPress={() => Linking.openURL(recipe.sourceUrl!)} style={styles.sourceButton}><Text style={styles.sourceButtonText}>Open original recipe source ↗</Text></Pressable>}<Text style={styles.disclaimer}>Recipe data: TheMealDB. Nutrition is read from Pickwell’s precomputed local catalog, generated from reviewed USDA FoodData Central matches and explicitly labeled model-reviewed estimates when no defensible USDA match was available. Serving counts target 500–1,000 calories per serving. Typical item weights, volume conversions, and frying-oil absorption remain assumptions. Verify allergens, dietary requirements, cooking temperatures, and food safety independently.</Text></ScrollView></SafeAreaView></Modal>;
}

function AlternateModal({ visible, close, log }: { visible: boolean; close: () => void; log: (name: string, nutrition: Nutrition, estimated: boolean) => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState("Sandwich"); const [portion, setPortion] = useState<keyof typeof portionMultipliers>("Medium");
  const estimate = Object.fromEntries(Object.entries(mealEstimates[type]).map(([key, value]) => [key, Math.round(value * portionMultipliers[portion])])) as Nutrition;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}><View style={styles.overlay}><View style={styles.dialog}><View style={styles.modalHeader}><Text style={styles.cardTitle}>What did you eat?</Text><Pressable onPress={close}><Text style={styles.close}>Cancel</Text></Pressable></View><Text style={styles.smallBody}>Choose the closest match for a rough planning estimate.</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Meal name" placeholderTextColor="#89918D" />
    <Text style={styles.fieldLabel}>Closest meal type</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{Object.keys(mealEstimates).map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.choice, type === item && styles.choiceActive]}><Text style={type === item ? styles.choiceActiveText : undefined}>{item}</Text></Pressable>)}</ScrollView>
    <Text style={styles.fieldLabel}>Portion</Text><View style={styles.actionRow}>{(Object.keys(portionMultipliers) as Array<keyof typeof portionMultipliers>).map((item) => <Pressable key={item} onPress={() => setPortion(item)} style={[styles.choice, { flex: 1 }, portion === item && styles.choiceActive]}><Text style={[styles.choiceText, portion === item && styles.choiceActiveText]}>{item}</Text></Pressable>)}</View>
    <View style={styles.estimate}><NutritionCell value={`${estimate.calories}`} label="CAL" /><NutritionCell value={`${estimate.protein}g`} label="PROTEIN" /><NutritionCell value={`${estimate.carbs}g`} label="CARBS" /><NutritionCell value={`${estimate.fat}g`} label="FAT" /></View><ActionButton label="Add estimate to today" primary disabled={!name.trim()} onPress={() => { log(name.trim(), estimate, true); setName(""); }} /></View></View></Modal>;
}

function Summary({ title, subtitle, values }: { title: string; subtitle: string; values: Nutrition }) { return <View style={styles.summary}><View style={styles.summaryHeader}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.smallBody}>{subtitle}</Text></View>{(Object.keys(dailyReference) as Array<keyof Nutrition>).map((key) => { const percent = Math.round(values[key] / dailyReference[key] * 100); return <View key={key} style={styles.barRow}><View style={styles.barLabels}><Text style={styles.barName}>{key}</Text><Text style={styles.barValue}>{values[key]}{key === "calories" ? "" : "g"} · {percent}%</Text></View><View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(percent, 100)}%` }]} /></View></View>; })}</View>; }
function NutritionCell({ value, label }: { value: string; label: string }) { return <View style={styles.nutritionCell}><Text style={styles.nutritionValue}>{value}</Text><Text style={styles.nutritionLabel}>{label}</Text></View>; }
function ActionButton({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primaryButton, disabled && { opacity: .4 }]}><Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text></Pressable>; }
function ModeButton({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.modeButton, active && { backgroundColor: color, borderColor: color }]}><Text style={[styles.modeText, active && { color: "white" }]}>{label}</Text></Pressable>; }
function DietarySwitch({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.switchRow}><View style={{ flex: 1, paddingRight: 12 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.smallBody}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ true: colors.orange }} /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { flex: 1 }, screen: { padding: 20, paddingBottom: 38 }, appHeader: { height: 58, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, logo: { flexDirection: "row", alignItems: "center", gap: 8 }, logoMark: { width: 28, height: 28, borderRadius: 14, textAlign: "center", paddingTop: 4, color: "white", backgroundColor: colors.orange, fontWeight: "900" }, logoText: { fontFamily: "Georgia", fontSize: 23, color: colors.forest, fontWeight: "700" }, privateText: { color: "#54815F", fontSize: 10 }, tabs: { height: 70, flexDirection: "row", backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }, tabIcon: { fontSize: 20, color: "#89918D" }, tabLabel: { fontSize: 10, color: "#89918D" }, tabActive: { color: colors.orange, fontWeight: "800" },
  eyebrow: { color: colors.orange, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 }, largeTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 34, lineHeight: 38, marginBottom: 10 }, title: { color: colors.ink, fontFamily: "Georgia", fontSize: 28 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 }, smallBody: { color: colors.muted, fontSize: 11, lineHeight: 16 }, meta: { color: colors.orange, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: 18, marginBottom: 8 }, heroCard: { height: 245, borderRadius: 5, backgroundColor: "#E5A74E", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }, recipeImage: { width: "100%", height: "100%", resizeMode: "cover" }, match: { position: "absolute", zIndex: 2, top: 14, left: 14, backgroundColor: colors.orange, color: "white", fontSize: 10, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 }, foodEmoji: { fontSize: 105 }, groupRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 18 }, groupPill: { borderWidth: 1, borderColor: colors.line, color: "#9A9E9B", paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, textTransform: "uppercase" }, groupIncluded: { backgroundColor: colors.sage, color: colors.forest, borderColor: "#A7BAA9", fontWeight: "800" }, nutritionRow: { flexDirection: "row", backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginBottom: 6 }, estimateNote: { color: colors.muted, fontSize: 9, lineHeight: 14, marginBottom: 4 }, wholeRecipeNote: { color: colors.forest, fontSize: 9, lineHeight: 14, marginBottom: 4 }, servingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 7 }, servingLabel: { flex: 1, color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 }, servingButton: { width: 32, height: 32, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" }, servingButtonText: { color: colors.forest, fontSize: 20, lineHeight: 22 }, servingCount: { minWidth: 24, color: colors.ink, fontFamily: "Georgia", fontSize: 18, textAlign: "center" }, unknownIngredients: { color: colors.red, fontSize: 9, lineHeight: 14, marginBottom: 10 }, nutritionCell: { flex: 1, alignItems: "center", paddingVertical: 13 }, nutritionValue: { color: colors.ink, fontFamily: "Georgia", fontSize: 18 }, nutritionLabel: { color: colors.muted, fontSize: 8, marginTop: 3 }, actionRow: { flexDirection: "row", gap: 8, marginVertical: 5 }, refreshRow: { flexDirection: "row", marginTop: 4, marginBottom: 8 }, iconActions: { flexDirection: "row", gap: 6, marginBottom: 18 }, button: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, buttonText: { color: colors.forest, fontSize: 11, fontWeight: "800", textAlign: "center" }, primaryButton: { backgroundColor: colors.orange, borderColor: colors.orange }, primaryButtonText: { color: "white" }, checkin: { backgroundColor: colors.paper, padding: 18, marginTop: 8, gap: 8 }, cardTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, empty: { flex: 1, padding: 35, alignItems: "center", justifyContent: "center", gap: 12 }, emptyIcon: { fontSize: 70, color: colors.orange },
  modeRow: { gap: 6, marginVertical: 20 }, modeButton: { borderWidth: 1, borderColor: colors.line, minHeight: 43, alignItems: "center", justifyContent: "center" }, modeText: { fontSize: 12, fontWeight: "800", color: colors.ink }, ingredientGroup: { marginBottom: 22 }, groupHeading: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }, ingredientGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, ingredient: { width: "48%", minHeight: 46, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", padding: 8, gap: 6 }, ingredientLike: { backgroundColor: "#E1EADE", borderColor: "#759080" }, ingredientDislike: { backgroundColor: "#EEE0DC", borderColor: "#A47A70" }, ingredientRestriction: { backgroundColor: "#F3DFDA", borderColor: "#C47969" }, ingredientEmoji: { fontSize: 17 }, ingredientName: { flex: 1, fontSize: 11, color: colors.ink, textTransform: "capitalize" }, bulk: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 18 }, dietarySection: { marginTop: 24, borderTopWidth: 1, borderColor: colors.line, paddingTop: 18 }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.paper, padding: 16, marginTop: 8 },
  usdaSection: { backgroundColor: colors.paper, borderTopWidth: 3, borderTopColor: colors.orange, padding: 16, marginVertical: 22 }, searchRow: { flexDirection: "row", alignItems: "center", gap: 7 }, searchInput: { flex: 1, marginVertical: 14 }, searchButton: { height: 44, paddingHorizontal: 16, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" }, searchButtonText: { color: "white", fontSize: 11, fontWeight: "800" }, searchError: { color: colors.red, fontSize: 11, lineHeight: 16, marginBottom: 10 }, usdaResult: { minHeight: 58, borderWidth: 1, borderColor: colors.line, padding: 10, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 10 }, usdaName: { color: colors.ink, fontSize: 11, fontWeight: "800", textTransform: "capitalize" }, usdaStatus: { fontSize: 18, fontWeight: "900" }, sourceNote: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 14 },
  catalogSection: { backgroundColor: colors.paper, borderTopWidth: 3, borderTopColor: colors.forest, padding: 16, marginVertical: 8 }, catalogSearchRow: { flexDirection: "row", alignItems: "center", gap: 7 }, catalogSearchInput: { flex: 1 }, clearSearch: { height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }, clearSearchText: { color: colors.forest, fontSize: 10, fontWeight: "800" }, libraryMeta: { color: colors.muted, fontSize: 10, marginBottom: 5 }, rangeText: { color: colors.ink, fontSize: 11, fontWeight: "800", marginBottom: 12 }, catalogIngredient: { width: "48%", minHeight: 52, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", padding: 9, gap: 5 }, catalogIngredientName: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "700" }, pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 7 }, pageButton: { minHeight: 40, flex: 1, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, pageButtonDisabled: { borderColor: colors.line, backgroundColor: "#F2F0E9" }, pageButtonText: { color: colors.forest, fontSize: 10, fontWeight: "800" }, pageButtonTextDisabled: { color: "#A3A7A4" }, pageLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  calendar: { backgroundColor: colors.paper, padding: 15, marginTop: 18 }, calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, calendarTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, monthArrow: { color: colors.orange, fontSize: 34, paddingHorizontal: 12 }, weekdays: { flexDirection: "row", marginBottom: 6 }, calendarGrid: { flexDirection: "row", flexWrap: "wrap" }, dayCell: { width: "14.2857%", height: 43, alignItems: "center", justifyContent: "center", borderRadius: 22 }, weekdaysText: { width: "14.2857%", textAlign: "center", color: colors.muted, fontSize: 10, fontWeight: "800" }, daySelected: { backgroundColor: colors.orange }, dayText: { color: colors.ink, fontSize: 12 }, daySelectedText: { color: "white", fontWeight: "900" }, todayText: { color: colors.orange, fontWeight: "900", textDecorationLine: "underline" }, dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.forest, marginTop: 3 }, todayLink: { color: colors.orange, fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: 12 },
  summary: { backgroundColor: colors.paper, padding: 17, marginTop: 14 }, summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingBottom: 12, marginBottom: 12 }, barRow: { marginVertical: 8 }, barLabels: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }, barName: { fontSize: 11, textTransform: "capitalize", fontWeight: "800" }, barValue: { fontSize: 10, color: colors.muted }, bar: { height: 7, backgroundColor: "#E2E2DB" }, barFill: { height: 7, backgroundColor: colors.orange }, historyItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 13 }, historyTitle: { fontWeight: "800", fontSize: 12 }, historyNutrition: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "right" }, remove: { color: colors.red, fontSize: 9, textDecorationLine: "underline" }, disclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingTop: 14, marginTop: 20 }, savedCard: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 15, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 13 }, savedEmoji: { fontSize: 36 }, savedImage: { width: 54, height: 54, borderRadius: 3 },
  modal: { flex: 1, backgroundColor: colors.cream }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, modalContent: { padding: 22, paddingBottom: 50 }, modalRecipeImage: { width: "100%", height: 230, resizeMode: "cover" }, close: { color: colors.orange, fontWeight: "800", fontSize: 14 }, sectionTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 24, marginTop: 28, marginBottom: 12 }, listItem: { color: colors.muted, fontSize: 13, lineHeight: 22 }, stepRow: { flexDirection: "row", gap: 11, marginBottom: 14 }, stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.forest, color: "white", textAlign: "center", paddingTop: 3, fontSize: 11, fontWeight: "800" }, sourceButton: { minHeight: 46, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center", marginTop: 22 }, sourceButtonText: { color: colors.forest, fontSize: 11, fontWeight: "800" }, overlay: { flex: 1, backgroundColor: "#16251FDD", justifyContent: "center", padding: 18 }, dialog: { backgroundColor: colors.paper, padding: 20, maxHeight: "90%" }, input: { borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: "white", padding: 12, marginVertical: 16 }, fieldLabel: { fontSize: 10, fontWeight: "900", color: colors.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 10, marginBottom: 7 }, choice: { borderWidth: 1, borderColor: colors.line, minHeight: 38, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", marginRight: 6 }, choiceActive: { backgroundColor: colors.forest, borderColor: colors.forest }, choiceText: { textAlign: "center" }, choiceActiveText: { color: "white", fontWeight: "800" }, estimate: { flexDirection: "row", backgroundColor: colors.sage, marginVertical: 18 },
});
