# ande-app

Mock demo app for **ande** — delivery-food tracker → ingredient breakdown →
auto-grocery → weekly meal planner. Everything is fully mocked; no real
Knot / SMS / grocery integrations.

## Run

```bash
cd ande-app
npm install
npm run dev     # http://localhost:3000
```

## Images

Images come from `ande-image-gen/`. Once you've generated them, symlink:

```bash
ln -s ../../ande-image-gen/images public/images
```

Until images exist the UI falls back to emoji — it still looks fine for demo.

## Layout

```
app/
  layout.tsx        — html shell, fonts, metadata
  page.tsx          — stacks six scroll sections + fixed mascot
  globals.css       — tailwind + theme vars
components/
  Mascot.tsx        — fixed-position mascot with scroll-aware pose
  sections/
    Hero.tsx
    MonthlyReview.tsx        (1) this month's delivery review
    IngredientBreakdown.tsx  (2) ingredient breakdown
    GroceryCart.tsx          (3) auto-built grocery cart
    MealPlan.tsx             (4) next week's meal planning
    HealthStats.tsx          (5) health + savings stats
lib/
  mock/             — delivery-history, ingredients, recipes
  store.ts          — zustand (selectedFoodId, eatenMealIds, ...)
  utils.ts          — cn()
```

## Stack

- Next.js 15 (app router) + React 19 + TypeScript
- Tailwind CSS 3.4 (custom palette — see `tailwind.config.ts`)
- Framer Motion 11 for animation
- Zustand 5 for cross-section state

## What's missing (by design — iterate on this)

Each section currently renders data and basic styling. Animation polish to add:
1. MonthlyReview — calendar grid stagger-drop
2. IngredientBreakdown — particle burst from selected food
3. GroceryCart — cart fill tween + price counter
4. MealPlan — flip-card grid + recipe modal
5. HealthStats — bar chart grow-in + savings stack
