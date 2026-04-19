// Mock Google Calendar feed for the upcoming week — drives the "skip
// Wednesday because of work dinner" logic in the K2 reasoning trace.

export type CalendarEvent = {
  id: string;
  dayOfWeek: number; // 0 = Mon, 6 = Sun
  time: string;      // "19:00"
  title: string;
  impact: "skip_dinner" | "late_night" | "none";
};

export const UPCOMING_EVENTS: CalendarEvent[] = [
  { id: "e1", dayOfWeek: 2, time: "19:00", title: "Team dinner @ Row 34",          impact: "skip_dinner" },
  { id: "e2", dayOfWeek: 3, time: "17:30", title: "Conference reception",           impact: "skip_dinner" },
  { id: "e3", dayOfWeek: 1, time: "20:00", title: "Late standup — launch prep",     impact: "late_night" },
  { id: "e4", dayOfWeek: 5, time: "11:00", title: "Brunch with Alex",               impact: "none" },
];

export function eventsForDay(day: number): CalendarEvent[] {
  return UPCOMING_EVENTS.filter((e) => e.dayOfWeek === day);
}
