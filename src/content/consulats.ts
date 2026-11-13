/** Les 18 postes consulaires d'Algérie en France et les départements qu'ils couvrent. */
export interface Consulat {
  id: string;
  name: string;
  address: string;
  phone: string;
  site: string;
  departments: string[];
}

export const consulats: Consulat[] = [
  { id: "paris", name: "Consulat général d'Algérie à Paris", address: "1 passage du Trône, 75011 Paris", phone: "01 53 72 07 00", site: "https://consulat-paris-algerie.fr/", departments: ["75", "18", "36", "37", "41", "45", "971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"] },
  { id: "bobigny", name: "Consulat d'Algérie à Bobigny", address: "17 rue Hector-Berlioz, 93000 Bobigny", phone: "01 41 50 58 58", site: "https://consulat-bobigny-algerie.fr/", departments: ["93"] },
  { id: "creteil", name: "Consulat d'Algérie à Créteil", address: "9 rue Olof-Palme, parc de la Brèche, 94000 Créteil", phone: "01 46 80 78 00", site: "https://consulat-creteil-algerie.fr/", departments: ["58", "77", "89", "91", "94"] },
  { id: "pontoise", name: "Consulat d'Algérie à Pontoise", address: "25 quai Eugène-Turpin, 95300 Pontoise", phone: "01 30 73 27 75", site: "https://consulat-pontoise-algerie.fr/", departments: ["14", "27", "50", "60", "61", "76", "95"] },
  { id: "nanterre", name: "Consulat d'Algérie à Nanterre", address: "63 avenue Georges-Clemenceau, 92000 Nanterre", phone: "01 47 25 12 71", site: "https://consulat-nanterre-algerie.fr/", departments: ["92", "28", "78"] },
  { id: "marseille", name: "Consulat général d'Algérie à Marseille", address: "363 rue Paradis, 13008 Marseille", phone: "04 91 13 99 50", site: "https://www.consulat-marseille-algerie.fr/", departments: ["13", "84"] },
  { id: "lyon", name: "Consulat général d'Algérie à Lyon", address: "126 rue Vauban, 69006 Lyon", phone: "04 72 83 85 50", site: "https://consulat-lyon-algerie.fr/", departments: ["01", "07", "26", "69", "71"] },
  { id: "strasbourg", name: "Consulat général d'Algérie à Strasbourg", address: "37 allée de la Robertsau, 67000 Strasbourg", phone: "03 88 30 17 51", site: "https://consulat-strasbourg-algerie.fr/", departments: ["67", "68", "88"] },
  { id: "lille", name: "Consulat général d'Algérie à Lille", address: "120 rue Solférino, 59800 Lille", phone: "03 28 38 01 40", site: "https://consulat-lille-algerie.fr/", departments: ["02", "59", "62", "80"] },
  { id: "saint-etienne", name: "Consulat d'Algérie à Saint-Étienne", address: "6 rue Richard, 42100 Saint-Étienne", phone: "04 77 80 67 83", site: "https://consulat-saint-etienne-algerie.fr/", departments: ["03", "15", "42", "43", "63"] },
  { id: "nice", name: "Consulat d'Algérie à Nice", address: "20 bis avenue Mont-Rabeau, 06200 Nice", phone: "04 93 97 71 00", site: "https://consulat-nice-algerie.fr/", departments: ["04", "06", "2A", "2B", "83"] },
  { id: "besancon", name: "Consulat d'Algérie à Besançon", address: "1 rue de l'Industrie, 25000 Besançon", phone: "03 81 80 31 79", site: "https://consulat-besancon-algerie.fr/", departments: ["21", "25", "39", "70", "90"] },
  { id: "grenoble", name: "Consulat d'Algérie à Grenoble", address: "7 quai Stéphane-Jay, 38000 Grenoble", phone: "04 76 54 30 18", site: "https://consulat-grenoble-algerie.fr/", departments: ["05", "38", "73", "74"] },
  { id: "metz", name: "Consulat d'Algérie à Metz", address: "1 bis avenue Leclerc-de-Hauteclocque, 57000 Metz", phone: "03 87 66 41 61", site: "https://consulat-metz-algerie.fr/", departments: ["08", "10", "51", "52", "54", "55", "57"] },
  { id: "bordeaux", name: "Consulat d'Algérie à Bordeaux", address: "41 rue Frantz-Despagnet, 33000 Bordeaux", phone: "05 56 99 03 36", site: "https://consulat-bordeaux-algerie.fr/", departments: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "87"] },
  { id: "nantes", name: "Consulat d'Algérie à Nantes", address: "57 rue Général-Buat, 44000 Nantes", phone: "02 40 74 38 19", site: "https://consulat-nantes-algerie.fr/", departments: ["22", "29", "35", "44", "49", "53", "56", "72", "79", "85", "86"] },
  { id: "toulouse", name: "Consulat d'Algérie à Toulouse", address: "67 boulevard de Strasbourg, 31000 Toulouse", phone: "05 61 62 97 07", site: "https://consulat-toulouse-algerie.fr/", departments: ["09", "31", "32", "46", "65", "81", "82"] },
  { id: "montpellier", name: "Consulat d'Algérie à Montpellier", address: "198 rue Yves-Montand, parc 2000, 34080 Montpellier", phone: "04 67 54 54 15", site: "https://consulat-montpellier-algerie.fr/", departments: ["11", "12", "30", "34", "48", "66"] },
];

/** Département d'un code postal français (Corse et outre-mer compris). */
export function departmentFromPostcode(raw: string): string | null {
  const code = raw.replace(/\s/g, "");
  if (!/^\d{5}$/.test(code)) return null;
  if (code.startsWith("97") || code.startsWith("98")) return code.slice(0, 3);
  if (code.startsWith("20")) return Number(code) < 20200 ? "2A" : "2B";
  return code.slice(0, 2);
}

export function consulatForDepartment(department: string): Consulat | null {
  const dep = department.toUpperCase() === "20" ? "2A" : department.toUpperCase();
  return consulats.find((c) => c.departments.includes(dep)) ?? null;
}
