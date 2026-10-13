import { describe, expect, it } from "vitest";
import { brasiliaLocalToUtcIso, formatBRL, formatDateTime, utcToBrasiliaLocalInput } from "./format";

describe("formatação brasileira", () => {
  it("formata reais", () => {
    expect(formatBRL(1234567.8).replace(/\s/g, " ")).toBe("R$ 1.234.567,80");
    expect(formatBRL(null)).toBe("—");
  });
  it("exibe UTC em horário de Brasília", () => {
    expect(formatDateTime("2026-10-14T02:30:00Z")).toBe("13/10/2026 às 23:30");
  });
  it("converte entrada local de Brasília para UTC e volta", () => {
    const iso = brasiliaLocalToUtcIso("2026-10-13T23:30");
    expect(iso).toBe("2026-10-14T02:30:00.000Z");
    expect(utcToBrasiliaLocalInput(iso)).toBe("2026-10-13T23:30");
  });
});

import { parseBRL } from "./format";
describe("parseBRL", () => {
  it.each([
    ["1.234.567,89", 1234567.89],
    ["R$ 1.000", 1000],
    ["1000.5", 1000.5],
    ["250.000", 250000],
    ["12,3", 12.3],
  ])("%s → %d", (i, o) => expect(parseBRL(i)).toBe(o));
  it.each(["", "abc", "-5"])("rejeita %s", (i) => expect(parseBRL(i)).toBeNull());
});
