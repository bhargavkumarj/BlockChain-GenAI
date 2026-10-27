import { describe, expect, it } from "vitest";
import { describeWindow, formatAmount, formatDuration, percent, roman, shortAddress, toUnits } from "./format";

describe("format", () => {
  it("sets agreement numbers in Roman numerals", () => {
    expect(roman(1)).toBe("I");
    expect(roman(4)).toBe("IV");
    expect(roman(42)).toBe("XLII");
    expect(roman(2026)).toBe("MMXXVI");
    expect(roman(0)).toBe("0");
    expect(roman(4000)).toBe("4000");
  });

  it("formats token amounts with grouping and trimmed decimals", () => {
    expect(formatAmount(1_234_500_000n, 6)).toBe("1,234.5");
    expect(formatAmount(1_000_000n, 6)).toBe("1");
    expect(formatAmount(123_456n, 6, 4)).toBe("0.1234");
    expect(formatAmount(10n ** 18n, 18)).toBe("1");
  });

  it("converts human amounts to units without float noise", () => {
    expect(toUnits(0.1, 6)).toBe(100_000n);
    expect(toUnits(1500, 6)).toBe(1_500_000_000n);
    expect(toUnits("2.5", 18)).toBe(2_500_000_000_000_000_000n);
  });

  it("describes durations and windows", () => {
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(600)).toBe("10m 00s");
    expect(formatDuration(3 * 3600 + 120)).toBe("3h 2m");
    expect(formatDuration(2 * 86400 + 3600)).toBe("2d 1h");
    expect(describeWindow(300)).toBe("5 minutes");
    expect(describeWindow(86400)).toBe("1 day");
  });

  it("shortens addresses and renders basis points", () => {
    expect(shortAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")).toBe("0x3C44…93BC");
    expect(percent(7250)).toBe("72.5%");
    expect(percent(5000)).toBe("50%");
  });
});
