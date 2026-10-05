import { formatDate, localToday } from "@/lib/dates";
import { sourceLabel } from "@/lib/note-source";

/**
 * src/lib/dates.ts and src/lib/note-source.ts — written out across five
 * screens before REFACTOR.md → A. The screens' own tests still check what they
 * render; these pin the helpers so a change of format is one decision.
 */
describe("formatDate", () => {
  test("should show a saved moment as YYYY-MM-DD in the device's own timezone", () => {
    // Noon local time, so no timezone pushes it to another day.
    const noon = new Date(2026, 9, 2, 12, 0, 0).getTime();
    expect(formatDate(noon)).toBe("2026-10-02");
  });
});

describe("localToday", () => {
  test("should be today's local date in the shape the extraction prompt expects", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 2, 23, 30, 0));
    try {
      // 23:30 local is still the 2nd here, whatever UTC says.
      expect(localToday()).toBe("2026-10-02");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("sourceLabel", () => {
  test("should name a saved note's words by where they came from", () => {
    expect(sourceLabel("voice")).toBe("What you said");
    expect(sourceLabel("manual")).toBe("What you wrote");
    expect(sourceLabel("business_card")).toBe("What the card said");
  });

  test("should speak of a card in the present while the note is still a draft", () => {
    expect(sourceLabel("business_card", { draft: true })).toBe("What the card says");
    // A person's own words read the same before and after saving.
    expect(sourceLabel("voice", { draft: true })).toBe("What you said");
    expect(sourceLabel("manual", { draft: true })).toBe("What you wrote");
  });
});
