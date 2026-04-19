import Sidebar from "@/components/Sidebar";
import OnboardingGate from "@/components/OnboardingGate";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </OnboardingGate>
  );
}
