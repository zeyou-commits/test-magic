export type SchoolZone = "A" | "B" | "C";

export interface SchoolBreak {
  name: string;
  start: string;
  end: string;
  zones: SchoolZone[];
}

export const FRENCH_ACADEMY_ZONES: Record<SchoolZone, string[]> = {
  A: ["Besançon", "Bordeaux", "Clermont-Ferrand", "Dijon", "Grenoble", "Limoges", "Lyon", "Poitiers"],
  B: ["Aix-Marseille", "Amiens", "Lille", "Nancy-Metz", "Nantes", "Nice", "Normandie", "Orléans-Tours", "Reims", "Rennes", "Strasbourg"],
  C: ["Créteil", "Montpellier", "Paris", "Toulouse", "Versailles"],
};

export const SCHOOL_BREAKS_2026_2027: SchoolBreak[] = [
  { name: "Toussaint", start: "2026-10-17", end: "2026-11-02", zones: ["A", "B", "C"] },
  { name: "Noël", start: "2026-12-19", end: "2027-01-04", zones: ["A", "B", "C"] },
  { name: "Hiver", start: "2027-02-06", end: "2027-03-15", zones: ["A", "B", "C"] },
  { name: "Printemps", start: "2027-04-03", end: "2027-05-03", zones: ["A", "B", "C"] },
  { name: "Été", start: "2027-07-03", end: "2027-09-01", zones: ["A", "B", "C"] },
];

export function getSchoolBreak(date: string, zone?: SchoolZone | null): SchoolBreak | null {
  return SCHOOL_BREAKS_2026_2027.find((period) => {
    if (!period.zones.includes("A") && zone) return false;
    if (zone === "A") {
      if (period.name === "Hiver") return date >= "2027-02-06" && date < "2027-02-22";
      if (period.name === "Printemps") return date >= "2027-04-03" && date < "2027-04-19";
    }
    if (zone === "B") {
      if (period.name === "Hiver") return date >= "2027-02-13" && date < "2027-03-01";
      if (period.name === "Printemps") return date >= "2027-04-10" && date < "2027-04-26";
    }
    if (zone === "C") {
      if (period.name === "Hiver") return date >= "2027-02-20" && date < "2027-03-08";
      if (period.name === "Printemps") return date >= "2027-04-17" && date < "2027-05-03";
    }
    return date >= period.start && date < period.end;
  }) ?? null;
}

export function getSchoolBreaksForZone(zone: SchoolZone): SchoolBreak[] {
  return SCHOOL_BREAKS_2026_2027.flatMap((period) => {
    if (period.name === "Hiver") {
      const ranges: Record<SchoolZone, [string, string]> = {
        A: ["2027-02-06", "2027-02-22"],
        B: ["2027-02-13", "2027-03-01"],
        C: ["2027-02-20", "2027-03-08"],
      };
      const [start, end] = ranges[zone];
      return [{ ...period, start, end }];
    }
    if (period.name === "Printemps") {
      const ranges: Record<SchoolZone, [string, string]> = {
        A: ["2027-04-03", "2027-04-19"],
        B: ["2027-04-10", "2027-04-26"],
        C: ["2027-04-17", "2027-05-03"],
      };
      const [start, end] = ranges[zone];
      return [{ ...period, start, end }];
    }
    return [{ ...period }];
  });
}
