"use client";

import { CONSTRAINTS, type ConstraintId } from "@/lib/mock/constraints";
import { ConstraintRow, type ConstraintState } from "./ConstraintRow";

export function ConstraintList({
  states,
  focusedId,
}: {
  states: Record<ConstraintId, ConstraintState>;
  focusedId?: ConstraintId | null;
}) {
  return (
    <div className="space-y-2">
      {CONSTRAINTS.map((c) => (
        <ConstraintRow
          key={c.id}
          label={c.label}
          detail={c.detail}
          state={states[c.id]}
          focused={focusedId === c.id}
        />
      ))}
    </div>
  );
}
