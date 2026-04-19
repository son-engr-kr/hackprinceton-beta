// Boston-area delivery restaurants — mock catalog that shows up on the
// spending heatmap and in past-order references.

export type DeliveryPlatform = "DoorDash" | "Uber Eats" | "Grubhub" | "Amazon";

export type Restaurant = {
  id: string;
  name: string;
  category: string; // food key from foods.ts
  neighborhood: string;
  platforms: DeliveryPlatform[];
};

export const RESTAURANTS: Record<string, Restaurant> = {
  shake_shack: {
    id: "shake_shack",
    name: "Shake Shack",
    category: "burger",
    neighborhood: "Back Bay",
    platforms: ["DoorDash", "Uber Eats"],
  },
  chipotle: {
    id: "chipotle",
    name: "Chipotle Mexican Grill",
    category: "mexican",
    neighborhood: "Downtown Crossing",
    platforms: ["DoorDash", "Uber Eats"],
  },
  sweetgreen: {
    id: "sweetgreen",
    name: "Sweetgreen",
    category: "italian", // healthy bowl — mapping to pasta-style
    neighborhood: "Seaport",
    platforms: ["DoorDash", "Uber Eats"],
  },
  oath_pizza: {
    id: "oath_pizza",
    name: "Oath Pizza",
    category: "pizza",
    neighborhood: "Back Bay",
    platforms: ["DoorDash", "Grubhub"],
  },
  snappy_ramen: {
    id: "snappy_ramen",
    name: "Snappy Ramen",
    category: "ramen",
    neighborhood: "Chinatown",
    platforms: ["DoorDash", "Uber Eats"],
  },
  mei_mei: {
    id: "mei_mei",
    name: "Mei Mei Street Kitchen",
    category: "chinese",
    neighborhood: "Fenway",
    platforms: ["DoorDash"],
  },
  gong_cha: {
    id: "gong_cha",
    name: "Gong Cha",
    category: "bubble_tea",
    neighborhood: "Allston",
    platforms: ["Uber Eats", "DoorDash"],
  },
  tatte: {
    id: "tatte",
    name: "Tatte Bakery",
    category: "cafe",
    neighborhood: "Back Bay",
    platforms: ["DoorDash"],
  },
  boba_tea_house: {
    id: "boba_tea_house",
    name: "Boba Tea House",
    category: "bubble_tea",
    neighborhood: "Brighton",
    platforms: ["Uber Eats"],
  },
  pokeworks: {
    id: "pokeworks",
    name: "Pokeworks",
    category: "sushi",
    neighborhood: "Back Bay",
    platforms: ["DoorDash", "Uber Eats"],
  },
  annas_taqueria: {
    id: "annas_taqueria",
    name: "Anna's Taqueria",
    category: "mexican",
    neighborhood: "Brookline",
    platforms: ["Uber Eats"],
  },
  dumpling_house: {
    id: "dumpling_house",
    name: "Dumpling House",
    category: "chinese",
    neighborhood: "Cambridge",
    platforms: ["DoorDash", "Grubhub"],
  },
  thai_basil: {
    id: "thai_basil",
    name: "Thai Basil",
    category: "thai",
    neighborhood: "Fenway",
    platforms: ["DoorDash"],
  },
  bostons_best_bbq: {
    id: "bostons_best_bbq",
    name: "K-Town BBQ",
    category: "korean_bbq",
    neighborhood: "Chinatown",
    platforms: ["Uber Eats"],
  },
  popeyes: {
    id: "popeyes",
    name: "Popeyes",
    category: "fried_chicken",
    neighborhood: "Allston",
    platforms: ["DoorDash", "Uber Eats"],
  },
  dunkin: {
    id: "dunkin",
    name: "Dunkin'",
    category: "donut",
    neighborhood: "Downtown Crossing",
    platforms: ["DoorDash"],
  },
  legal_seafood: {
    id: "legal_seafood",
    name: "Legal Sea Foods",
    category: "seafood",
    neighborhood: "Seaport",
    platforms: ["DoorDash"],
  },
};
