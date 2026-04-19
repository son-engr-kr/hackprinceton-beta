"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAndeStore } from "@/lib/store";

/**
 * Client-side redirect: if onboarding isn't complete, bounce to /onboarding.
 * Wrapped around app shell so every sidebar route is gated.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const onboardingComplete = useAndeStore((s) => s.onboardingComplete);

  // Wait for zustand/persist hydration before making routing decisions
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!onboardingComplete && !pathname.startsWith("/onboarding")) {
      router.replace("/onboarding");
    }
  }, [hydrated, onboardingComplete, pathname, router]);

  if (!hydrated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-sm text-charcoal/40">Loading…</div>
      </div>
    );
  }
  if (!onboardingComplete) return null;
  return <>{children}</>;
}
