import { describe, expect, it } from "vitest";
import { detectDocument, isValidCnpj, isValidCpf, isValidCreciFormat, maskDocument } from "./documentos";

describe("CPF", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35"])("aceita %s", (v) => expect(isValidCpf(v)).toBe(true));
  it.each(["529.982.247-24", "111.111.111-11", "123", "", "5299822472a"])("rejeita %s", (v) => expect(isValidCpf(v)).toBe(false));
});

describe("CNPJ", () => {
  it.each(["11.222.333/0001-81", "11222333000181"])("aceita numérico %s", (v) => expect(isValidCnpj(v)).toBe(true));
  it("aceita alfanumérico (exemplo oficial da Receita: 12.ABC.345/01DE-35)", () => expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true));
  it.each(["11.222.333/0001-80", "00000000000000", "12.ABC.345/01DE-36", "12ABC34501DEXX"])("rejeita %s", (v) =>
    expect(isValidCnpj(v)).toBe(false),
  );
});

describe("detectDocument", () => {
  it("identifica CPF e CNPJ normalizados", () => {
    expect(detectDocument("529.982.247-25")).toEqual({ kind: "cpf", value: "52998224725" });
    expect(detectDocument("12.abc.345/01de-35")).toEqual({ kind: "cnpj", value: "12ABC34501DE35" });
    expect(detectDocument("000")).toBeNull();
  });
});

describe("CRECI (somente formato)", () => {
  it("aceita número com/sem sufixo e UF válida", () => {
    expect(isValidCreciFormat("12345", "SC")).toBe(true);
    expect(isValidCreciFormat("12345-F", "SC")).toBe(true);
    expect(isValidCreciFormat("1234J", "PR")).toBe(true);
  });
  it("rejeita UF inexistente ou formato inválido", () => {
    expect(isValidCreciFormat("12345", "XX")).toBe(false);
    expect(isValidCreciFormat("ABC", "SC")).toBe(false);
    expect(isValidCreciFormat("123456789", "SC")).toBe(false);
  });
});

describe("mascaramento", () => {
  it("mascara CPF e CNPJ", () => {
    expect(maskDocument("52998224725")).toBe("***.982.247-**");
    expect(maskDocument("11222333000181")).toBe("**.222.333/****-**");
    expect(maskDocument(null)).toBe("—");
  });
});
