import { describe, expect, it } from "vitest";
import { holidayCalendars } from "@/content/vacancesScolaires.data";
import { europePosts } from "@/content/consulatsEurope.data";
import {
  holidaysBetween,
  setHolidayCalendars,
  vacancesChecked,
  type HolidayCalendar,
} from "@/content/vacancesScolaires";
import { consulatsChecked, europeConsulates, setEuropePosts } from "@/content/consulatsEurope";
import { compareConsulates, compareHolidays, parseMfaInfos, referenceDue } from "./sources";

describe("rappel de mise à jour", () => {
  it("un relevé de plus de 6 mois est à refaire", () => {
    expect(referenceDue("consulats", "2026-01-10", "2026-11-13")).toMatch(/il y a 10 mois/);
    expect(referenceDue("consulats", "2026-10-01", "2026-11-13")).toBeNull();
  });

  it("vacances : à refaire quand la France ne couvre plus les 9 prochains mois", () => {
    expect(referenceDue("vacances", "2026-11-13", "2026-11-13", holidayCalendars)).toBeNull();
    const short: HolidayCalendar[] = [
      { ...holidayCalendars[0]!, periods: [["noel", "2026-12-19", "2027-01-03", "A"]] },
    ];
    expect(referenceDue("vacances", "2026-11-13", "2026-11-13", short)).toMatch(/9 prochains mois/);
  });
});

describe("comparaison avant approbation", () => {
  it("vacances : périodes ajoutées et retirées, pays manquant signalé", () => {
    const fr = holidayCalendars[0]!;
    const after: HolidayCalendar[] = [
      { ...fr, periods: [...fr.periods.slice(1), ["ete", "2029-07-07", null, "A"]] },
    ];
    const summary = compareHolidays(holidayCalendars, after, "2026-11-13");
    expect(summary.lines[0]!.detail).toMatch(/1 période ajoutée, 1 retirée/);
    expect(summary.warnings.some((w) => /Belgique manque/.test(w))).toBe(true);
    expect(compareHolidays(holidayCalendars, holidayCalendars, "2026-11-13").changed).toBe(0);
  });

  it("consulats : nouveau poste, téléphone changé, poste retiré", () => {
    const be = europePosts.find((c) => c.country === "BE")!;
    const [embassy, consulate] = be.posts;
    const after = [
      {
        ...be,
        posts: [
          { ...embassy!, phone: "+32 0 000 00 00" },
          { ...consulate!, name: "Consulat d'Algérie à Liège" },
        ],
      },
    ];
    const line = compareConsulates([be], after).lines[0]!;
    expect(line.detail).toMatch(/téléphone/);
    expect(line.detail).toMatch(/nouveau : Consulat d'Algérie à Liège/);
    expect(line.detail).toMatch(/retiré : Consulat Général d'Algérie à Bruxelles/);
  });

  it("lit une fiche du ministère", () => {
    const posts = parseMfaInfos(
      "<p><strong>Consulat d'Algérie à Lisbone :</strong></p><p>Rua X, 10, Lisboa.</p><p>Tél : +351 1</p><p>c@x.pt</p>",
    );
    expect(posts).toEqual([
      {
        name: "Consulat d'Algérie à Lisbonne",
        address: "Rua X, 10, Lisboa",
        phone: "+351 1",
        email: "c@x.pt",
        site: "",
        point: null,
      },
    ]);
  });
});

describe("version approuvée", () => {
  it("remplace le relevé du dépôt dans les calculs du site", () => {
    const fr = holidayCalendars[0]!;
    setHolidayCalendars(
      [{ ...fr, periods: [["ete", "2027-07-10", "2027-08-31", "C"]] }],
      "2027-05-01",
    );
    expect(vacancesChecked()).toBe("2027-05-01");
    expect(holidaysBetween("FR:C", "2027-06-01", "2027-09-30")[0]!.start).toBe("2027-07-10");
    setHolidayCalendars(holidayCalendars, "2026-11-13");

    setEuropePosts([{ country: "AT", name: "Autriche", posts: [] }], "2027-05-01");
    expect(consulatsChecked()).toBe("2027-05-01");
    expect(europeConsulates("ES")).toBeNull();
    setEuropePosts(europePosts, "2026-11-13");
  });
});
