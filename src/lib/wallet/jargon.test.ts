import { describe, expect, it } from "vitest";
import { parseSpoken, saidAs, SPOKEN_EXAMPLES } from "./jargon";

describe("le jargon des dinars", () => {
  it("dit les montants comme à l'oral", () => {
    expect(saidAs(1000)).toBe("cent mille");
    expect(saidAs(2000)).toBe("mitine alf");
    expect(saidAs(10000)).toBe("melyoun");
    expect(saidAs(15000)).toBe("melyoun w nass");
    expect(saidAs(30000)).toBe("3 melyoun");
    expect(saidAs(1500)).toBe("150 alf");
    expect(saidAs(5)).toBeNull();
  });
  it("comprend ce qu'on entend, avec ses variantes d'écriture", () => {
    expect(parseSpoken("melione")).toBe(10000);
    expect(parseSpoken("3 melyoun")).toBe(30000);
    expect(parseSpoken("mitine 3elf")).toBe(2000);
    expect(parseSpoken("cent mile")).toBe(1000);
    expect(parseSpoken("cent mille")).toBe(1000);
    expect(parseSpoken("melyoun w nass")).toBe(15000);
    expect(parseSpoken("2 millions et demi")).toBe(25000);
    expect(parseSpoken("150 alf")).toBe(1500);
    expect(parseSpoken("melyoun w 200 alf")).toBe(12000);
    expect(parseSpoken("bonjour")).toBeNull();
    expect(parseSpoken("")).toBeNull();
  });
  it("relit correctement sa propre carte", () => {
    for (const { said, dinars } of SPOKEN_EXAMPLES) expect(parseSpoken(said)).toBe(dinars);
  });
});
