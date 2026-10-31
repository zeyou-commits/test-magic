// À l'oral, on compte en centimes : « alf » (1 000 centimes) vaut 10 DA, « melyoun » vaut 10 000 DA.
const ALF_DA = 10;
const MELYOUN_DA = 10_000;

/** Les multiples de « alf » qui ont un nom courant. */
const ALF_WORDS: [number, string][] = [
  [10, "achra alaf"],
  [20, "achrine alf"],
  [50, "khamsine alf"],
  [100, "cent mille"],
  [200, "mitine alf"],
  [500, "khamsa miya alf"],
];

function alfWords(alf: number) {
  return ALF_WORDS.find(([value]) => value === alf)?.[1] ?? `${alf} alf`;
}

/** 2 000 → « mitine alf » ; 35 000 → « 3 melyoun w nass ». Null sous 10 DA. */
export function saidAs(dinars: number): string | null {
  if (!Number.isFinite(dinars) || dinars < ALF_DA) return null;
  const melyoun = Math.floor(dinars / MELYOUN_DA);
  const alf = Math.round((dinars - melyoun * MELYOUN_DA) / ALF_DA);
  const parts: string[] = [];
  if (melyoun === 1) parts.push("melyoun");
  else if (melyoun > 1) parts.push(`${melyoun} melyoun`);
  if (alf === 5_00 && melyoun > 0) parts.push("nass");
  else if (alf > 0) parts.push(alfWords(alf));
  return parts.join(" w ");
}

/** « 3 melyoun », « mitine 3elf », « melyoun w nass », « 150 alf » → montant en dinars, ou null. */
export function parseSpoken(input: string): number | null {
  const text = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/3elf|3alf|elf|alaf|mile|mil\b|mille/g, "alf")
    .replace(/mil+[iy]ons?|mel+[iy]o+u?ns?|mel+[iy]o+n|malyoun/g, "melyoun")
    .replace(/\bdemi\b/g, "nass")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  let total = 0;
  let found = false;
  const million = text.match(/(?:(\d+(?:[.,]\d+)?)\s*)?melyoun(\s*(?:w|et)\s*nass)?/);
  if (million) {
    const count = million[1] ? Number(million[1].replace(",", ".")) : 1;
    total += (count + (million[2] ? 0.5 : 0)) * MELYOUN_DA;
    found = true;
  }
  const rest = million ? text.replace(million[0], "") : text;
  const digits = rest.match(/(\d+)\s*alf/);
  const named = ALF_WORDS.find(([, word]) => rest.includes(word.replace(" alf", "").replace(" mille", "")) && /alf/.test(rest));
  const hundred = /\bcent alf\b/.test(rest);
  const twoHundred = /\bmit[iy]ne? alf\b/.test(rest);
  if (digits) {
    total += Number(digits[1]) * ALF_DA;
    found = true;
  } else if (twoHundred) {
    total += 200 * ALF_DA;
    found = true;
  } else if (hundred) {
    total += 100 * ALF_DA;
    found = true;
  } else if (named) {
    total += named[0] * ALF_DA;
    found = true;
  } else if (/\balf\b/.test(rest)) {
    total += ALF_DA;
    found = true;
  }
  return found && total > 0 ? Math.round(total) : null;
}

/** La carte « Parler dinar ». */
export const SPOKEN_EXAMPLES = [
  { said: "alf", dinars: 10 },
  { said: "khamsine alf", dinars: 500 },
  { said: "cent mille", dinars: 1_000 },
  { said: "mitine alf", dinars: 2_000 },
  { said: "khamsa miya alf", dinars: 5_000 },
  { said: "melyoun", dinars: 10_000 },
  { said: "melyoun w nass", dinars: 15_000 },
  { said: "3 melyoun", dinars: 30_000 },
];
