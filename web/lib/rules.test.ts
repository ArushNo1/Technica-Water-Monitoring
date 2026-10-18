import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { earlyWarning, fitK, isOnline, levelOf, limitParam, msParam, nodeStatus, predictGPerL } from "./rules";

describe("levelOf", () => {
  it("uses the plan thresholds: <200 ok, 200–<600 warn, >=600 crit", () => {
    expect(levelOf(0, null)).toBe("ok");
    expect(levelOf(199.9, null)).toBe("ok");
    expect(levelOf(200, null)).toBe("warn");
    expect(levelOf(599.9, null)).toBe("warn");
    expect(levelOf(600, null)).toBe("crit");
    expect(levelOf(10000, null)).toBe("crit");
  });

  it("a fault wins over any sodium value", () => {
    expect(levelOf(40, "temp_probe")).toBe("fault");
    expect(levelOf(null, "cell_range")).toBe("fault");
  });

  it("no sodium and no fault is invalid (the API returns 400)", () => {
    expect(levelOf(null, null)).toBeNull();
  });

  it("thresholds come from config", () => {
    expect(config).toMatchObject({ na_warn: 200, na_crit: 600, offline_after_s: 10 });
  });
});

describe("isOnline", () => {
  afterEach(() => vi.useRealTimers());

  it("is online for 10 s after the last reading, then offline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    expect(isOnline("2026-10-18T09:59:50Z")).toBe(true); // exactly 10 s
    expect(isOnline("2026-10-18T09:59:49Z")).toBe(false);
  });
});

describe("nodeStatus", () => {
  const r = (level: string) => ({ level });

  it("offline beats everything", () => {
    expect(nodeStatus(false, { main: r("crit") })).toBe("offline");
  });

  it("pipe: its single probe's level, fault included", () => {
    expect(nodeStatus(true, { main: r("ok") })).toBe("ok");
    expect(nodeStatus(true, { main: r("warn") })).toBe("warn");
    expect(nodeStatus(true, { main: r("crit") })).toBe("crit");
    expect(nodeStatus(true, { main: r("fault") })).toBe("fault");
  });

  it("buoy: fault, then early warning, then the worst probe", () => {
    expect(nodeStatus(true, { shallow: r("fault"), deep: r("crit") })).toBe("fault");
    expect(nodeStatus(true, { shallow: r("ok"), deep: r("warn") })).toBe("early_warning");
    expect(nodeStatus(true, { shallow: r("warn"), deep: r("crit") })).toBe("crit");
    expect(nodeStatus(true, { shallow: r("ok"), deep: r("ok") })).toBe("ok");
  });

  it("a node with no readings yet is ok", () => {
    expect(nodeStatus(true, {})).toBe("ok");
  });

  it("early warning needs shallow ok and deep warn/crit", () => {
    expect(earlyWarning({ shallow: r("ok"), deep: r("crit") })).toBe(true);
    expect(earlyWarning({ shallow: r("warn"), deep: r("crit") })).toBe(false);
    expect(earlyWarning({ main: r("crit") })).toBe(false);
  });
});

describe("fitK", () => {
  // A standard measured with a cell of constant K: R = K*1000 / (2*c) at 25 °C.
  const pt = (c: number, K: number, temp_c: number | null = 25) => ({
    known_g_per_l: c,
    r_cell_ohm: (K * 1000) / (2 * c * (1 + 0.02 * ((temp_c ?? 25) - 25))),
    temp_c,
  });

  it("recovers K exactly from perfect points", () => {
    const fit = fitK([pt(0.5, 2.5), pt(1, 2.5), pt(2.5, 2.5)]);
    expect(fit.k_cm1).toBeCloseTo(2.5, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it("matches the plan sanity case: K=2.0, R=1000 Ω is 1 g/L (2 mS/cm, ~394 mg/L Na)", () => {
    expect(fitK([{ known_g_per_l: 1, r_cell_ohm: 1000, temp_c: 25 }, { known_g_per_l: 2, r_cell_ohm: 500, temp_c: 25 }]).k_cm1).toBeCloseTo(2, 10);
    expect(197 * 2).toBe(394);
  });

  it("compensates temperature, and treats null temp as 25 °C", () => {
    expect(fitK([pt(0.5, 2, 30), pt(2, 2, 18)]).k_cm1).toBeCloseTo(2, 10);
    expect(fitK([pt(0.5, 2, null), pt(2, 2, null)]).k_cm1).toBeCloseTo(2, 10);
  });

  it("noisy points give K near the truth and R² below 1", () => {
    const pts = [pt(0.5, 2.5), pt(1, 2.5), pt(2.5, 2.5)];
    pts[1].r_cell_ohm *= 1.05;
    const fit = fitK(pts);
    expect(fit.k_cm1).toBeGreaterThan(2.4);
    expect(fit.k_cm1).toBeLessThan(2.6);
    expect(fit.r2!).toBeLessThan(1);
    expect(fit.r2!).toBeGreaterThan(0.99);
  });

  it("predictGPerL inverts the fit", () => {
    expect(predictGPerL(pt(1.8, 2.5), 2.5)).toBeCloseTo(1.8, 10);
  });
});

describe("query params", () => {
  it("limitParam defaults, clamps, and floors", () => {
    expect(limitParam(null, 1000, 20000)).toBe(1000);
    expect(limitParam("abc", 1000, 20000)).toBe(1000);
    expect(limitParam("50000", 1000, 20000)).toBe(20000);
    expect(limitParam("-5", 1000, 20000)).toBe(1);
    expect(limitParam("12.7", 1000, 20000)).toBe(12);
  });

  it("msParam: absent → null, unix ms → ISO, garbage → false", () => {
    expect(msParam(null)).toBeNull();
    expect(msParam("")).toBeNull();
    expect(msParam("1792274938802")).toBe(new Date(1792274938802).toISOString());
    expect(msParam("yesterday")).toBe(false);
  });
});
