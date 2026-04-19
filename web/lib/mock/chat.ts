// Mock Gemma 4 chat scripts for daily check-in. Runs locally (per refined-flow),
// so no API call modeled — just typing-animation cadence from the UI.

export type ChatTurn = {
  role: "gemma" | "user";
  text: string;
  choices?: string[];  // present for gemma turns that expect a canned reply
};

export const DAILY_CHECKIN_SCRIPT: ChatTurn[] = [
  { role: "gemma", text: "Did you end up making the **beef bulgogi bowl** you had planned yesterday?", choices: ["Yes, it was amazing", "Nope, ran out of time", "Got delivery instead 😅"] },
  { role: "user",  text: "Yes, it was amazing" },
  { role: "gemma", text: "Nice! Updated your pantry — 2 servings rice and 1 serving bulgogi beef left over. Want to reuse them tonight?" },
  { role: "user",  text: "Yeah, sounds good" },
  { role: "gemma", text: "Tonight's menu: **bulgogi rice bowl (leftover)** — 10 minutes, no extra salt. Skip one Sweetgreen and you save another $17.50 this week. 🎯" },
  { role: "gemma", text: "Heads up: you hit Chipotle 18 times last month lol. Clear **3 home burrito bowls** this week and mission accomplished.", choices: ["Challenge accepted", "Ping me tomorrow too"] },
];

export const PAST_CHECKINS = [
  { date: "2026-04-17", gemma: "Wed tonkotsu ramen?", user: "Yes", adherence: true  },
  { date: "2026-04-16", gemma: "Tue shrimp tacos?",   user: "No, takeout",  adherence: false },
  { date: "2026-04-15", gemma: "Mon bulgogi bowl?",   user: "Yes", adherence: true  },
  { date: "2026-04-14", gemma: "Sun avo toast?",      user: "Yes", adherence: true  },
  { date: "2026-04-13", gemma: "Sat salmon bowl?",    user: "Yes", adherence: true  },
];
