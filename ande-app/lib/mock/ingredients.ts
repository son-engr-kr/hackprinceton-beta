export type IngredientCategory = "produce" | "protein" | "dairy" | "grain" | "pantry";

export type Ingredient = {
  key: string;
  name: string;
  emoji: string;
  category: IngredientCategory;
  unitPrice: number;
  unit: string;
};

export const INGREDIENTS: Record<string, Ingredient> = {
  tomato:        { key: "tomato",        name: "Tomato",        emoji: "🍅", category: "produce", unitPrice: 0.89, unit: "each" },
  onion:         { key: "onion",         name: "Onion",         emoji: "🧅", category: "produce", unitPrice: 0.65, unit: "each" },
  garlic:        { key: "garlic",        name: "Garlic",        emoji: "🧄", category: "produce", unitPrice: 0.50, unit: "head" },
  bell_pepper:   { key: "bell_pepper",   name: "Bell pepper",   emoji: "🫑", category: "produce", unitPrice: 1.29, unit: "each" },
  carrot:        { key: "carrot",        name: "Carrot",        emoji: "🥕", category: "produce", unitPrice: 0.45, unit: "each" },
  potato:        { key: "potato",        name: "Potato",        emoji: "🥔", category: "produce", unitPrice: 0.75, unit: "each" },
  lettuce:       { key: "lettuce",       name: "Lettuce",       emoji: "🥬", category: "produce", unitPrice: 2.99, unit: "head" },
  cucumber:      { key: "cucumber",      name: "Cucumber",      emoji: "🥒", category: "produce", unitPrice: 0.99, unit: "each" },
  broccoli:      { key: "broccoli",      name: "Broccoli",      emoji: "🥦", category: "produce", unitPrice: 2.49, unit: "head" },
  mushroom:      { key: "mushroom",      name: "Mushrooms",     emoji: "🍄", category: "produce", unitPrice: 2.79, unit: "8 oz" },
  spinach:       { key: "spinach",       name: "Spinach",       emoji: "🌿", category: "produce", unitPrice: 3.49, unit: "bag" },
  avocado:       { key: "avocado",       name: "Avocado",       emoji: "🥑", category: "produce", unitPrice: 1.99, unit: "each" },
  lemon:         { key: "lemon",         name: "Lemon",         emoji: "🍋", category: "produce", unitPrice: 0.79, unit: "each" },
  lime:          { key: "lime",          name: "Lime",          emoji: "🟢", category: "produce", unitPrice: 0.59, unit: "each" },
  ginger:        { key: "ginger",        name: "Ginger",        emoji: "🫚", category: "produce", unitPrice: 1.99, unit: "root" },
  green_onion:   { key: "green_onion",   name: "Green onion",   emoji: "🌱", category: "produce", unitPrice: 0.99, unit: "bunch" },
  cilantro:      { key: "cilantro",      name: "Cilantro",      emoji: "🌿", category: "produce", unitPrice: 1.49, unit: "bunch" },
  basil:         { key: "basil",         name: "Basil",         emoji: "🌿", category: "produce", unitPrice: 2.99, unit: "bunch" },
  berries:       { key: "berries",       name: "Mixed berries", emoji: "🫐", category: "produce", unitPrice: 4.99, unit: "pint" },
  banana:        { key: "banana",        name: "Banana",        emoji: "🍌", category: "produce", unitPrice: 0.29, unit: "each" },

  egg:           { key: "egg",           name: "Eggs",          emoji: "🥚", category: "dairy",   unitPrice: 4.99, unit: "dozen" },
  milk:          { key: "milk",          name: "Milk",          emoji: "🥛", category: "dairy",   unitPrice: 3.99, unit: "gallon" },
  cheese:        { key: "cheese",        name: "Cheese",        emoji: "🧀", category: "dairy",   unitPrice: 4.49, unit: "8 oz" },
  butter:        { key: "butter",        name: "Butter",        emoji: "🧈", category: "dairy",   unitPrice: 4.99, unit: "stick" },
  yogurt:        { key: "yogurt",        name: "Greek yogurt",  emoji: "🥣", category: "dairy",   unitPrice: 5.49, unit: "tub" },

  beef:          { key: "beef",          name: "Beef",          emoji: "🥩", category: "protein", unitPrice: 8.99, unit: "lb" },
  chicken_breast:{ key: "chicken_breast",name: "Chicken breast",emoji: "🍗", category: "protein", unitPrice: 5.99, unit: "lb" },
  pork:          { key: "pork",          name: "Pork",          emoji: "🥓", category: "protein", unitPrice: 6.99, unit: "lb" },
  shrimp:        { key: "shrimp",        name: "Shrimp",        emoji: "🦐", category: "protein", unitPrice: 12.99,unit: "lb" },
  salmon:        { key: "salmon",        name: "Salmon",        emoji: "🐟", category: "protein", unitPrice: 14.99,unit: "lb" },
  tofu:          { key: "tofu",          name: "Tofu",          emoji: "⬜", category: "protein", unitPrice: 2.99, unit: "block" },

  rice:          { key: "rice",          name: "Rice",          emoji: "🍚", category: "grain",   unitPrice: 5.99, unit: "2 lb" },
  pasta:         { key: "pasta",         name: "Pasta",         emoji: "🍝", category: "grain",   unitPrice: 2.49, unit: "box" },
  bread:         { key: "bread",         name: "Bread",         emoji: "🍞", category: "grain",   unitPrice: 3.99, unit: "loaf" },
  quinoa:        { key: "quinoa",        name: "Quinoa",        emoji: "🌾", category: "grain",   unitPrice: 6.99, unit: "bag" },
  oats:          { key: "oats",          name: "Oats",          emoji: "🌾", category: "grain",   unitPrice: 4.49, unit: "bag" },

  olive_oil:     { key: "olive_oil",     name: "Olive oil",     emoji: "🫒", category: "pantry",  unitPrice: 8.99, unit: "bottle" },
  soy_sauce:     { key: "soy_sauce",     name: "Soy sauce",     emoji: "🍶", category: "pantry",  unitPrice: 3.49, unit: "bottle" },
};

export const INGREDIENT_KEYS = Object.keys(INGREDIENTS);
