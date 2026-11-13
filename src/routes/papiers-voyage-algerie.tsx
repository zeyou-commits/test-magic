import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, LocateFixed, MapPin, Phone } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Breadcrumbs,
  EditorialHero,
  FaqSection,
  textLink,
} from "@/components/editorial/Editorial";
import {
  FORMALITES_CHECKED,
  consulatForDepartment,
  delais,
  departmentFromPostcode,
  formaliteSources,
  formalitesFor,
  momentLabels,
  type Children,
  type Consulat,
  type FormaliteSourceId,
  type Moment,
  type Nationality,
  type Profile,
  type Stay,
} from "@/content/formalites";
import { displayDate, seoHead } from "@/lib/seo/site";

const PATH = "/papiers-voyage-algerie";

export const Route = createFileRoute("/papiers-voyage-algerie")({
  head: () =>
    seoHead(
      "Papiers pour voyager en Algérie : visa, enfants, consulat | BledWay",
      "Visa, passeport algérien, autorisation paternelle, livret de famille, devises et consulat compétent : la liste des papiers selon votre profil, avec les sources officielles.",
      PATH,
    ),
  component: PapersPage,
});

const faq = [
  {
    q: "Faut-il un visa pour aller en Algérie avec un passeport français ?",
    a: "Oui. Le visa se demande avant le départ, au consulat d'Algérie de votre lieu de résidence, en personne et sur rendez-vous. L'ambassade annonce un délai habituel de 1 à 14 jours.",
  },
  {
    q: "Un binational franco-algérien a-t-il besoin d'un visa ?",
    a: "En Algérie, un binational est traité comme un Algérien et entre avec ses papiers algériens. Pour rentrer en France, il doit présenter une pièce d'identité française en cours de validité. Avec un seul passeport étranger, demandez au consulat ce qui s'applique à votre cas.",
  },
  {
    q: "Faut-il prendre le livret de famille ?",
    a: "Oui, si vous voyagez avec des enfants. En France, il ne peut pas être exigé à la sortie, même quand l'enfant ne porte pas votre nom, mais le consulat d'Algérie le demande pour le visa d'un mineur et il sert à prouver le lien de parenté.",
  },
  {
    q: "Mon enfant algérien part sans son père : que faut-il ?",
    a: "Une autorisation paternelle de sortie du territoire, délivrée par le consulat en présence du père et valable 3 mois. S'il quitte la France sans aucun de ses parents, il faut aussi l'autorisation de sortie du territoire (AST) ; avec sa mère, elle n'est pas nécessaire côté France.",
  },
  {
    q: "Faut-il se déclarer à la police quand on loge en famille ?",
    a: "La fiche officielle française indique que les étrangers doivent se signaler au bureau des étrangers de la wilaya de leur lieu de résidence, sans préciser si cela vaut pour un court séjour chez des proches. Aucune des sources officielles consultées ne décrit de déclaration pour un Algérien qui loge en famille. Posez la question au consulat et notez la réponse.",
    note: "Point non tranché par les sources officielles : BledWay ne l'affirme pas.",
  },
  {
    q: "Un couple peut-il partager une chambre d'hôtel ?",
    a: "Certains hôtels demandent à un couple non marié de prendre deux chambres. Les autorités belges conseillent aux couples mariés d'emporter un extrait d'acte de mariage.",
  },
];

function PapersPage() {
  const [profile, setProfile] = useState<Profile>({
    nationality: "binational",
    children: "none",
    married: false,
    stay: "family",
  });
  const items = useMemo(() => formalitesFor(profile), [profile]);
  const moments: Moment[] = ["avant", "frontiere", "surPlace", "retour"];
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Papiers et formalités", path: PATH }]} />
      <EditorialHero
        label="Préparer mon voyage"
        title="Papiers et formalités pour l'Algérie"
        intro="Visa, passeport, enfants, livret de famille, devises, consulat : répondez à quatre questions et obtenez la liste de vos papiers, dans l'ordre du voyage, avec la source officielle de chaque règle."
      />

      <section aria-labelledby="profil" className="rounded-2xl border bg-secondary/30 p-5 md:p-7">
        <h2 id="profil" className="font-display text-2xl font-bold">
          Votre situation
        </h2>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <Choice
            legend="Avec quels papiers entrez-vous en Algérie ?"
            value={profile.nationality}
            onChange={(v) => set("nationality", v as Nationality)}
            options={[
              { value: "binational", label: "Je suis binational (algérien et français, belge…)" },
              { value: "algerian", label: "Je suis algérien et je vis en Europe" },
              { value: "foreign", label: "Je n'ai pas la nationalité algérienne" },
            ]}
          />
          <Choice
            legend="Des enfants mineurs voyagent-ils ?"
            value={profile.children}
            onChange={(v) => set("children", v as Children)}
            options={[
              { value: "none", label: "Non" },
              { value: "withBoth", label: "Oui, avec leurs deux parents ou avec leur père" },
              { value: "withoutFather", label: "Oui, avec un seul parent (sans le père)" },
              { value: "alone", label: "Oui, seuls ou avec un autre adulte" },
            ]}
          />
          <Choice
            legend="Où logez-vous sur place ?"
            value={profile.stay}
            onChange={(v) => set("stay", v as Stay)}
            options={[
              { value: "family", label: "En famille ou chez des proches" },
              { value: "hotel", label: "À l'hôtel" },
            ]}
          />
          <Choice
            legend="Voyagez-vous en couple marié ?"
            value={profile.married ? "yes" : "no"}
            onChange={(v) => set("married", v === "yes")}
            options={[
              { value: "no", label: "Non" },
              { value: "yes", label: "Oui" },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="liste" className="mt-10" aria-live="polite">
        <h2 id="liste" className="font-display text-2xl font-bold">
          Vos papiers, étape par étape
        </h2>
        {moments.map((moment) => {
          const group = items.filter((i) => i.moment === moment);
          if (!group.length) return null;
          return (
            <div key={moment} className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
                {momentLabels[moment]}
              </h3>
              <ul className="mt-3 divide-y rounded-xl border">
                {group.map((item) => (
                  <li key={item.id} className="p-4 md:p-5">
                    <p className="flex items-start gap-2 font-semibold">
                      {item.toConfirm ? (
                        <AlertTriangle
                          size={18}
                          className="mt-0.5 shrink-0 text-amber-600"
                          aria-label="À faire confirmer"
                        />
                      ) : null}
                      <span>{item.title}</span>
                    </p>
                    <p className="mt-1.5 leading-relaxed text-muted-foreground">{item.detail}</p>
                    <SourceLinks ids={item.sources} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <ConsulatFinder />

      <section aria-labelledby="delais" className="mt-12">
        <h2 id="delais" className="font-display text-2xl font-bold">
          Quand s'y prendre
        </h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Seuls les délais publiés par les autorités sont donnés. Quand rien n'est publié, nous
          l'écrivons : le délai dépend alors du consulat et de la période.
        </p>
        <div className="mt-4 grid gap-3 md:hidden">
          {delais.map((d) => (
            <div key={d.demarche} className="rounded-xl border p-4">
              <p className="font-semibold">{d.demarche}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d.ou}</p>
              <p className="mt-2 text-sm">
                <span className="font-semibold">Délai : </span>
                {d.delai}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{d.conseil}</p>
              <SourceLinks ids={d.sources} />
            </div>
          ))}
        </div>
        <div className="mt-4 hidden overflow-hidden rounded-xl border md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="p-3 font-semibold">Démarche</th>
                <th className="p-3 font-semibold">Où</th>
                <th className="p-3 font-semibold">Délai publié</th>
                <th className="p-3 font-semibold">Notre conseil</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {delais.map((d) => (
                <tr key={d.demarche} className="align-top">
                  <td className="p-3 font-semibold">{d.demarche}</td>
                  <td className="p-3 text-muted-foreground">{d.ou}</td>
                  <td className="p-3">{d.delai}</td>
                  <td className="p-3 text-muted-foreground">
                    {d.conseil}
                    <SourceLinks ids={d.sources} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FaqSection faq={faq} path={PATH} />

      <section id="sources" className="mt-10 border-t pt-6">
        <h2 className="font-display text-xl font-bold">Sources officielles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pages consultées le{" "}
          <time dateTime={FORMALITES_CHECKED}>{displayDate(FORMALITES_CHECKED)}</time>. Les règles
          peuvent changer : le consulat d'Algérie et la police aux frontières restent la référence
          au moment du voyage.
        </p>
        <ul className="mt-4 space-y-3">
          {(Object.keys(formaliteSources) as FormaliteSourceId[]).map((id) => {
            const s = formaliteSources[id];
            return (
              <li key={id} className="text-sm">
                <a href={s.url} target="_blank" rel="noreferrer" className={textLink}>
                  {s.name}
                </a>
                {s.updated ? <span className="text-muted-foreground"> · {s.updated}</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-sm">
          <a href="/voyage-algerie" className={textLink}>
            Le guide du voyage
          </a>{" "}
          ·{" "}
          <a href="/vehicules-moins-3-ans" className={textLink}>
            Papiers de la voiture
          </a>{" "}
          ·{" "}
          <a href="/contact" className={textLink}>
            Signaler une règle qui a changé
          </a>
        </p>
      </section>
    </SiteLayout>
  );
}

function Choice({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset>
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-2 grid gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
          >
            <input
              type="radio"
              name={legend}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="size-4 accent-[var(--primary)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SourceLinks({ ids }: { ids: FormaliteSourceId[] }) {
  const unique = ids.filter((id, i) => ids.indexOf(id) === i);
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {unique.map((id) => (
        <a
          key={id}
          href={formaliteSources[id].url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          title={formaliteSources[id].name}
        >
          {formaliteSources[id].short}
          <ExternalLink size={12} aria-hidden />
          <span className="sr-only">(nouvel onglet)</span>
        </a>
      ))}
    </p>
  );
}

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; consulat: Consulat; where: string }
  | { state: "error"; message: string };

function ConsulatFinder() {
  const [postcode, setPostcode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });

  function show(department: string, where: string) {
    const consulat = consulatForDepartment(department);
    setLookup(
      consulat
        ? { state: "found", consulat, where }
        : { state: "error", message: "Aucun consulat trouvé pour ce département." },
    );
  }

  function fromPostcode(event: React.FormEvent) {
    event.preventDefault();
    const department = departmentFromPostcode(postcode);
    if (!department) {
      setLookup({ state: "error", message: "Saisissez un code postal français à 5 chiffres." });
      return;
    }
    show(department, `code postal ${postcode.replace(/\s/g, "")}`);
  }

  function fromPosition() {
    if (!navigator.geolocation) {
      setLookup({ state: "error", message: "La géolocalisation n'est pas disponible : saisissez votre code postal." });
      return;
    }
    setLookup({ state: "loading" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // Service public API Géo : la commune sous ce point, rien d'autre n'est envoyé.
          const url = `https://geo.api.gouv.fr/communes?lat=${coords.latitude.toFixed(3)}&lon=${coords.longitude.toFixed(3)}&fields=nom,codeDepartement&format=json`;
          const res = await fetch(url);
          const [commune] = (await res.json()) as { nom: string; codeDepartement: string }[];
          if (!commune) throw new Error("hors de France");
          show(commune.codeDepartement, commune.nom);
        } catch {
          setLookup({
            state: "error",
            message:
              "Position hors de France ou introuvable. Hors de France, adressez-vous au consulat d'Algérie de votre pays de résidence.",
          });
        }
      },
      () =>
        setLookup({ state: "error", message: "Position refusée ou indisponible : saisissez votre code postal." }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <section aria-labelledby="consulat" className="mt-12 rounded-2xl border p-5 md:p-7">
      <h2 id="consulat" className="font-display text-2xl font-bold">
        Mon consulat d'Algérie
      </h2>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Chaque démarche se fait au consulat de votre lieu de résidence. Les 18 consulats d'Algérie en
        France se partagent les départements : ce n'est pas toujours le plus proche.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <form onSubmit={fromPostcode} className="flex flex-1 gap-2">
          <label className="flex-1">
            <span className="text-sm font-semibold">Code postal de votre domicile</span>
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="13008"
              className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3"
            />
          </label>
          <button
            type="submit"
            className="mt-auto min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Trouver
          </button>
        </form>
        <button
          type="button"
          onClick={fromPosition}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
          <LocateFixed size={16} aria-hidden />
          Me localiser
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        « Me localiser » envoie votre position arrondie au service public API Géo, uniquement pour
        connaître votre commune. Rien n'est enregistré par BledWay.
      </p>
      <div aria-live="polite" className="mt-4">
        {lookup.state === "loading" ? <p className="text-sm">Recherche de votre commune…</p> : null}
        {lookup.state === "error" ? <p className="text-sm text-destructive">{lookup.message}</p> : null}
        {lookup.state === "found" ? <ConsulatCard consulat={lookup.consulat} where={lookup.where} /> : null}
      </div>
    </section>
  );
}

function ConsulatCard({ consulat, where }: { consulat: Consulat; where: string }): ReactNode {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 md:p-5">
      <p className="text-xs text-muted-foreground">Pour {where}</p>
      <p className="mt-1 font-display text-lg font-bold">{consulat.name}</p>
      <p className="mt-2 flex items-start gap-2 text-sm">
        <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
        {consulat.address}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <Phone size={16} className="shrink-0" aria-hidden />
        <a href={`tel:+33${consulat.phone.replace(/\s/g, "").slice(1)}`} className="hover:underline">
          {consulat.phone}
        </a>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={consulat.site}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Site et rendez-vous
          <ExternalLink size={14} aria-hidden />
        </a>
        <a
          href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(consulat.address)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-secondary"
        >
          Itinéraire
          <ExternalLink size={14} aria-hidden />
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ouvert du mardi au samedi. Passeports et cartes d'identité sur rendez-vous, à prendre sur le
        site du consulat.{" "}
        <a href={formaliteSources["amb-consulats"].url} target="_blank" rel="noreferrer" className="underline">
          Source : ambassade d'Algérie
        </a>
      </p>
    </div>
  );
}
