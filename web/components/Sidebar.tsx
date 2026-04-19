"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  ShoppingCart,
  MessageCircle,
  Clock,
  TrendingUp,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/",          label: "Home",            icon: LayoutDashboard },
  { href: "/plan",      label: "This week's plan", icon: CalendarDays },
  { href: "/cart",      label: "Cart",            icon: ShoppingCart },
  { href: "/chat",      label: "Today's check-in", icon: MessageCircle },
  { href: "/history",   label: "Order history",   icon: Clock },
  { href: "/impact",    label: "Impact",          icon: TrendingUp },
  { href: "/settings",  label: "Settings",        icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col border-r border-charcoal/10 bg-white/50 backdrop-blur-sm">
      <div className="px-5 pt-6 pb-4">
        <div className="text-xl font-black leading-tight tracking-tight text-charcoal">Flanner.health</div>
        <div className="text-[11px] text-charcoal/50 leading-tight mt-0.5">a mirror on your delivery habits</div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                active
                  ? "bg-hotpink text-cream"
                  : "text-charcoal/70 hover:bg-charcoal/5 hover:text-charcoal",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-charcoal/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-lavender chunky flex items-center justify-center text-xs font-bold">
            HY
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">hylbert</div>
            <div className="text-[10px] text-charcoal/50">Knot · Amazon Fresh</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-mint" title="Connected" />
        </div>
      </div>
    </aside>
  );
}
