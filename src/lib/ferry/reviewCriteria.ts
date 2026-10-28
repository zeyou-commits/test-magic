export type ReviewKind = "port" | "vessel" | "company";
export const reviewCriteria: Record<ReviewKind, { code: string; label: string }[]> = {
  vessel: [
    { code: "cleanliness", label: "Propreté à bord" },
    { code: "comfort", label: "Confort des espaces" },
    { code: "rest", label: "Calme et repos" },
    { code: "food", label: "Restauration" },
    { code: "facilities", label: "Équipements et services" },
  ],
  port: [
    { code: "access", label: "Accès au terminal" },
    { code: "signage", label: "Orientation et signalétique" },
    { code: "cleanliness", label: "Propreté des lieux" },
    { code: "waiting", label: "Confort pendant l’attente" },
    { code: "services", label: "Services pratiques" },
  ],
  company: [
    { code: "information", label: "Clarté des informations" },
    { code: "boarding", label: "Organisation de l’embarquement" },
    { code: "changes", label: "Gestion des changements" },
    { code: "support", label: "Service client" },
    { code: "value", label: "Rapport qualité/prix" },
  ],
};
export type ReviewScores = Record<string, number | null>;
export function reviewScore(kind: ReviewKind, scores: ReviewScores): number | null {
  const keys = reviewCriteria[kind].map((c) => c.code);
  if (Object.keys(scores).some((k) => !keys.includes(k))) return null;
  const rated = Object.values(scores).filter((v): v is number => v !== null);
  if (rated.length < 3 || rated.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) return null;
  return rated.reduce((a, b) => a + b, 0) / rated.length;
}

export const reviewNumber = (score: number) =>
  score.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
