import { describe, expect, it } from "vitest";
import { defaultAnswers, newTraveller, type Answers } from "@/content/formalites";
import { europeConsulates } from "@/content/consulatsEurope";
import { holidaysBetween, parseHolidayChoice } from "@/content/vacancesScolaires";
import { defaultPlan, earliestDay, planDay, planWhenLabel } from "./companion";
import { retroPlan } from "./retroPlan";

const plan = (p: Partial<ReturnType<typeof defaultPlan>> = {}) => ({ ...defaultPlan(), ...p });

describe("période de départ", () => {
  it("compte les dates limites depuis le premier jour possible", () => {
    const p = plan({ month: "2027-07", window: { from: "2027-07-03", to: "2027-08-31" } });
    expect(earliestDay(p)).toBe("2027-07-03");
    expect(planDay(p)).toBe("2027-07-03");
    expect(planWhenLabel(p)).toBe("entre le 3 juillet et le 31 août");
    expect(earliestDay(plan({ month: "2027-07", window: null }))).toBe("2027-07-01");
  });
});

describe("calendrier à rebours", () => {
  const today = "2026-11-13";

  it("sans la liste des papiers : la faire d'abord, puis réserver, la semaine d'avant, le départ", () => {
    const list = retroPlan(
      plan({ month: "2027-07", window: null }),
      { answers: defaultAnswers, finished: false, done: [] },
      today,
    );
    expect(list.map((m) => m.id)).toEqual(["papers", "book", "bags", "eve", "day"]);
    expect(list.at(-1)!.date).toBe("2027-07-01");
  });

  it("un visa en été : les démarches longues 6 semaines avant, puis la réservation", () => {
    const answers: Answers = {
      ...defaultAnswers,
      travellers: [{ ...newTraveller("adult"), nat: "etr" }],
    };
    const list = retroPlan(
      plan({ month: "2027-07", window: null }),
      { answers, finished: true, done: [] },
      today,
    );
    const weeks = list.find((m) => m.id === "weeks")!;
    expect(weeks.date).toBe("2027-05-20");
    expect(weeks.detail).toMatch(/1 à 14 jours/);
    expect(weeks.detail).toMatch(/haute saison.*pas un délai officiel/);
    expect(weeks.sources).toContain("amb-visa");
    expect(list.findIndex((m) => m.id === "book")).toBe(
      list.findIndex((m) => m.id === "weeks") + 1,
    );
  });

  it("hors saison : 4 semaines, sans parler de haute saison", () => {
    const answers: Answers = {
      ...defaultAnswers,
      travellers: [{ ...newTraveller("adult"), nat: "etr" }],
    };
    const weeks = retroPlan(
      plan({ month: "2027-10", window: null }),
      { answers, finished: true, done: [] },
      today,
    ).find((m) => m.id === "weeks")!;
    expect(weeks.date).toBe("2027-09-03");
    expect(weeks.detail).not.toMatch(/haute saison/);
  });

  it("départ proche : la date limite passée est signalée", () => {
    const answers: Answers = {
      ...defaultAnswers,
      travellers: [{ ...newTraveller("adult"), nat: "etr" }],
    };
    const list = retroPlan(
      plan({ month: "2026-11", date: "2026-11-25" }),
      { answers, finished: true, done: [] },
      today,
    );
    expect(list.find((m) => m.id === "weeks")!.late).toBe(true);
  });

  it("binational qui part après la fin de la mesure : un avertissement sourcé", () => {
    const answers: Answers = {
      ...defaultAnswers,
      travellers: [{ ...newTraveller("adult"), nat: "bi" }],
    };
    const after = retroPlan(
      plan({ month: "2027-07" }),
      { answers, finished: true, done: [] },
      today,
    );
    const warning = after.find((m) => m.id === "binationaux")!;
    expect(warning.tone).toBe("warning");
    expect(warning.sources).toEqual(["cons-binationaux"]);
    const before = retroPlan(
      plan({ month: "2026-12", date: "2026-12-20" }),
      { answers, finished: true, done: [] },
      today,
    );
    expect(before.some((m) => m.id === "binationaux")).toBe(false);
  });
});

describe("vacances scolaires", () => {
  it("France, zone C : l'été 2027 publié par le ministère", () => {
    const ete = holidaysBetween("FR:C", "2027-06-01", "2027-09-30").find((s) => s.kind === "ete")!;
    expect(ete.start).toBe("2027-07-03");
    expect(ete.varies).toBe(false);
  });

  it("toutes zones : l'hiver réunit les trois zones et le dit", () => {
    const hiver = holidaysBetween("FR", "2027-01-15", "2027-03-31").find(
      (s) => s.kind === "hiver",
    )!;
    expect(hiver.varies).toBe(true);
    expect(hiver.start < hiver.end!).toBe(true);
  });

  it("un pays sans calendrier ouvert ne renvoie rien", () => {
    expect(parseHolidayChoice("ES").calendar).toBeNull();
    expect(holidaysBetween("ES", "2027-01-01", "2027-12-31")).toEqual([]);
  });
});

describe("consulats en Europe", () => {
  it("Espagne : le consulat le plus proche d'Alicante en premier", () => {
    const result = europeConsulates("ES", [-0.4907, 38.3452])!;
    expect(result.embassyOnly).toBe(false);
    expect(result.posts[0]!.name).toMatch(/Alicante/);
  });

  it("un pays sans consulat listé : l'ambassade", () => {
    const result = europeConsulates("AT")!;
    expect(result.embassyOnly).toBe(true);
    expect(result.posts[0]!.name).toMatch(/Ambassade/);
  });
});
