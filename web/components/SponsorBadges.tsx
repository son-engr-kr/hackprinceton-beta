"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Hackathon sponsors that power this app. Each pill lights up on the pipeline
// stage where that sponsor's tech is actually used.
export type SponsorKey = "knot" | "k2" | "gemma";

type SponsorMeta = {
  key: SponsorKey;
  label: string;
  tagline: string;
  image: string;       // path under /public
  color: string;       // pill background tint
  text: string;        // pill text color
  glyph: string;       // fallback mark when image fails
};

const SPONSORS: Record<SponsorKey, SponsorMeta> = {
  knot: {
    key: "knot",
    label: "Knot",
    tagline: "TransactionLink · AgenticShopping",
    image: "/sponsors/KnotAPI_Logo.jpg",
    color: "bg-white",
    text: "text-charcoal",
    glyph: "⛓",
  },
  k2: {
    key: "k2",
    label: "K2 Think V2",
    tagline: "MBZUAI · reasoning_effort high",
    image: "/sponsors/k2v2-2.png",
    color: "bg-white",
    text: "text-charcoal",
    glyph: "K2",
  },
  gemma: {
    key: "gemma",
    label: "Gemma 4",
    tagline: "Google · vision model",
    image: "/sponsors/gemma4.jpeg",
    color: "bg-white",
    text: "text-charcoal",
    glyph: "G",
  },
};

// Stage → sponsors that light up on that stage
export const STAGE_SPONSORS: Record<string, SponsorKey[]> = {
  intro:       ["knot", "k2", "gemma"],
  history:     ["knot"],
  cluster:     ["knot", "k2"],
  ingredients: ["knot", "k2"],
  matching:    ["k2", "gemma"],
  cart:        ["knot", "k2"],
};

type Size = "sm" | "md" | "lg";

export function SponsorBadge({
  sponsor,
  active = false,
  size = "md",
}: {
  sponsor: SponsorKey;
  active?: boolean;
  size?: Size;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = SPONSORS[sponsor];
  const padding = size === "sm" ? "px-3 py-1.5" : size === "lg" ? "px-4 py-2.5" : "px-3.5 py-2";
  const textSize = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  const iconSize = size === "sm" ? 20 : size === "lg" ? 32 : 26;

  return (
    <motion.div
      animate={{
        scale: active ? 1.06 : 1,
        opacity: active ? 1 : 0.55,
        y: active ? -1 : 0,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold chunky whitespace-nowrap",
        padding,
        textSize,
        meta.color,
        meta.text,
        active && "shadow-pop",
      )}
      title={`${meta.label} · ${meta.tagline}`}
    >
      {!imgFailed ? (
        <img
          src={meta.image}
          alt=""
          height={iconSize}
          onError={() => setImgFailed(true)}
          className="shrink-0"
          style={{ height: iconSize, width: "auto", objectFit: "contain" }}
        />
      ) : (
        <span
          className="font-mono font-bold leading-none"
          style={{ fontSize: iconSize * 0.8 }}
        >
          {meta.glyph}
        </span>
      )}
      <span>{meta.label}</span>
    </motion.div>
  );
}

export function SponsorRow({
  sponsors,
  activeSet,
  size = "md",
  className = "",
}: {
  sponsors: SponsorKey[];
  activeSet?: Set<SponsorKey>;
  size?: Size;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
      {sponsors.map((k) => (
        <SponsorBadge
          key={k}
          sponsor={k}
          active={activeSet?.has(k) ?? true}
          size={size}
        />
      ))}
    </div>
  );
}

// Small "Powered by ___" caption — used under hero elements
export function PoweredBy({ sponsors }: { sponsors: SponsorKey[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-charcoal/40">
        Powered by
      </span>
      <SponsorRow sponsors={sponsors} size="sm" />
    </div>
  );
}
