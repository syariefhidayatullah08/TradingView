"use client";

import { MOOD, WHY, type Mood, type Why } from "@/lib/positions";

// Journal questions asked when a buy is recorded.
export default function JournalFields({
  why,
  mood,
  onWhy,
  onMood,
}: {
  why?: Why;
  mood?: Mood;
  onWhy?: (w: Why) => void;
  onMood: (m: Mood) => void;
}) {
  return (
    <>
      {onWhy && (
        <label className="text-[11px] text-muted">
          Alasan beli (jurnal)
          <select
            value={why ?? ""}
            onChange={(e) => onWhy(e.target.value as Why)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
          >
            <option value="" disabled>
              Pilih…
            </option>
            {Object.entries(WHY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-[11px] text-muted">
        Perasaan saat beli (jurnal)
        <select
          value={mood ?? ""}
          onChange={(e) => onMood(e.target.value as Mood)}
          className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-fg"
        >
          <option value="" disabled>
            Pilih…
          </option>
          {Object.entries(MOOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
