import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("aceita caminhos internos", () => expect(safeNext("/admin/corretores")).toBe("/admin/corretores"));
  it.each(["https://malicioso.com", "//malicioso.com", "/\\malicioso.com", "", undefined, 42])("rejeita %s", (v) =>
    expect(safeNext(v)).toBe("/conta"),
  );
});
