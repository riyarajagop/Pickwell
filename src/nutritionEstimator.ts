export type MacroProfile = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FdcNutrient = {
  nutrientId?: number;
  nutrientName?: string;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
};

export type FdcFood = {
  fdcId: number;
  description: string;
  dataType: string;
  publicationDate?: string;
  foodNutrients?: FdcNutrient[];
  foodPortions?: UsdaFoodPortion[];
};

export type UsdaFoodPortion = {
  amount?: number;
  gramWeight: number;
  portionDescription?: string;
  modifier?: string;
  unitName?: string;
  unitAbbreviation?: string;
};

export type UsdaNutrientMatch = {
  fdcId: number;
  description: string;
  dataType: string;
  publicationDate?: string;
  nutrientsPer100g: MacroProfile;
  foodPortions: UsdaFoodPortion[];
};

export type GramResolution =
  | { status: "included"; grams: number; method: string; warning?: string }
  | { status: "excluded"; reason: string }
  | { status: "unresolved"; reason: string };

type RetailProfile = {
  pattern: RegExp;
  item?: number;
  small?: number;
  medium?: number;
  large?: number;
  slice?: number;
  cup?: number;
  tablespoon?: number;
  teaspoon?: number;
  pinch?: number;
  clove?: number;
  packet?: number;
  handful?: number;
  bunch?: number;
  sprig?: number;
  stalk?: number;
  leaf?: number;
  can?: number;
  cube?: number;
  dash?: number;
  splash?: number;
  knob?: number;
  head?: number;
  pod?: number;
};

type RetailUnit = Exclude<keyof RetailProfile, "pattern">;

const RETAIL_PROFILES: RetailProfile[] = [
  { pattern: /chicken breast/, item: 170 },
  { pattern: /\beggs?\b(?!\s*plants?)/, item: 50, small: 38, medium: 44, large: 50 },
  { pattern: /whole-grain bread|whole wheat bread|\bbread\b/, slice: 28, item: 28 },
  { pattern: /cheddar/, slice: 28, cup: 113 },
  { pattern: /parmesan/, tablespoon: 5 },
  { pattern: /sunflower seed butter|peanut butter|almond butter|tahini/, cup: 256, tablespoon: 16, teaspoon: 5.3 },
  { pattern: /\bbutter\b/, cup: 227, tablespoon: 14.2, teaspoon: 4.7, knob: 14.2 },
  { pattern: /breadcrumbs?/, cup: 108, tablespoon: 6.75 },
  { pattern: /cornstarch|corn flour|potato starch|\bstarch\b/, cup: 128, tablespoon: 8, teaspoon: 2.7 },
  { pattern: /all[ -]?purpose flour|plain flour|self[ -]?raising flour|self[ -]?rising flour|\bflour\b/, cup: 125, tablespoon: 7.8 },
  { pattern: /brown sugar/, cup: 220, tablespoon: 13.75, teaspoon: 4.6 },
  { pattern: /\bsugar\b/, cup: 200, tablespoon: 12.5, teaspoon: 4.2, pinch: 0.5 },
  { pattern: /\bvanilla\b/, tablespoon: 13, teaspoon: 4.2, pod: 5, item: 5 },
  { pattern: /\bcinnamon\b/, item: 3, tablespoon: 7.8, teaspoon: 2.6, pinch: 0.3, stalk: 3 },
  { pattern: /\bnutmeg\b/, tablespoon: 6.6, teaspoon: 2.2, pinch: 0.3 },
  { pattern: /baking powder/, tablespoon: 13.8, teaspoon: 4.6 },
  { pattern: /\bcumin\b/, tablespoon: 6.3, teaspoon: 2.1, pinch: 0.25 },
  { pattern: /\bpaprika\b/, tablespoon: 6.9, teaspoon: 2.3, pinch: 0.25 },
  { pattern: /\bpepper\b/, tablespoon: 6.9, teaspoon: 2.3, pinch: 0.25 },
  { pattern: /\bturmeric\b/, tablespoon: 9, teaspoon: 3, pinch: 0.3 },
  { pattern: /\ballspice\b/, tablespoon: 5.7, teaspoon: 1.9, pinch: 0.25 },
  { pattern: /\bginger\b/, item: 11, tablespoon: 5.4, teaspoon: 1.8, pinch: 0.25, knob: 11 },
  { pattern: /cooked rice/, cup: 158 },
  { pattern: /\bvinegar\b/, cup: 239, tablespoon: 15, teaspoon: 5 },
  { pattern: /basmati rice|jasmine rice|sushi rice|paella rice|dessert rice|glutinous rice|\brice\b/, cup: 185 },
  { pattern: /macaroni|penne|rigatoni|farfalle|bowtie|paccheri|\bpasta\b/, cup: 100 },
  { pattern: /black beans/, cup: 172 },
  { pattern: /\bcorn\b/, cup: 164 },
  { pattern: /rolled oats/, cup: 80 },
  { pattern: /coconut milk/, cup: 240, tablespoon: 15, teaspoon: 5, can: 400 },
  { pattern: /condensed milk/, cup: 306, tablespoon: 19, teaspoon: 6.4, can: 397 },
  { pattern: /\bmilk\b/, cup: 244, tablespoon: 15.25, teaspoon: 5.08, splash: 15 },
  { pattern: /heavy cream|double cream|single cream/, cup: 238, tablespoon: 14.9, teaspoon: 5, splash: 15 },
  { pattern: /chicken stock|\bbroth\b|\bstock\b/, item: 10, cup: 240, tablespoon: 15, teaspoon: 5, cube: 10 },
  { pattern: /\bwater\b|\bice\b/, cup: 236.588, tablespoon: 14.787, teaspoon: 4.929, dash: 1, splash: 15 },
  { pattern: /greek yogurt|\byogurt\b/, cup: 245 },
  { pattern: /\bbananas?\b/, item: 118, small: 101, medium: 118, large: 136 },
  { pattern: /\bapples?\b/, item: 182, small: 149, medium: 182, large: 223 },
  { pattern: /\bavocados?\b/, item: 150 },
  { pattern: /\bpotato(?:es)?\b/, item: 213, small: 170, medium: 213, large: 369 },
  { pattern: /flour tortilla/, item: 45, small: 28, medium: 45, large: 70 },
  { pattern: /\btortilla\b/, item: 45, small: 28, medium: 45, large: 70 },
  { pattern: /soy sauce/, cup: 255, tablespoon: 16, teaspoon: 5.3 },
  { pattern: /sesame oil|olive oil|vegetable oil|sunflower oil|rapeseed oil|canola oil|peanut oil|ground nut oil|coconut oil|truffle oil|\boil\b/, cup: 216, tablespoon: 13.5, teaspoon: 4.5, dash: 0.5, splash: 5 },
  { pattern: /fajita seasoning/, packet: 28 },
  { pattern: /spring onions?|scallions?/, cup: 100, tablespoon: 6, item: 15, bunch: 100 },
  { pattern: /\bonions?\b/, cup: 160, tablespoon: 10, item: 110, small: 70, medium: 110, large: 150 },
  { pattern: /(?:red|green|yellow|romano|bell|sweet|banana|padron|padrón) peppers?/, cup: 149, item: 119, small: 74, medium: 119, large: 164 },
  { pattern: /garlic powder|garlic granules/, tablespoon: 9.7, teaspoon: 3.2, pinch: 0.3 },
  { pattern: /\bgarlic\b/, tablespoon: 8.5, teaspoon: 2.8, clove: 3, item: 3 },
  { pattern: /\bcucumbers?\b/, item: 201 },
  { pattern: /\bedamame\b/, cup: 155 },
  { pattern: /\bhoney\b/, tablespoon: 21, teaspoon: 7 },
  { pattern: /\bberries\b|strawberries|blueberries/, cup: 152 },
  { pattern: /oat cereal|\bcereal\b/, cup: 30 },
  { pattern: /\bturkey\b/, slice: 28, item: 28 },
  { pattern: /crackers?/, item: 4 },
  { pattern: /\bgrapes\b/, cup: 151 },
  { pattern: /whole-wheat pita|\bpita\b/, item: 28, small: 28, medium: 60, large: 80 },
  { pattern: /\bhummus\b/, cup: 246, tablespoon: 15.4 },
  { pattern: /\bcarrots?\b/, item: 61, small: 50, medium: 61, large: 72 },
  { pattern: /\blettuce\b/, cup: 36, item: 539, head: 539 },
  { pattern: /\bsalt\b/, tablespoon: 18, pinch: 0.36, teaspoon: 6, dash: 0.6 },
  { pattern: /dried herbs/, pinch: 0.3, teaspoon: 1 },
  { pattern: /\bbay leaves?\b|\bbay leaf\b/, item: 0.6, leaf: 0.6 },
  { pattern: /\bparsley\b|\bcoriander\b|\bcilantro\b|\bmint\b|\bbasil\b|\bdill\b|\bchives?\b/, cup: 16, tablespoon: 3.8, teaspoon: 1.3, pinch: 0.3, handful: 15, bunch: 60, sprig: 1, leaf: 0.5 },
  { pattern: /\bthyme\b|\brosemary\b|\boregano\b|summer savoury/, tablespoon: 2.4, teaspoon: 0.8, pinch: 0.3, handful: 12, bunch: 40, sprig: 0.8 },
  { pattern: /chilli powder|chili powder|chilli flakes|chili flakes|garam masala|harissa spice|curry powder|all-purpose seasoning|jamaican curry powder|italian seasoning/, tablespoon: 7.5, teaspoon: 2.5, pinch: 0.25 },
  { pattern: /\bchilli\b|\bchili\b|scotch bonnet/, item: 15, small: 8, medium: 15, large: 25 },
  { pattern: /fish sauce/, tablespoon: 18, teaspoon: 6 },
  { pattern: /tomato puree|tomato paste/, tablespoon: 16, teaspoon: 5.3 },
  { pattern: /\bshallots?\b/, item: 44, small: 25, medium: 44, large: 60 },
  { pattern: /\bcelery\b/, cup: 101, item: 40, stalk: 40 },
  { pattern: /\btomato(?:es)?\b/, cup: 180, item: 123, small: 91, medium: 123, large: 182 },
  { pattern: /\bbacon\b/, item: 28, slice: 28 },
  { pattern: /\bsaffron\b/, pinch: 0.125 },
  { pattern: /lemon juice/, cup: 244, tablespoon: 15.25, teaspoon: 5.08 },
  { pattern: /lime juice/, cup: 246, tablespoon: 15.4, teaspoon: 5.13 },
  { pattern: /\blemon\b/, item: 84, small: 58, medium: 84, large: 116 },
  { pattern: /\blime\b/, item: 67, small: 55, medium: 67, large: 85 },
  { pattern: /cornstarch|corn flour|potato starch|\bstarch\b/, cup: 128, tablespoon: 8, teaspoon: 2.7 },
  { pattern: /mayonnaise|a[iï]oli/, cup: 220, tablespoon: 13.8, teaspoon: 4.6 },
  { pattern: /worcestershire|hotsauce|hot sauce|tabasco|tobasco|ketchup|chilli sauce|sweet chilli sauce|garlic sauce|chimichurri sauce/, cup: 240, tablespoon: 15, teaspoon: 5, dash: 1, splash: 10 },
  { pattern: /sour cream|creme fraiche|crème fraîche|fromage frais/, cup: 230, tablespoon: 14.4, teaspoon: 4.8 },
  { pattern: /\bmustard\b/, cup: 250, tablespoon: 15, teaspoon: 5 },
  { pattern: /\bwine\b|\bsherry\b|\bbrandy\b|\brum\b|\bbeer\b|\bstout\b|\bsake\b|\bmirin\b/, cup: 236.6, tablespoon: 14.8, teaspoon: 4.9, dash: 1, splash: 15 },
  { pattern: /\braisins?\b|\bsultanas?\b|\bcurrants?\b/, cup: 145, tablespoon: 9 },
  { pattern: /\bmozzarella\b/, cup: 112, slice: 28 },
  { pattern: /\bfeta\b/, cup: 150 },
  { pattern: /cream cheese|mascarpone/, cup: 232, tablespoon: 14.5 },
  { pattern: /\bricotta\b/, cup: 246 },
  { pattern: /\bcabbage\b/, cup: 89, item: 900, head: 900 },
  { pattern: /\bleeks?\b/, cup: 89, item: 89, medium: 89, large: 160 },
  { pattern: /\bmushrooms?\b/, cup: 70, item: 18, small: 10, medium: 18, large: 23 },
  { pattern: /\bbroccoli\b/, cup: 91, item: 608, head: 608 },
  { pattern: /aubergine|egg ?plants?/, cup: 82, item: 458, small: 300, medium: 458, large: 548 },
  { pattern: /courgettes?|\bzucchini\b/, cup: 124, item: 196, small: 118, medium: 196, large: 323 },
  { pattern: /bean sprouts?/, cup: 104 },
  { pattern: /\bpeas\b/, cup: 145 },
  { pattern: /\bspinach\b/, cup: 30 },
  { pattern: /\bkale\b/, cup: 21, bunch: 200 },
  { pattern: /prawns?|shrimp/, cup: 145, item: 12, small: 6, medium: 9, large: 15 },
  { pattern: /chicken thighs?/, item: 135, small: 95, medium: 135, large: 175 },
  { pattern: /chicken (?:legs?|drumsticks?)/, item: 160 },
  { pattern: /chicken wings?/, item: 85 },
  { pattern: /whole chicken|\bchicken\b/, item: 1200 },
  { pattern: /\bsausages?\b/, item: 75 },
  { pattern: /pork chops?/, item: 170 },
  { pattern: /\bwalnuts?\b/, cup: 117, tablespoon: 7.3 },
  { pattern: /\balmonds?\b/, cup: 143, tablespoon: 9 },
  { pattern: /peanuts?/, cup: 146, tablespoon: 9.1 },
  { pattern: /cashews?/, cup: 137, tablespoon: 8.6 },
  { pattern: /pine nuts?/, cup: 135, tablespoon: 8.4 },
  { pattern: /pistachios?/, cup: 123, tablespoon: 7.7 },
  { pattern: /\bmolasses\b|\btreacle\b|golden syrup|maple syrup|sugar syrup/, cup: 337, tablespoon: 21, teaspoon: 7 },
  { pattern: /\bchocolate chips?\b/, cup: 170, tablespoon: 10.6 },
  { pattern: /sesame seeds?|poppy seeds?|fennel seeds?/, cup: 144, tablespoon: 9, teaspoon: 3 },
  { pattern: /\byeast\b/, packet: 7, tablespoon: 9.3, teaspoon: 3.1, item: 7 },
  { pattern: /\bshortening\b/, cup: 205, tablespoon: 12.8, teaspoon: 4.3 },
  { pattern: /\bcardamom\b/, tablespoon: 5.8, teaspoon: 1.9, pod: 0.2, item: 0.2 },
  { pattern: /star anise/, item: 1, pod: 1 },
  { pattern: /\bcloves?\b/, tablespoon: 6.6, teaspoon: 2.2, item: 0.2 },
];

const MASS_TO_GRAMS: Record<string, number> = {
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  g: 1,
  gram: 1,
  grams: 1,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
};

export function normalizeNutritionText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function normalizeMeasureText(value: string) {
  return normalizeNutritionText(value)
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\b(?:tblspn?|tbls|tbsps?|tbs)\b/g, "tbsp")
    .replace(/\b(?:tspn|tsps)\b/g, "tsp")
    .replace(/\bhandfulls?\b/g, "handful")
    .replace(/\bfl\.?\s*oz\b/g, "fluid ounce")
    .replace(/\bmillilitres?\b/g, "milliliter")
    .replace(/\blitres?\b/g, "liter")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalUsdaQuery(rawName: string) {
  const name = normalizeNutritionText(rawName)
    .split(",")[0]
    .trim();
  const rules: Array<[RegExp, string]> = [
    [/rice (?:vermicelli|stick )?noodles?|flat rice noodles?|vermicelli rice noodles?|brown rice noodles?/, "rice noodles dry"],
    [/egg noodles?/, "noodles egg dry"],
    [/udon noodles?/, "noodles japanese cooked"],
    [/\b(?:rigatoni|penne(?: rigate)?|linguine|fettuccine|spaghetti|farfalle|bowtie pasta|paccheri pasta|vermicelli pasta|lasagne sheets?|cannelloni|macaroni|pasta)\b/, "pasta dry unenriched"],
    [/chicken breast/, "chicken breast boneless skinless raw"],
    [/chicken thighs?/, "chicken thigh meat and skin raw"],
    [/chicken (?:legs?|drumsticks?)/, "chicken drumstick meat and skin raw"],
    [/chicken wings?/, "chicken wing meat and skin raw"],
    [/ground beef/, "beef ground 90% lean raw"],
    [/minced beef|lean minced steak/, "beef ground 90% lean raw"],
    [/beef fillet|fillet of steak|beef tenderloin|sirloin steak|skirty steak|flank steak/, "beef tenderloin steak raw"],
    [/shredded meat|mixed beef cuts|\bbeef\b/, "beef chuck raw"],
    [/\bpork\b|minced pork/, "pork loin boneless raw"],
    [/salmon/, "salmon raw"],
    [/red snapper/, "fish snapper raw"],
    [/haddock|hake|cod|white fish/, "fish cod raw"],
    [/prawns?|shrimp/, "crustaceans shrimp raw"],
    [/squid/, "mollusks squid raw"],
    [/egg yolks?/, "egg yolk raw fresh"],
    [/egg whites?/, "egg white raw fresh"],
    [/turkey mince/, "turkey ground raw"],
    [/\bturkey\b/, "turkey whole meat raw"],
    [/\beggs?\b/, "egg whole raw fresh"],
    [/cooked rice/, "rice white cooked"],
    [/brown rice/, "rice brown long grain raw"],
    [/sushi rice|dessert rice|glutinous rice|sticky rice/, "rice white short grain raw"],
    [/basmati rice|jasmine rice|paella rice|\brice\b/, "rice white long grain raw"],
    [/black beans/, "black beans cooked drained"],
    [/butter beans|cannellini beans|haricot beans|white beans/, "beans white cooked"],
    [/chopped tomatoes|canned tomatoes|tinned tomato(?:e?s)?/, "tomatoes canned diced"],
    [/rolled oats/, "oats rolled dry"],
    [/\bnoodles\b/, "pasta dry unenriched"],
    [/corn flour|\bcornstarch\b|\bstarch\b/, "cornstarch"],
    [/wholemeal flour|whole wheat flour|strong wholemeal flour/, "wheat flour whole grain"],
    [/bread flour|strong white flour|strong white bread flour/, "wheat flour bread white enriched"],
    [/rice flour/, "rice flour white"],
    [/almond flour/, "almond flour"],
    [/all[ -]?purpose flour|plain flour|white flour|\bflour\b/, "wheat flour white all purpose enriched"],
    [/self[ -]?raising flour|self[ -]?rising flour/, "wheat flour white all purpose self rising enriched"],
    [/brown sugar/, "sugars brown"],
    [/caster sugar|granulated sugar|golden caster sugar/, "sugar granulated"],
    [/icing sugar|powdered sugar|ground sugar/, "sugar powdered"],
    [/muscovado sugar|demerara sugar|dark brown soft sugar|light brown soft sugar/, "sugars brown"],
    [/almond extract|almond essence/, "almond extract"],
    [/vanilla extract|vanilla bean paste|vanilla essence/, "vanilla extract"],
    [/cinnamon stick/, "spices cinnamon"],
    [/\bcinnamon\b/, "spices cinnamon ground"],
    [/\bnutmeg\b/, "spices nutmeg ground"],
    [/black pepper|peppercorns?|kampot pepper|sichuan pepper|szechuan pepper|^pepper$/, "spices pepper black"],
    [/paprika/, "spices paprika"],
    [/cayenne pepper|chilli powder|chili powder|chilli flakes|chili flakes|dried (?:red )?chillies|pul biber/, "spices pepper red or cayenne"],
    [/birds-eye chillies|habanero pepper|padron peppers?|\bred chill(?:i|ies)\b|\bgreen chilli\b|\bchilli\b/, "peppers hot chili red raw"],
    [/\bcumin\b/, "spices cumin seed"],
    [/coriander seeds?/, "spices coriander seed"],
    [/\bcardamom\b|cardomom/, "spices cardamom"],
    [/turmeric/, "spices turmeric ground"],
    [/allspice/, "spices allspice ground"],
    [/garlic cloves?|minced garlic|\bgarlic\b/, "garlic raw"],
    [/\bcloves?\b/, "spices cloves ground"],
    [/star anise/, "spices anise seed"],
    [/mustard powder|mustard seeds?|ground mustard/, "spices mustard seed ground"],
    [/garam masala|harissa spice|curry powder|cajun|five spice powder|ras el hanout|mixed spice|kabse spice|jerk/, "spices curry powder"],
    [/garlic powder|garlic granules/, "spices garlic powder"],
    [/baking powder/, "leavening agents baking powder"],
    [/bicarbonate of soda/, "leavening agents baking soda"],
    [/\byeast\b/, "yeast baker active dry"],
    [/\bbananas?\b/, "bananas raw"],
    [/cherr(?:y|ies)/, "cherries sweet raw"],
    [/light raisins|\braisins?\b|\bsultanas?\b|\bcurrants?\b/, "raisins"],
    [/clear honey|\bhoney\b/, "honey"],
    [/coconut milk/, "coconut milk canned"],
    [/desiccated coconut|shredded coconut|coconut flakes|\bcoconut\b/, "coconut meat raw"],
    [/olive oil/, "oil olive salad or cooking"],
    [/vegetable oil|\boil\b/, "oil vegetable nfs"],
    [/sunflower oil|rapeseed oil|canola oil|ground nut oil|peanut oil/, "oil vegetable nfs"],
    [/vegetable shortening|\bshortening\b/, "shortening vegetable"],
    [/fajita seasoning/, "seasoning mix dry taco original"],
    [/\bsalt\b/, "salt table"],
    [/wholegrain bread|whole-grain bread/, "bread whole wheat"],
    [/white bread|stale bread|crusty bread|baguette|ciabatta/, "bread white"],
    [/whole-wheat pita/, "pita bread whole wheat"],
    [/flour tortillas?/, "tortilla flour"],
    [/tortillas?/, "tortilla flour"],
    [/cheddar/, "cheese cheddar"],
    [/parmesan|parmigiano-reggiano|pecorino/, "cheese parmesan grated"],
    [/mozzarella/, "cheese mozzarella whole milk"],
    [/\bfeta\b/, "cheese feta"],
    [/\bricotta\b/, "cheese ricotta whole milk"],
    [/mascarpone|cream cheese/, "cheese cream"],
    [/gruy[eè]re/, "cheese gruyere"],
    [/emmental|swiss cheese/, "cheese swiss"],
    [/\bbrie\b/, "cheese brie"],
    [/\bgouda\b/, "cheese gouda"],
    [/goats? cheese/, "cheese goat hard type"],
    [/stilton cheese|bryndza cheese|manchego|västerbottensost cheese|panquehue cheese/, "cheese cheddar"],
    [/greek yogurt/, "yogurt greek plain"],
    [/natural yoghurt|natural yogurt|full fat yogurt|strained yoghurt/, "yogurt plain whole milk"],
    [/heavy cream|double cream|single cream|whipping cream|clotted cream/, "cream heavy"],
    [/creme fraiche|crème fraîche|fromage frais|sour cream/, "cream sour cultured"],
    [/black treacle|treacle|molasses/, "molasses"],
    [/sunflower seed butter/, "sunflower seed butter"],
    [/peanut butter/, "peanut butter smooth"],
    [/almond butter/, "almond butter"],
    [/tahini/, "sesame butter tahini"],
    [/unsalted butter|salted butter|\bbutter\b/, "butter without salt"],
    [/\bmilk\b/, "milk whole"],
    [/low-sodium soy sauce/, "soy sauce low sodium"],
    [/sunflower seed butter/, "sunflower seed butter"],
    [/\bberries\b/, "strawberries raw"],
    [/\bcorn\b/, "corn sweet cooked"],
    [/\bedamame\b/, "soybeans green cooked"],
    [/tofu/, "tofu firm prepared with calcium"],
    [/pinto beans|borlotti beans|haricot beans|cannellini beans|white beans/, "beans white cooked"],
    [/green beans|runner beans/, "beans snap green raw"],
    [/black eyed peas/, "blackeyed peas cooked"],
    [/\bred peppers?\b|red (?:bell )?peppers?/, "peppers sweet red raw"],
    [/\bgreen peppers?\b/, "peppers sweet green raw"],
    [/\byellow peppers?\b/, "peppers sweet yellow raw"],
    [/\baubergines?\b|egg ?plants?/, "eggplant raw"],
    [/\bcourgettes?\b|\bzucchini\b/, "squash summer zucchini raw"],
    [/\bspring onions?\b|\bscallions?\b/, "onions spring raw"],
    [/\bonions?\b/, "onions raw"],
    [/\bshallots?\b|challots?/, "shallots raw"],
    [/\bleeks?\b/, "leeks raw"],
    [/\btomatoes?\b/, "tomatoes red ripe raw"],
    [/\bpotato(?:es)?\b/, "potatoes flesh and skin raw"],
    [/\bcarrots?\b/, "carrots raw"],
    [/\bgarlic\b/, "garlic raw"],
    [/\bginger\b/, "ginger root raw"],
    [/\bparsley\b/, "parsley fresh"],
    [/\bcoriander\b|\bcilantro\b/, "coriander cilantro leaves raw"],
    [/\bbasil\b/, "basil fresh"],
    [/\bthyme\b/, "thyme fresh"],
    [/\brosemary\b/, "rosemary fresh"],
    [/\bspinach\b/, "spinach raw"],
    [/\bcabbage\b/, "cabbage raw"],
    [/\bmushrooms?\b/, "mushrooms white raw"],
    [/\bchickpeas?\b/, "chickpeas cooked"],
    [/\bkidney beans?\b/, "kidney beans cooked"],
    [/\blentils?\b/, "lentils cooked"],
    [/\blemon juice\b/, "lemon juice raw"],
    [/\blime juice\b/, "lime juice raw"],
    [/\bmayonnaise\b/, "mayonnaise regular"],
    [/english mustard|dijon mustard|wholegrain mustard|\bmustard\b/, "mustard prepared yellow"],
    [/\bcornstarch\b|corn flour|\bstarch\b/, "cornstarch"],
    [/cold water|warm water|boiling water|soda water|\bwater\b/, "water bottled"],
    [/chicken stock cubes?|chicken stock/, "soup chicken broth"],
    [/beef stock cubes?|beef stock/, "soup beef broth"],
    [/vegetable stock cubes?|vegetable stock/, "soup vegetable broth"],
    [/fish stock|seafood stock|shrimp stock/, "soup fish broth"],
    [/rice vinegar|white vinegar|cider vinegar|apple cider vinegar|wine vinegar|\bvinegar\b/, "vinegar distilled"],
    [/dry sherry|\bsherry\b|\bmirin\b|shaoxing wine/, "alcoholic beverage wine cooking"],
    [/tomato ketchup/, "catsup"],
    [/tomato sauce/, "tomato sauce canned"],
    [/passata|tomato pur[eé]e|tomato paste/, "tomato paste canned"],
    [/mint/, "spearmint fresh"],
    [/\bsage\b/, "spices sage ground"],
    [/dill/, "dill weed fresh"],
    [/lemongrass/, "lemongrass raw"],
    [/galangal/, "ginger root raw"],
    [/bok choi|pak choi|pak koi/, "cabbage bok choy raw"],
    [/sweetcorn/, "corn sweet cooked"],
    [/beetroot/, "beets raw"],
    [/\brocket\b/, "arugula raw"],
    [/\bswede\b/, "rutabagas raw"],
    [/dijon mustard|wholegrain mustard/, "mustard prepared yellow"],
    [/ground almonds|flaked almonds/, "nuts almonds"],
    [/\balmonds?\b/, "nuts almonds"],
    [/hazlenuts|shelled hazelnuts/, "nuts hazelnuts"],
    [/braeburn apples|bramley apples/, "apples raw"],
    [/unwaxed lemon/, "lemons raw"],
    [/unwaxed lime/, "limes raw"],
    [/hotsauce|hot sauce|tobasco sauce|tabasco sauce|chilli sauce/, "sauce hot chili red"],
    [/soya bean/, "soybeans mature cooked"],
    [/toor dal/, "lentils cooked"],
    [/parma ham|jam[oó]n ib[eé]rico|streaky bacon/, "pork cured ham"],
    [/pilchards/, "fish sardines canned"],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? name;
}

export function parseQuantity(value: string): number | null {
  const normalized = normalizeMeasureText(value)
    .toLowerCase()
    .replace(/¼/g, " 1/4")
    .replace(/½/g, " 1/2")
    .replace(/¾/g, " 3/4")
    .replace(/⅓/g, " 1/3")
    .replace(/⅔/g, " 2/3")
    .trim();
  const quantityPattern = "((?:\\d+\\s+)?\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";
  const match = normalized.match(new RegExp(`^${quantityPattern}`))
    ?? normalized.match(new RegExp(`\\b(?:juice|zest)\\s+of\\s+${quantityPattern}`));
  if (!match) return null;
  return match[1].split(/\s+/).reduce((total, part) => {
    if (!part.includes("/")) return total + Number(part);
    const [numerator, denominator] = part.split("/").map(Number);
    return total + (denominator ? numerator / denominator : 0);
  }, 0);
}

export function resolveIngredientGrams(name: string, measure: string, foodPortions: UsdaFoodPortion[] = []): GramResolution {
  const ingredient = normalizeNutritionText(name);
  const normalizedMeasure = normalizeMeasureText(measure);
  if (/\boptional\b|to taste/.test(`${ingredient} ${normalizedMeasure}`)) {
    return { status: "excluded", reason: "Optional or to-taste ingredient excluded." };
  }
  if (/garnish/.test(normalizedMeasure)) {
    return { status: "excluded", reason: "Unquantified garnish excluded." };
  }
  if (/\bfor frying\b/.test(normalizedMeasure) && /\boil\b/.test(ingredient)) {
    return {
      status: "included",
      grams: 30,
      method: "30 g estimated absorbed frying oil for the whole recipe",
      warning: "Assumed 30 g of frying oil is absorbed by the whole recipe.",
    };
  }

  const packageMass = normalizedMeasure.match(
    /^(\d+(?:\.\d+)?)\s+(?:x\s*)?\(?\s*(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|mg|milligrams?|lb|lbs|pounds?|oz|ounces?)\s*\)?\s*(?:cans?|tins?|tubs?|packs?|packages?|jars?|cartons?)\b/,
  );
  if (packageMass) {
    const count = Number(packageMass[1]);
    const amount = Number(packageMass[2]);
    const grams = count * amount * MASS_TO_GRAMS[packageMass[3]];
    return { status: "included", grams, method: `${measure} converted directly to ${round(grams)} g` };
  }
  const packageVolume = normalizedMeasure.match(
    /^(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(ml|milliliters?|millilitres?)\s*(?:cans?|tins?|tubs?|packs?|packages?|jars?|cartons?)\b/,
  );
  if (packageVolume) {
    const count = Number(packageVolume[1] ?? 1);
    const milliliters = Number(packageVolume[2]);
    const grams = count * milliliters;
    return {
      status: "included",
      grams,
      method: `${measure} interpreted as ${count} × ${milliliters} mL at an estimated 1 g/mL packaged-food density`,
      warning: `Used a 1 g/mL packaged-food density for ${name}.`,
    };
  }
  const quantity = parseQuantity(normalizedMeasure)
    ?? (/\b(?:pinch|handful|bunch|dash|splash|knob|sprig|stalk|leaf|leaves|can|tin|cube|head|pod)\b/.test(normalizedMeasure) ? 1 : null);
  const directMass = normalizedMeasure.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|mg|milligrams?|lb|lbs|pounds?|oz|ounces?)\b/,
  );
  if (directMass) {
    const directQuantity = parseQuantity(directMass[1]);
    const massUnit = directMass[2];
    const grams = (directQuantity ?? 0) * MASS_TO_GRAMS[massUnit];
    return { status: "included", grams, method: `${measure} converted directly to ${round(grams)} g` };
  }
  if (quantity !== null && /\bjuice\s+of\b/.test(normalizedMeasure) && /\blemon\b|\blime\b/.test(ingredient)) {
    const gramsPerFruit = /\blemon\b/.test(ingredient) ? 48 : 30;
    const grams = quantity * gramsPerFruit;
    return { status: "included", grams, method: `${quantity} fruit juice yield`, warning: `Used a typical juice yield for ${name}.` };
  }
  if (quantity !== null && /\bzest\s+of\b/.test(normalizedMeasure) && /\blemon\b|\blime\b|\borange\b/.test(ingredient)) {
    const gramsPerFruit = /\borange\b/.test(ingredient) ? 6 : /\blemon\b/.test(ingredient) ? 3 : 2;
    const grams = quantity * gramsPerFruit;
    return { status: "included", grams, method: `${quantity} fruit zest yield`, warning: `Used a typical zest yield for ${name}.` };
  }

  const profile = RETAIL_PROFILES.find((candidate) => candidate.pattern.test(ingredient));
  const unit = measureUnit(normalizedMeasure);
  if (quantity !== null && profile && unit !== "milliliter" && unit !== "liter" && unit !== "fluidOunce") {
    const gramsPerUnit = profile[unit];
    if (typeof gramsPerUnit === "number") {
      const grams = quantity * gramsPerUnit;
      return {
        status: "included",
        grams,
        method: `${quantity} ${unit} × ${gramsPerUnit} g mobile retail assumption`,
        warning: `Used a typical ${unit} weight for ${name}.`,
      };
    }
  }
  if (quantity !== null && unit === "milliliter" && profile?.cup) {
    const grams = quantity * profile.cup / 236.588;
    return { status: "included", grams, method: `${quantity} mL using ingredient density`, warning: `Used a typical density for ${name}.` };
  }
  if (quantity !== null && unit === "liter" && profile?.cup) {
    const grams = quantity * 1000 * profile.cup / 236.588;
    return { status: "included", grams, method: `${quantity} L using ingredient density`, warning: `Used a typical density for ${name}.` };
  }
  if (quantity !== null && unit === "fluidOunce" && profile?.cup) {
    const grams = quantity * 29.5735 * profile.cup / 236.588;
    return { status: "included", grams, method: `${quantity} fluid ounces using ingredient density`, warning: `Used a typical density for ${name}.` };
  }
  const usdaPortion = quantity === null ? null : resolveUsdaPortion(normalizedMeasure, quantity, unit, foodPortions);
  if (usdaPortion) {
    return {
      status: "included",
      grams: usdaPortion.grams,
      method: usdaPortion.method,
      warning: `Used USDA's portion weight for ${name}.`,
    };
  }
  return { status: "unresolved", reason: `No defensible gram conversion for “${measure} ${name}”.` };
}

export function rankUsdaCandidates(foods: FdcFood[], query: string): UsdaNutrientMatch | null {
  const ranked = foods
    .map((food) => ({ food, nutrients: extractMacros(food), score: scoreFood(food, query) }))
    .filter((candidate): candidate is { food: FdcFood; nutrients: MacroProfile; score: number } => candidate.nutrients !== null && candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.food.fdcId - right.food.fdcId);
  const selected = ranked[0];
  return selected ? {
    fdcId: selected.food.fdcId,
    description: selected.food.description,
    dataType: selected.food.dataType,
    publicationDate: selected.food.publicationDate,
    nutrientsPer100g: selected.nutrients,
    foodPortions: selected.food.foodPortions ?? [],
  } : null;
}

export function estimateServingCount(
  recipe: Pick<{ name: string; mealType: string; description: string; steps?: string[] }, "name" | "mealType" | "description" | "steps">,
  wholeRecipeCalories: number,
  measuredIngredientGrams: number,
) {
  const description = `${recipe.mealType} ${recipe.name} ${recipe.description}`.toLowerCase();
  const isDessert = /dessert|snack/.test(description);
  const explicitYield = parseRecipeYield([recipe.description, ...(recipe.steps ?? [])]);
  if (explicitYield !== null) {
    return {
      count: explicitYield,
      basis: `Used the recipe's stated yield of ${explicitYield} ${explicitYield === 1 ? "serving" : "servings"}.`,
    };
  }

  if (!isDessert && measuredIngredientGrams > 0) {
    const count = Math.min(16, Math.max(1, Math.round(measuredIngredientGrams / 400)));
    return {
      count,
      basis: `Estimated ${count} ${count === 1 ? "serving" : "servings"} from ${Math.round(measuredIngredientGrams)} g of measured ingredients using a typical 400 g meal portion.`,
    };
  }

  if (!isDessert && wholeRecipeCalories > 0) {
    const count = estimateMealServingCount(wholeRecipeCalories);
    const caloriesPerServing = Math.round(wholeRecipeCalories / count);
    return {
      count,
      basis: `Estimated ${count} ${count === 1 ? "serving" : "servings"} from ${Math.round(wholeRecipeCalories)} kcal, targeting 400–700 kcal per meal (about ${caloriesPerServing} kcal each).`,
    };
  }

  const calorieEstimate = wholeRecipeCalories > 0 ? Math.round(wholeRecipeCalories / 350) : 0;
  const weightEstimate = measuredIngredientGrams > 0
    ? Math.round(measuredIngredientGrams / (isDessert ? 125 : 350))
    : 0;
  const count = Math.min(16, Math.max(1, calorieEstimate, weightEstimate));
  return {
    count,
    basis: isDessert
      ? `Estimated ${count} ${count === 1 ? "serving" : "servings"} from ${Math.round(wholeRecipeCalories)} kcal and ${Math.round(measuredIngredientGrams)} g of measured ingredients using a typical dessert serving.`
      : `Estimated ${count} ${count === 1 ? "serving" : "servings"} from ${Math.round(measuredIngredientGrams)} g of measured ingredients because a calorie total was unavailable.`,
  };
}

export function parseRecipeYield(values: string[]) {
  const text = values.join(" ").toLowerCase();
  const patterns = [
    /\bserves?\s*[:=-]?\s*(\d{1,2})\b/,
    /\byields?\s*[:=-]?\s*(\d{1,2})\b/,
    /\bmakes?\s+(\d{1,2})\s+(?:servings?|portions?|pieces?|parcels?|bowls?|plates?)\b/,
  ];
  for (const pattern of patterns) {
    const amount = Number(text.match(pattern)?.[1]);
    if (Number.isInteger(amount) && amount >= 1 && amount <= 32) return amount;
  }
  return null;
}

function estimateMealServingCount(wholeRecipeCalories: number) {
  let bestCount = 1;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let count = 1; count <= 16; count += 1) {
    const caloriesPerServing = wholeRecipeCalories / count;
    const rangePenalty = caloriesPerServing < 400
      ? (400 - caloriesPerServing) * 4
      : caloriesPerServing > 700
        ? (caloriesPerServing - 700) * 4
        : 0;
    const midpointPenalty = Math.abs(caloriesPerServing - 550);
    const penalty = rangePenalty + midpointPenalty;
    if (penalty < bestPenalty) {
      bestCount = count;
      bestPenalty = penalty;
    }
  }

  return bestCount;
}

function measureUnit(measure: string): RetailUnit | "milliliter" | "liter" | "fluidOunce" {
  if (/\b(cups?|c)\b/.test(measure)) return "cup";
  if (/\b(tbsp|tablespoons?)\b/.test(measure)) return "tablespoon";
  if (/\b(tsp|teaspoons?)\b/.test(measure)) return "teaspoon";
  if (/\b(slices?)\b/.test(measure)) return "slice";
  if (/\bpinch(?:es)?\b/.test(measure)) return "pinch";
  if (/\bcloves?\b/.test(measure)) return "clove";
  if (/\bpackets?\b/.test(measure)) return "packet";
  if (/\bhandfuls?\b/.test(measure)) return "handful";
  if (/\bbunch(?:es)?\b/.test(measure)) return "bunch";
  if (/\bsprigs?\b/.test(measure)) return "sprig";
  if (/\bstalks?\b/.test(measure)) return "stalk";
  if (/\bleaves?\b|\bleaf\b/.test(measure)) return "leaf";
  if (/\bcans?\b|\btins?\b/.test(measure)) return "can";
  if (/\bcubes?\b/.test(measure)) return "cube";
  if (/\bdash(?:es)?\b/.test(measure)) return "dash";
  if (/\bsplash(?:es)?\b/.test(measure)) return "splash";
  if (/\bknobs?\b/.test(measure)) return "knob";
  if (/\bheads?\b/.test(measure)) return "head";
  if (/\bpods?\b/.test(measure)) return "pod";
  if (/\bsmall\b/.test(measure)) return "small";
  if (/\bmedium\b/.test(measure)) return "medium";
  if (/\blarge\b/.test(measure)) return "large";
  if (/\bml|milliliters?|millilitres?\b/.test(measure)) return "milliliter";
  if (/\bl|liters?|litres?\b/.test(measure)) return "liter";
  if (/\bfluid ounces?\b/.test(measure)) return "fluidOunce";
  return "item";
}

function resolveUsdaPortion(
  measure: string,
  quantity: number,
  unit: ReturnType<typeof measureUnit>,
  portions: UsdaFoodPortion[],
) {
  const aliases: Record<ReturnType<typeof measureUnit>, string[]> = {
    cup: ["cup"],
    tablespoon: ["tablespoon", "tbsp"],
    teaspoon: ["teaspoon", "tsp"],
    slice: ["slice"],
    pinch: ["pinch"],
    clove: ["clove"],
    packet: ["packet", "package"],
    handful: ["handful"],
    bunch: ["bunch"],
    sprig: ["sprig"],
    stalk: ["stalk"],
    leaf: ["leaf", "leaves"],
    can: ["can", "tin"],
    cube: ["cube"],
    dash: ["dash"],
    splash: ["splash"],
    knob: ["knob"],
    head: ["head"],
    pod: ["pod"],
    small: ["small"],
    medium: ["medium"],
    large: ["large"],
    item: ["each", "item", "whole", "piece"],
    milliliter: ["ml", "milliliter"],
    liter: ["liter"],
    fluidOunce: ["fluid ounce", "fl oz"],
  };
  const candidates = portions.flatMap((portion) => {
    if (!Number.isFinite(portion.gramWeight) || portion.gramWeight <= 0) return [];
    const label = normalizeMeasureText([
      portion.portionDescription,
      portion.modifier,
      portion.unitName,
      portion.unitAbbreviation,
    ].filter(Boolean).join(" "));
    const unitMatch = aliases[unit].some((alias) => label.includes(alias));
    const explicitSize = ["small", "medium", "large"].find((size) => measure.includes(size));
    const sizeMatch = explicitSize ? label.includes(explicitSize) : false;
    const volumeLabel = /\bcup|tablespoon|tbsp|teaspoon|tsp|ml|liter|fluid ounce\b/.test(label);
    let score = unitMatch ? 20 : 0;
    if (sizeMatch) score += 20;
    if (unit === "item" && !volumeLabel && /\beach|item|whole|piece|small|medium|large\b/.test(label)) score += 12;
    if (unit !== "item" && !unitMatch) return [];
    if (unit === "item" && score === 0) return [];
    return [{ portion, label, score }];
  }).sort((left, right) => right.score - left.score || left.portion.gramWeight - right.portion.gramWeight);
  const selected = candidates[0];
  if (!selected) return null;
  const portionAmount = Number.isFinite(selected.portion.amount) && Number(selected.portion.amount) > 0
    ? Number(selected.portion.amount)
    : 1;
  const grams = quantity * selected.portion.gramWeight / portionAmount;
  return {
    grams,
    method: `${quantity} ${unit} using USDA portion “${selected.label || unit}” (${round(selected.portion.gramWeight)} g per ${portionAmount})`,
  };
}

function extractMacros(food: FdcFood): MacroProfile | null {
  const calories = nutrientValue(food, [1008, 2047, 2048, 208], "kcal");
  const protein = nutrientValue(food, [1003], "g");
  const carbs = nutrientValue(food, [1005], "g");
  const fat = nutrientValue(food, [1004], "g");
  if (calories === null || protein === null || carbs === null || fat === null) return null;
  return { calories, protein, carbs, fat };
}

function nutrientValue(food: FdcFood, ids: number[], unit: string): number | null {
  for (const id of ids) {
    const nutrient = food.foodNutrients?.find((item) =>
      Number(item.nutrientId ?? item.nutrientNumber) === id
      && normalizeNutritionText(item.unitName ?? "") === unit
    );
    if (typeof nutrient?.value === "number") return nutrient.value;
  }
  return null;
}

function scoreFood(food: FdcFood, query: string) {
  const description = normalizeNutritionText(food.description);
  const normalizedDescription = description.replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedQuery = normalizeNutritionText(query).replace(/[^a-z0-9]+/g, " ").trim();
  const terms = normalizedQuery.split(/\W+/).filter((term) => term.length > 1);
  const descriptionTerms = new Set(normalizedDescription.split(/\W+/).map(singularToken));
  const matchedTerms = terms.filter((term) => descriptionTerms.has(singularToken(term)));
  const identityTerms = terms.filter((term) => !MATCH_MODIFIERS.has(term));
  const matchedIdentity = identityTerms.filter((term) => descriptionTerms.has(singularToken(term)));
  let score = terms.reduce((total, term) => total + (descriptionTerms.has(singularToken(term)) ? 12 : -8), 0);
  if (description.includes(normalizedQuery)) score += 20;
  if (normalizedDescription === normalizedQuery) score += 50;
  if (food.dataType === "Foundation") score += 8;
  else if (food.dataType === "SR Legacy") score += 6;
  else if (food.dataType.includes("Survey")) score += 3;
  if (/baby food|restaurant|fast food|meal|dish|platter/.test(description)) score -= 15;
  for (const state of ["raw", "cooked", "dry", "dried", "low sodium"]) {
    if (normalizedQuery.includes(state)) score += description.includes(state) ? 8 : -8;
  }
  if (identityTerms.length && matchedIdentity.length / identityTerms.length < 0.5) score -= 80;
  if (identityTerms[0] && !descriptionTerms.has(singularToken(identityTerms[0]))) score -= 45;
  if (!matchedTerms.length) score -= 100;
  for (const [wanted, conflicts] of FOOD_IDENTITY_CONFLICTS) {
    if (terms.includes(wanted) && conflicts.some((term) => descriptionTerms.has(term))) score -= 120;
  }
  return score;
}

const MATCH_MODIFIERS = new Set([
  "and", "or", "with", "without", "nfs", "raw", "cooked", "dry", "dried",
  "fresh", "whole", "ground", "prepared", "unenriched", "enriched", "white",
  "red", "green", "yellow", "low", "sodium", "regular", "plain", "food", "foods",
  "includes", "program", "usda",
]);

const FOOD_IDENTITY_CONFLICTS: Array<[string, string[]]> = [
  ["beef", ["fish", "chicken", "pork", "lamb", "turkey"]],
  ["chicken", ["fish", "beef", "pork", "lamb", "meatless"]],
  ["pork", ["fish", "beef", "chicken", "lamb"]],
  ["lamb", ["fish", "beef", "chicken", "pork"]],
  ["fish", ["beef", "chicken", "pork", "lamb"]],
  ["shrimp", ["beef", "chicken", "pork", "berry", "blueberry"]],
  ["water", ["oil", "convolvulus"]],
  ["vinegar", ["bread", "dressing"]],
  ["pepper", ["rice", "dressing"]],
];

function singularToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("oes") && value.length > 4) return value.slice(0, -2);
  if (value.endsWith("ses") && value.length > 4) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) return value.slice(0, -1);
  return value;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
