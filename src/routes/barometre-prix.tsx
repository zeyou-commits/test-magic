import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, Info, Ship, TrendingUp } from "lucide-react";
import { PRICE_BENCHMARKS } from "@/lib/ferry/pricing";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { seoHead } from "@/lib/seo/site";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/barometre-prix")({
  head: () => seoHead(
    "Prix du ferry pour l'Algérie avec voiture : repères | BledWay",
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

const carPrices = routes.map(([, , key]) => PRICE_BENCHMARKS[key]!.withCar);
const faq = [
  {
    q: "Combien coûte un ferry pour l'Algérie avec une voiture ?",
    a: `Les repères d'aller simple avec voiture relevés en septembre–octobre 2026 vont d'environ ${Math.min(...carPrices)} € à ${Math.max(...carPrices)} € sur les lignes de ce tableau. Ce sont des estimations : le devis de la compagnie fait foi.`,
  },
  {
    q: "Ces prix sont-ils ceux de la voiture seule ?",
    a: "Non. La colonne « avec voiture » désigne un billet qui inclut un véhicule, pas le prix du véhicule seul.",
  },
  {
    q: "Quelle est la période la plus demandée ?",
    a: "La pointe estivale va de la mi-juillet à la fin août. Cette échelle est indicative et ne constitue pas un historique de prix mesurés.",
  },
];

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
      <Breadcrumbs items={[{ name: "Baromètre des prix", path: "/barometre-prix" }]} />
      <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-primary">{tr("ui.pageBarometrePrix.leBarometreBledwayOctobre2026")}</p>
      <div className="mt-3 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">{tr("ui.pageBarometrePrix.prixDuFerryPourL")}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{tr("ui.pageBarometrePrix.uneVoitureChangeReellementLe")}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-foreground"><Info className="size-5 shrink-0 text-primary" /><p>{tr("ui.pageBarometrePrix.cesMontantsSontDes")}<strong>{tr("ui.pageBarometrePrix.reperesObservesEtEstimes")}</strong>{tr("ui.pageBarometrePrix.jamaisDesPrixDisponiblesA")}</p></div>
      </div>

      <section className="mt-12" aria-labelledby="prices-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("ui.pageBarometrePrix.traverseeAllerSimple")}</p><h2 id="prices-title" className="mt-1 font-display text-2xl font-bold sm:text-3xl">{tr("ui.pageBarometrePrix.reperesPubliesParLigne")}</h2></div><span className="text-xs text-muted-foreground">{tr("ui.pageBarometrePrix.moyennesOuReperesAvecVoiture")}</span></div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-white"><table className="bw-stack-table w-full min-w-[580px] text-left text-sm"><thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-4">{tr("ui.pageBarometrePrix.ligne")}</th><th className="px-4 py-4">{tr("ui.pageBarometrePrix.pieton")}</th><th className="px-4 py-4">{tr("ui.pageBarometrePrix.avecVoiture")}</th><th className="px-4 py-4">{tr("ui.pageBarometrePrix.source")}</th></tr></thead><tbody>{routes.map(([from, to, key]) => { const item = PRICE_BENCHMARKS[key]!; return <tr key={key} className="border-t border-border"><th scope="row" className="px-5 py-4 font-semibold">{from} <ArrowRight className="mx-1 inline size-3 text-primary" /> {to}</th><td data-label={tr("ui.pageBarometrePrix.pieton")} className="px-4 py-4">{item.foot} €</td><td data-label={tr("ui.pageBarometrePrix.avecVoiture")} className="px-4 py-4 font-bold text-primary">{item.withCar} €</td><td data-label={tr("ui.pageBarometrePrix.source")} className="px-4 py-4"><a className="font-semibold text-primary underline underline-offset-2" href={item.source} target="_blank" rel="noopener noreferrer">{tr("ui.pageBarometrePrix.voirLeReleve")}</a></td></tr>; })}</tbody></table></div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{tr("ui.pageBarometrePrix.lesStatistiquesDesComparateursNe")}</p>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_.8fr]" aria-labelledby="season-title">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("ui.pageBarometrePrix.quandPartir")}</p><h2 id="season-title" className="mt-1 font-display text-2xl font-bold sm:text-3xl">{tr("ui.pageBarometrePrix.laSaisonCompteAutantQue")}</h2><div className="mt-6 space-y-5">{seasons.map((season) => <div key={season.level}><div className="flex flex-wrap justify-between gap-1 text-sm"><strong>{season.label}</strong><span className="text-muted-foreground">{season.level}</span></div><div className="mt-2 h-2 rounded-full bg-secondary"><div className={`h-2 rounded-full ${season.width} ${season.tone}`} /></div><p className="mt-1 text-xs text-muted-foreground">{season.hint}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-muted-foreground">{tr("ui.pageBarometrePrix.echelleIndicativeDePressionTarifaire")}<a className="font-semibold text-primary underline" href="https://www.corsicalinea.com/informations/legal/cgu-tarifs-generiques/" target="_blank" rel="noopener noreferrer">{tr("ui.pageBarometrePrix.corsicaLineaConfirmeLaVariation")}</a> ; <a className="font-semibold text-primary underline" href="https://www.aferry.com/fr-fr/ferry-deals/746afm/ferry-algerie-ete-2026-reservations-ouvertes/" target="_blank" rel="noopener noreferrer">{tr("ui.pageBarometrePrix.aferryDecritLaPointeDe")}</a>.</p></div>
        <aside className="rounded-3xl bg-[#e9f3ef] p-6 sm:p-8"><TrendingUp className="size-7 text-primary" /><h3 className="mt-4 font-display text-xl font-bold">{tr("ui.pageBarometrePrix.commentLireLEstimationBledway")}</h3><ol className="mt-4 space-y-4 text-sm leading-6"><li className="flex gap-3"><span className="font-bold text-primary">01</span><span>{tr("ui.pageBarometrePrix.unRepereDeLaLigne")}<CarFront className="inline size-4" />{tr("ui.pageBarometrePrix.vehiculeLorsqueVousEnChoisissez")}</span></li><li className="flex gap-3"><span className="font-bold text-primary">02</span><span>{tr("ui.pageBarometrePrix.uneModulationSelonLaPeriode")}</span></li><li className="flex gap-3"><span className="font-bold text-primary">03</span><span>{tr("ui.pageBarometrePrix.uneFourchetteElargiePourRefleter")}</span></li></ol><p className="mt-5 border-t border-primary/15 pt-4 text-xs leading-5 text-muted-foreground">{tr("ui.pageBarometrePrix.sansTarifTempsReelNous")}</p></aside>
      </section>

      <FaqSection faq={faq} path="/barometre-prix" />

      <section className="mt-14 rounded-3xl bg-[#0d3043] p-6 text-white sm:p-9"><Ship className="size-7 text-emerald-300" /><h2 className="mt-3 font-display text-2xl font-bold">{tr("ui.pageBarometrePrix.comparezUnVoyageCompletPas")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{tr("ui.pageBarometrePrix.unDepartDEspagnePeut")}</p><Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#0d3043]">{tr("ui.pageBarometrePrix.ouvrirLaCarte")}<ArrowRight className="size-4" /></Link></section>
    </main>
    <SiteFooter />
  </>;
}
