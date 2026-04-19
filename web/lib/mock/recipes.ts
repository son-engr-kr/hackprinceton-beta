import type { Macros } from "./foods";
import { INGREDIENTS } from "./ingredients";

export type RecipeIngredient = { key: string; qty: number; unit: string };

export type Recipe = {
  key: string;
  name: string;
  emoji: string;
  cookTime: number;
  calories: number;
  macros: Macros;
  sodium: number;
  servings: number;
  dayOfWeek: number;      // 0 = Mon, 6 = Sun
  ingredients: RecipeIngredient[];
  steps: string[];
  mirrorsFoodKey: string; // the delivery food this 1:1 replaces
  mirrorsOrderHint: string;// "your Jan 12 Chipotle burrito" — shown in UI
  estCost: number;
  tags: string[];         // "15min", "high-protein", "leftover-friendly"
};

export const RECIPES: Record<string, Recipe> = {
  bulgogi_bowl: {
    key: "bulgogi_bowl",
    name: "Beef bulgogi bowl",
    emoji: "🍚",
    cookTime: 25,
    calories: 520,
    macros: { protein: 38, carbs: 58, fat: 18 },
    sodium: 780,
    servings: 2,
    dayOfWeek: 0,
    mirrorsFoodKey: "korean_bbq",
    mirrorsOrderHint: "your Feb 3 K-Town BBQ box ($28.00)",
    estCost: 7.30,
    tags: ["high-protein", "25min"],
    ingredients: [
      { key: "beef",        qty: 0.5, unit: "lb" },
      { key: "rice",        qty: 0.25,unit: "2 lb" },
      { key: "green_onion", qty: 1,   unit: "bunch" },
      { key: "garlic",      qty: 1,   unit: "head" },
      { key: "soy_sauce",   qty: 0.15,unit: "bottle" },
    ],
    steps: [
      "Marinate thin beef in soy, garlic, brown sugar, and sesame oil for 20 min.",
      "Cook rice.",
      "Sear beef in a hot pan for 2 min.",
      "Spoon over rice, top with green onion and sesame seeds.",
    ],
  },
  shrimp_tacos: {
    key: "shrimp_tacos",
    name: "Cilantro-lime shrimp tacos",
    emoji: "🌮",
    cookTime: 20,
    calories: 440,
    macros: { protein: 28, carbs: 44, fat: 16 },
    sodium: 620,
    servings: 3,
    dayOfWeek: 1,
    mirrorsFoodKey: "mexican",
    mirrorsOrderHint: "your Feb 10 Chipotle bowl ($13.99) · repeat × 3",
    estCost: 4.10,
    tags: ["20min", "light"],
    ingredients: [
      { key: "shrimp",      qty: 0.5, unit: "lb" },
      { key: "lettuce",     qty: 0.5, unit: "head" },
      { key: "tomato",      qty: 2,   unit: "each" },
      { key: "lime",        qty: 2,   unit: "each" },
      { key: "cilantro",    qty: 1,   unit: "bunch" },
    ],
    steps: [
      "Toss shrimp with chili powder, garlic, and lime juice.",
      "Sauté 2 min per side until pink.",
      "Char small tortillas briefly.",
      "Fill with shrimp, shredded lettuce, diced tomato, cilantro.",
    ],
  },
  pasta_primavera: {
    key: "pasta_primavera",
    name: "Garlic pasta primavera",
    emoji: "🍝",
    cookTime: 25,
    calories: 510,
    macros: { protein: 18, carbs: 78, fat: 14 },
    sodium: 540,
    servings: 3,
    dayOfWeek: 2,
    mirrorsFoodKey: "pizza",
    mirrorsOrderHint: "your Feb 15 Oath Pizza ($18.50)",
    estCost: 3.20,
    tags: ["25min", "budget"],
    ingredients: [
      { key: "pasta",     qty: 0.5, unit: "box" },
      { key: "tomato",    qty: 3,   unit: "each" },
      { key: "garlic",    qty: 1,   unit: "head" },
      { key: "basil",     qty: 1,   unit: "bunch" },
      { key: "olive_oil", qty: 0.1, unit: "bottle" },
    ],
    steps: [
      "Boil pasta until al dente.",
      "Sauté minced garlic in olive oil; add diced tomato.",
      "Simmer 5 min, stir in torn basil.",
      "Toss with pasta; finish with grated cheese.",
    ],
  },
  chicken_salad: {
    key: "chicken_salad",
    name: "Grilled chicken harvest bowl",
    emoji: "🥗",
    cookTime: 20,
    calories: 420,
    macros: { protein: 38, carbs: 32, fat: 14 },
    sodium: 480,
    servings: 2,
    dayOfWeek: 3,
    mirrorsFoodKey: "italian", // Sweetgreen bowl mirror
    mirrorsOrderHint: "your weekly Sweetgreen harvest bowl ($17.50)",
    estCost: 4.80,
    tags: ["20min", "high-protein", "meal-prep"],
    ingredients: [
      { key: "chicken_breast", qty: 0.5, unit: "lb" },
      { key: "lettuce",        qty: 1,   unit: "head" },
      { key: "tomato",         qty: 2,   unit: "each" },
      { key: "cucumber",       qty: 1,   unit: "each" },
      { key: "olive_oil",      qty: 0.1, unit: "bottle" },
    ],
    steps: [
      "Pat chicken dry, season with salt, pepper, paprika.",
      "Grill 6 min per side until internal 165°F.",
      "Chop lettuce, tomato, cucumber into a bowl.",
      "Slice chicken over salad; drizzle olive oil, squeeze lemon.",
    ],
  },
  veggie_stir_fry: {
    key: "veggie_stir_fry",
    name: "Tofu broccoli stir fry",
    emoji: "🥡",
    cookTime: 15,
    calories: 380,
    macros: { protein: 20, carbs: 42, fat: 15 },
    sodium: 560,
    servings: 2,
    dayOfWeek: 4,
    mirrorsFoodKey: "ramen",
    mirrorsOrderHint: "your Feb 21 Snappy Ramen tonkotsu ($16.75)",
    estCost: 3.50,
    tags: ["15min", "vegan", "busy-day"],
    ingredients: [
      { key: "tofu",        qty: 1, unit: "block" },
      { key: "broccoli",    qty: 1, unit: "head" },
      { key: "carrot",      qty: 2, unit: "each" },
      { key: "soy_sauce",   qty: 0.1, unit: "bottle" },
      { key: "ginger",      qty: 0.25, unit: "root" },
      { key: "green_onion", qty: 1, unit: "bunch" },
    ],
    steps: [
      "Cube tofu, pat dry, pan-fry until golden.",
      "Stir-fry broccoli and carrot in hot oil.",
      "Add ginger, soy sauce, and tofu.",
      "Top with green onion; serve over rice.",
    ],
  },
  salmon_bowl: {
    key: "salmon_bowl",
    name: "Teriyaki salmon bowl",
    emoji: "🍱",
    cookTime: 30,
    calories: 560,
    macros: { protein: 36, carbs: 50, fat: 22 },
    sodium: 690,
    servings: 2,
    dayOfWeek: 5,
    mirrorsFoodKey: "sushi",
    mirrorsOrderHint: "your weekly Pokeworks salmon roll ($22.00)",
    estCost: 6.40,
    tags: ["30min", "omega-3"],
    ingredients: [
      { key: "salmon",      qty: 0.5, unit: "lb" },
      { key: "quinoa",      qty: 0.25,unit: "bag" },
      { key: "avocado",     qty: 1,   unit: "each" },
      { key: "cucumber",    qty: 1,   unit: "each" },
      { key: "soy_sauce",   qty: 0.1, unit: "bottle" },
    ],
    steps: [
      "Cook quinoa per package directions.",
      "Pan-sear salmon 4 min per side.",
      "Slice avocado and cucumber.",
      "Assemble bowl; drizzle teriyaki.",
    ],
  },
  avocado_toast: {
    key: "avocado_toast",
    name: "Avocado egg toast",
    emoji: "🥑",
    cookTime: 10,
    calories: 340,
    macros: { protein: 14, carbs: 30, fat: 18 },
    sodium: 320,
    servings: 1,
    dayOfWeek: 6,
    mirrorsFoodKey: "bubble_tea",
    mirrorsOrderHint: "swap one of your 2x/week bubble tea runs",
    estCost: 2.20,
    tags: ["10min", "breakfast"],
    ingredients: [
      { key: "bread",   qty: 2,   unit: "slice" },
      { key: "avocado", qty: 1,   unit: "each" },
      { key: "egg",     qty: 2,   unit: "each" },
      { key: "lemon",   qty: 0.5, unit: "each" },
    ],
    steps: [
      "Toast bread.",
      "Mash avocado with lemon, salt, pepper.",
      "Fry eggs sunny side up.",
      "Spread avocado; top with egg.",
    ],
  },
  oatmeal_bowl: {
    key: "oatmeal_bowl",
    name: "Berry oatmeal bowl",
    emoji: "🥣",
    cookTime: 10,
    calories: 360,
    macros: { protein: 12, carbs: 62, fat: 6 },
    sodium: 140,
    servings: 1,
    dayOfWeek: 0,
    mirrorsFoodKey: "cafe",
    mirrorsOrderHint: "swap your Tatte morning pastry runs",
    estCost: 1.80,
    tags: ["10min", "breakfast", "budget"],
    ingredients: [
      { key: "oats",    qty: 0.2, unit: "bag" },
      { key: "milk",    qty: 0.1, unit: "gallon" },
      { key: "berries", qty: 0.5, unit: "pint" },
      { key: "banana",  qty: 1,   unit: "each" },
    ],
    steps: [
      "Simmer oats in milk for 5 min.",
      "Top with sliced banana and berries.",
      "Drizzle honey or maple if desired.",
    ],
  },
  egg_fried_rice: {
    key: "egg_fried_rice",
    name: "Pantry egg fried rice",
    emoji: "🍳",
    cookTime: 15,
    calories: 470,
    macros: { protein: 18, carbs: 66, fat: 14 },
    sodium: 720,
    servings: 2,
    dayOfWeek: 1,
    mirrorsFoodKey: "chinese",
    mirrorsOrderHint: "swap a Dumpling House order ($14.50)",
    estCost: 2.60,
    tags: ["15min", "pantry-friendly", "leftover-friendly"],
    ingredients: [
      { key: "rice",        qty: 0.25, unit: "2 lb" },
      { key: "egg",         qty: 3,    unit: "each" },
      { key: "green_onion", qty: 1,    unit: "bunch" },
      { key: "soy_sauce",   qty: 0.1,  unit: "bottle" },
      { key: "garlic",      qty: 0.5,  unit: "head" },
    ],
    steps: [
      "Cook rice; spread on a tray to cool (or use leftover).",
      "Scramble eggs with minced garlic.",
      "Toss rice into hot wok with soy sauce.",
      "Fold in eggs and green onion; serve.",
    ],
  },
  miso_ramen_bowl: {
    key: "miso_ramen_bowl",
    name: "Miso ramen bowl",
    emoji: "🍜",
    cookTime: 20,
    calories: 510,
    macros: { protein: 24, carbs: 58, fat: 18 },
    sodium: 1120,
    servings: 2,
    dayOfWeek: 4,
    mirrorsFoodKey: "ramen",
    mirrorsOrderHint: "swap a Snappy Ramen tonkotsu ($16.75)",
    estCost: 3.40,
    tags: ["20min", "comfort"],
    ingredients: [
      { key: "pasta",       qty: 0.4, unit: "box" },
      { key: "egg",         qty: 2,   unit: "each" },
      { key: "tofu",        qty: 0.5, unit: "block" },
      { key: "green_onion", qty: 1,   unit: "bunch" },
      { key: "soy_sauce",   qty: 0.1, unit: "bottle" },
      { key: "ginger",      qty: 0.25,unit: "root" },
    ],
    steps: [
      "Simmer broth with miso, soy, ginger.",
      "Cook noodles separately.",
      "Soft-boil eggs 6 min.",
      "Assemble bowls with noodles, broth, tofu, egg, green onion.",
    ],
  },
};

export const RECIPE_KEYS = Object.keys(RECIPES);

// The 5 recipes K2 actually commits in the demo plan (Wed/Thu skipped for
// calendar conflicts). Keep this in sync with the SSE plan in
// `lib/k2/prompt.ts` / the canonical demo trace — extract / cart stages
// derive their cart contents from this list, not from `weeklyPlan()`.
export const K2_CHOSEN_RECIPE_KEYS: readonly string[] = [
  "shrimp_tacos",
  "chicken_salad",
  "salmon_bowl",
  "avocado_toast",
  "veggie_stir_fry",
];

export function chosenRecipes(): Recipe[] {
  return K2_CHOSEN_RECIPE_KEYS
    .map((k) => RECIPES[k])
    .filter((r): r is Recipe => !!r);
}

export function weeklyPlan(): Recipe[] {
  return Object.values(RECIPES).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export type CartLine = {
  ingredientKey: string;
  name: string;
  emoji: string;
  qty: number;
  unit: string;
  cost: number;
  category: string;
};

export function weeklyCart(): CartLine[] {
  return cartFromRecipes(chosenRecipes());
}

export function cartFromRecipes(recipes: Recipe[]): CartLine[] {
  const agg = new Map<string, { qty: number; unit: string }>();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const cur = agg.get(ing.key);
      if (cur) cur.qty += ing.qty;
      else agg.set(ing.key, { qty: ing.qty, unit: ing.unit });
    }
  }
  const lines: CartLine[] = [];
  for (const [key, { qty, unit }] of agg) {
    const ing = INGREDIENTS[key];
    if (!ing) continue;
    const roundedQty = Math.ceil(qty);
    lines.push({
      ingredientKey: key,
      name: ing.name,
      emoji: ing.emoji,
      qty: roundedQty,
      unit,
      cost: roundedQty * ing.unitPrice,
      category: ing.category,
    });
  }
  return lines.sort((a, b) => {
    // Group by category, then by cost desc
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.cost - a.cost;
  });
}
