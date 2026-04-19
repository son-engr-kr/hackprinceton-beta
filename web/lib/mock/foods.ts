// Delivery food catalog — expanded with sodium, fiber, and more realistic
// macros for the Flanner health comparison.

export type Macros = { protein: number; carbs: number; fat: number };

export type DeliveryFood = {
  key: string;
  name: string;
  emoji: string;
  price: number;
  calories: number;
  macros: Macros;
  sodium: number; // mg
  ingredients: string[];
};

export const FOODS: Record<string, DeliveryFood> = {
  burger: {
    key: "burger", name: "Cheeseburger + fries", emoji: "🍔",
    price: 14.99, calories: 980, macros: { protein: 38, carbs: 82, fat: 52 },
    sodium: 1850,
    ingredients: ["beef", "cheese", "bread", "lettuce", "tomato", "onion"],
  },
  pizza: {
    key: "pizza", name: "Pepperoni pizza", emoji: "🍕",
    price: 18.50, calories: 1120, macros: { protein: 44, carbs: 108, fat: 48 },
    sodium: 2340,
    ingredients: ["tomato", "cheese", "pork", "basil"],
  },
  sushi: {
    key: "sushi", name: "Salmon sushi roll", emoji: "🍣",
    price: 22.00, calories: 620, macros: { protein: 32, carbs: 82, fat: 16 },
    sodium: 1420,
    ingredients: ["salmon", "rice", "cucumber", "soy_sauce"],
  },
  ramen: {
    key: "ramen", name: "Tonkotsu ramen", emoji: "🍜",
    price: 16.75, calories: 760, macros: { protein: 34, carbs: 88, fat: 30 },
    sodium: 2180,
    ingredients: ["pasta", "egg", "green_onion", "pork"],
  },
  mexican: {
    key: "mexican", name: "Burrito bowl", emoji: "🌮",
    price: 13.99, calories: 860, macros: { protein: 40, carbs: 92, fat: 30 },
    sodium: 1760,
    ingredients: ["beef", "cheese", "rice", "tomato", "cilantro", "lime"],
  },
  italian: {
    key: "italian", name: "Harvest bowl", emoji: "🥗",
    price: 17.50, calories: 710, macros: { protein: 22, carbs: 95, fat: 24 },
    sodium: 1240,
    ingredients: ["pasta", "tomato", "garlic", "basil", "olive_oil"],
  },
  korean_bbq: {
    key: "korean_bbq", name: "Korean BBQ box", emoji: "🥩",
    price: 28.00, calories: 1080, macros: { protein: 56, carbs: 72, fat: 58 },
    sodium: 2920,
    ingredients: ["beef", "green_onion", "soy_sauce", "garlic", "rice"],
  },
  bubble_tea: {
    key: "bubble_tea", name: "Brown sugar milk tea", emoji: "🧋",
    price: 6.50, calories: 440, macros: { protein: 6, carbs: 88, fat: 8 },
    sodium: 180,
    ingredients: ["milk"],
  },
  fried_chicken: {
    key: "fried_chicken", name: "Fried chicken combo", emoji: "🍗",
    price: 19.99, calories: 1240, macros: { protein: 52, carbs: 86, fat: 62 },
    sodium: 2680,
    ingredients: ["chicken_breast", "olive_oil"],
  },
  thai: {
    key: "thai", name: "Shrimp curry", emoji: "🍛",
    price: 19.25, calories: 820, macros: { protein: 36, carbs: 72, fat: 38 },
    sodium: 1920,
    ingredients: ["shrimp", "rice", "lime", "cilantro", "ginger"],
  },
  cafe: {
    key: "cafe", name: "Latte + croissant", emoji: "☕",
    price: 9.75, calories: 520, macros: { protein: 10, carbs: 62, fat: 28 },
    sodium: 420,
    ingredients: ["milk", "butter", "bread"],
  },
  seafood: {
    key: "seafood", name: "Fish & chips", emoji: "🐟",
    price: 24.00, calories: 1050, macros: { protein: 42, carbs: 90, fat: 48 },
    sodium: 1640,
    ingredients: ["salmon", "potato"],
  },
  donut: {
    key: "donut", name: "Dozen donuts", emoji: "🍩",
    price: 14.50, calories: 3120, macros: { protein: 36, carbs: 420, fat: 144 },
    sodium: 2040,
    ingredients: ["egg", "milk", "butter"],
  },
};

export const FOOD_KEYS = Object.keys(FOODS);
