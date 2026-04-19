"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MascotPose = "wave" | "jump" | "thinking" | "shopping" | "cooking" | "sleeping";

export type PlanStatus = "never" | "generating" | "ready";
export type CartStatus = "empty" | "draft" | "confirmed";

type AndeStore = {
  // Onboarding
  onboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
  goal: "weight_loss" | "healthy" | "save_money" | "all";
  setGoal: (g: AndeStore["goal"]) => void;
  dietary: string[]; // "vegetarian" | "nut_allergy" | ...
  setDietary: (d: string[]) => void;

  // Plan
  planStatus: PlanStatus;
  setPlanStatus: (s: PlanStatus) => void;
  reasoningIndex: number;
  setReasoningIndex: (n: number) => void;

  // Cart
  cartStatus: CartStatus;
  setCartStatus: (s: CartStatus) => void;

  // Adherence
  eatenRecipeKeys: string[]; // arrays serialize better than Sets
  toggleEaten: (k: string) => void;

  // Model toggle (K2 vs Gemma)
  planModel: "k2" | "gemma";
  setPlanModel: (m: AndeStore["planModel"]) => void;

  // Mascot
  mascotPose: MascotPose;
  setMascotPose: (p: MascotPose) => void;
};

export const useAndeStore = create<AndeStore>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
      goal: "healthy",
      setGoal: (g) => set({ goal: g }),
      dietary: [],
      setDietary: (d) => set({ dietary: d }),

      planStatus: "never",
      setPlanStatus: (s) => set({ planStatus: s }),
      reasoningIndex: 0,
      setReasoningIndex: (n) => set({ reasoningIndex: n }),

      cartStatus: "empty",
      setCartStatus: (s) => set({ cartStatus: s }),

      eatenRecipeKeys: [],
      toggleEaten: (k) =>
        set((state) => ({
          eatenRecipeKeys: state.eatenRecipeKeys.includes(k)
            ? state.eatenRecipeKeys.filter((x) => x !== k)
            : [...state.eatenRecipeKeys, k],
        })),

      planModel: "k2",
      setPlanModel: (m) => set({ planModel: m }),

      mascotPose: "wave",
      setMascotPose: (p) => set({ mascotPose: p }),
    }),
    {
      name: "ande-store",
      // Don't persist transient state like reasoningIndex / mascotPose.
      // cartStatus is also intentionally excluded: a stale "confirmed" from
      // a previous demo run would make the Order button look already-placed
      // on fresh loads, which confuses the flow. Each session starts empty.
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        goal: state.goal,
        dietary: state.dietary,
        planStatus: state.planStatus,
        eatenRecipeKeys: state.eatenRecipeKeys,
        planModel: state.planModel,
      }),
    },
  ),
);
