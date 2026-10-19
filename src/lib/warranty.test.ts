import { describe, expect, it } from "vitest";
import { formatWarrantyPeriod, todayInBrasilia, warrantyEndsOn, warrantyStatus } from "./warranty";

describe("garantia", () => {
  it("cobre até a véspera do aniversário do habite-se", () => {
    expect(warrantyEndsOn("2026-03-10", 12)).toBe("2027-03-09");
    expect(warrantyEndsOn("2026-03-10", 60)).toBe("2031-03-09");
    expect(warrantyEndsOn("2026-03-01", 24)).toBe("2028-02-29");
  });

  it("ajusta fim de mês", () => {
    expect(warrantyEndsOn("2026-08-31", 6)).toBe("2027-02-27"); // 28/02/2027 menos um dia
    expect(warrantyEndsOn("2028-02-29", 12)).toBe("2029-02-27");
  });

  it("vigente até o último dia, encerrada no dia seguinte", () => {
    expect(warrantyStatus("2026-03-10", 12, "2027-03-09")).toEqual({ state: "vigente", endsOn: "2027-03-09", daysLeft: 0 });
    expect(warrantyStatus("2026-03-10", 12, "2027-03-10")).toEqual({ state: "encerrada", endsOn: "2027-03-09", daysLeft: null });
    expect(warrantyStatus("2026-03-10", 12, "2026-03-10").daysLeft).toBe(364);
  });

  it("sem habite-se, aguarda", () => {
    expect(warrantyStatus(null, 12, "2026-10-19")).toEqual({ state: "aguardando_habite_se", endsOn: null, daysLeft: null });
  });

  it("data de hoje em Brasília e rótulos", () => {
    expect(todayInBrasilia(new Date("2026-10-20T02:30:00Z"))).toBe("2026-10-19");
    expect(formatWarrantyPeriod(12)).toBe("1 ano");
    expect(formatWarrantyPeriod(60)).toBe("5 anos");
    expect(formatWarrantyPeriod(18)).toBe("18 meses");
  });
});
