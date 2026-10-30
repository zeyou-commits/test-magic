import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, Info, Ship, TrendingUp } from "lucide-react";
import { PRICE_BENCHMARKS } from "@/lib/ferry/pricing";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { seoHead } from "@/lib/seo/site";

export const Route = createFileRoute("/barometre-prix")({
  head: () => seoHead(
    "Baromètre des prix ferry Algérie avec voiture | BledWay",
    "Repères de prix par ligne, saison et véhicule pour préparer une traversée Europe–Algérie. Sources, méthode et périodes à privilégier.",
    "/barometre-prix",
  ),
  component: PriceBarometer,
});

const routes = [
  ["Sète", "Béjaïa", "sete|bejaia"],
  ["Marseille", "Alger", "marseille|alger"],
  ["Sète", "Alger", "sete|alger"],
  ["Barcelone", "Alger", "barcelone|alger"],
  ["Valence", "Mostaganem", "valence|mostaganem"],
  ["Almería", "Oran", "almeria|oran"],
  ["Oran", "Almería", "oran|almeria"],
] as const;

const seasons = [
  { label: "Janvier–mars, novembre", level: "Période calme", width: "w-[42%]", tone: "bg-emerald-600", hint: "Souvent plus souple côté prix ; l'offre de traversées peut être réduite." },
  { label: "Avril–mi-juin, mi-septembre–octobre, décembre", level: "Intermédiaire", width: "w-[58%]", tone: "bg-teal-500", hint: "Bon compromis entre choix de départs et budget, selon les lignes." },
  { label: "Mi-juin–mi-juillet, début septembre", level: "Forte demande", width: "w-[78%]", tone: "bg-amber-500", hint: "Les places voiture et les cabines se raréfient." },
  { label: "Mi-juillet–août", level: "Pointe estivale", width: "w-full", tone: "bg-orange-600", hint: "Prévoyez une marge de budget et comparez plusieurs dates." },
] as const;

function PriceBarometer() {
  return <>
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Le baromètre BledWay · octobre 2026</p>
      <div className="mt-3 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">Le bon départ, au bon prix.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Une voiture change réellement le budget d'une traversée. Comparez ici les ordres de grandeur par ligne, puis choisissez une date et un port sur la carte.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-foreground"><Info className="size-5 shrink-0 text-primary" /><p>Ces montants sont des <strong>repères observés et estimés</strong>, jamais des prix disponibles à la réservation. Le devis de la compagnie fait foi.</p></div>
      </div>

      <section className="mt-12" aria-labelledby="prices-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Traversée aller simple</p><h2 id="prices-title" className="mt-1 font-display text-2xl font-bold sm:text-3xl">Repères publiés par ligne</h2></div><span className="text-xs text-muted-foreground">Moyennes ou repères « avec voiture » publiés en septembre–octobre 2026</span></div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-white"><table className="w-full min-w-[580px] text-left text-sm"><thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-4">Ligne</th><th className="px-4 py-4">Piéton</th><th className="px-4 py-4">Avec voiture</th><th className="px-4 py-4">Source</th></tr></thead><tbody>{routes.map(([from, to, key]) => { const item = PRICE_BENCHMARKS[key]!; return <tr key={key} className="border-t border-border"><th scope="row" className="px-5 py-4 font-semibold">{from} <ArrowRight className="mx-1 inline size-3 text-primary" /> {to}</th><td className="px-4 py-4">{item.foot} €</td><td className="px-4 py-4 font-bold text-primary">{item.withCar} €</td><td className="px-4 py-4"><a className="font-semibold text-primary underline underline-offset-2" href={item.source} target="_blank" rel="noopener noreferrer">Voir le relevé ↗</a></td></tr>; })}</tbody></table></div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Les statistiques des comparateurs ne détaillent pas toujours le nombre de passagers, la cabine ni les frais de service. La colonne « avec voiture » désigne un billet incluant un véhicule ; elle ne représente pas le prix du véhicule seul. Les deux sens d'une ligne peuvent différer.</p>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_.8fr]" aria-labelledby="season-title">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Quand partir ?</p><h2 id="season-title" className="mt-1 font-display text-2xl font-bold sm:text-3xl">La saison compte autant que le port.</h2><div className="mt-6 space-y-5">{seasons.map((season) => <div key={season.level}><div className="flex flex-wrap justify-between gap-1 text-sm"><strong>{season.label}</strong><span className="text-muted-foreground">{season.level}</span></div><div className="mt-2 h-2 rounded-full bg-secondary"><div className={`h-2 rounded-full ${season.width} ${season.tone}`} /></div><p className="mt-1 text-xs text-muted-foreground">{season.hint}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-muted-foreground">Échelle indicative de pression tarifaire, pas un historique de prix mesurés. Les vacances, les promotions et la disponibilité d'une place véhicule peuvent changer le tarif d'un départ précis. <a className="font-semibold text-primary underline" href="https://www.corsicalinea.com/informations/legal/cgu-tarifs-generiques/" target="_blank" rel="noopener noreferrer">Corsica Linea confirme la variation par période</a> ; <a className="font-semibold text-primary underline" href="https://www.aferry.com/fr-fr/ferry-deals/746afm/ferry-algerie-ete-2026-reservations-ouvertes/" target="_blank" rel="noopener noreferrer">AFerry décrit la pointe de juillet–août</a>.</p></div>
        <aside className="rounded-3xl bg-[#e9f3ef] p-6 sm:p-8"><TrendingUp className="size-7 text-primary" /><h3 className="mt-4 font-display text-xl font-bold">Comment lire l'estimation BledWay ?</h3><ol className="mt-4 space-y-4 text-sm leading-6"><li className="flex gap-3"><span className="font-bold text-primary">01</span><span>Un repère de la ligne, avec le <CarFront className="inline size-4" /> véhicule lorsque vous en choisissez un.</span></li><li className="flex gap-3"><span className="font-bold text-primary">02</span><span>Une modulation selon la période de départ, les voyageurs et la catégorie du véhicule.</span></li><li className="flex gap-3"><span className="font-bold text-primary">03</span><span>Une fourchette élargie pour refléter les places restantes, les options et l'incertitude des sources.</span></li></ol><p className="mt-5 border-t border-primary/15 pt-4 text-xs leading-5 text-muted-foreground">Sans tarif temps réel, nous n'attribuons aucun prix à une compagnie précise. Cabine, repas, taxes et frais de réservation peuvent s'ajouter.</p></aside>
      </section>

      <section className="mt-14 rounded-3xl bg-[#0d3043] p-6 text-white sm:p-9"><Ship className="size-7 text-emerald-300" /><h2 className="mt-3 font-display text-2xl font-bold">Comparez un voyage complet, pas seulement le ferry.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Un départ d'Espagne peut coûter moins cher en mer mais demander davantage de route. Le comparateur porte à porte additionne carburant, péages estimés et ferry avec votre voiture.</p><Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#0d3043]">Ouvrir la carte <ArrowRight className="size-4" /></Link></section>
    </main>
    <SiteFooter />
  </>;
}
