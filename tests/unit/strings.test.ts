import { describe, expect, it } from "vitest";
import { en } from "../../src/strings/en.ts";
import { translate } from "../../src/strings/index.ts";
import { zh } from "../../src/strings/zh.ts";

describe("the terminal's two languages", () => {
  it("has the same keys in both tables", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the parameterised entries parameterised in both", () => {
    for (const key of ["endfield_fold", "endfield_sources_kicker", "endfield_line_count"] as const) {
      expect(typeof en[key]).toBe("function");
      expect(typeof zh[key]).toBe("function");
    }
  });

  it("translates by language", () => {
    expect(translate("en", "endfield_search")).toBe("Search archive");
    expect(translate("zh", "endfield_search")).toBe("检索剧情");
    expect(translate("en", "endfield_line_count", 20641)).toBe("20641 source lines");
    expect(translate("zh", "endfield_fold", 3)).toContain("3");
  });

  it("keeps the window's name in both, each in its own language", () => {
    expect(en.endfield_terminal_title).toBe("Endfield Terminal");
    expect(zh.endfield_terminal_title).toBe("终末地剧情终端");
  });
});
