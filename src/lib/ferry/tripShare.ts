/** A shared journey contains only a public departure ID, never the sender's filters or account. */
export function tripShareUrl(href: string, departureId: string) {
  const url = new URL("/", href);
  url.searchParams.set("select", "departure");
  url.searchParams.set("id", departureId);
  return url.toString();
}

export function tripShareText(from: string, to: string, departureAt: string, timeZone: string) {
  const when = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(new Date(departureAt));
  return `${from} → ${to}\nDépart le ${when} (heure du port de départ).\nSuivez l’avancement de cette traversée sur BledWay. Les horaires et l’arrivée peuvent évoluer.`;
}
