import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { formatDateParts } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import {
  adminNewsQuery,
  flashClient,
  newsKey,
  placeKinds,
  placesKey,
  portPlacesQuery,
  type NewsItem,
  type PlaceKind,
  type PortPlace,
  newsKinds,
} from "@/lib/ferry/flash";

const MISSING_SQL =
  "Module non activé : exécutez le script supabase/migrations/20261026120000_ma_traversee_flash_info.sql dans Supabase.";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const selected = (select: HTMLSelectElement) =>
  Array.from(select.selectedOptions).map((option) => option.value);

/**
 * Traversées datées concernées : on choisit un trajet, puis un ou plusieurs départs à venir.
 * Exemple : « le départ du 23 novembre est reporté » concerne cette traversée, pas tout le trajet.
 */
function DeparturePicker({
  value,
  onChange,
  routeLabel,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  routeLabel: (routeId: string) => string;
}) {
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const [routeId, setRouteId] = useState("");
  const label = (id: string) => {
    const departure = departures.find((item) => item.id === id);
    if (!departure) return "Traversée passée ou introuvable";
    const route = routes.find((item) => item.id === departure.route_id);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const parts = formatDateParts(departure.departure_at, portTimeZone(from));
    return `${parts.weekday} ${parts.shortDate} · ${parts.time} · ${routeLabel(departure.route_id)}`;
  };
  const options = departures
    .filter((item) => item.route_id === routeId && !value.includes(item.id))
    .slice(0, 60);
  const routeIds = [...new Set(departures.map((item) => item.route_id))];
  return (
    <fieldset className="grid gap-2 rounded-xl border border-dashed p-3">
      <legend className="px-1 text-xs font-semibold">
        Traversées datées concernées (facultatif)
      </legend>
      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((id) => (
            <li key={id} className="bw-flash-chip !mt-0 inline-flex items-center gap-2">
              {label(id)}
              <button
                type="button"
                aria-label="Retirer cette traversée"
                onClick={() => onChange(value.filter((item) => item !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <label>
          Trajet
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">— Choisir un trajet —</option>
            {routeIds.map((id) => (
              <option key={id} value={id}>
                {routeLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Départ
          <select
            value=""
            disabled={!routeId}
            onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          >
            <option value="">
              {routeId ? "— Ajouter un départ —" : "Choisissez d’abord un trajet"}
            </option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {label(item.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

type NewsDraft = {
  id?: string;
  kind: NewsItem["kind"];
  origin: NewsItem["origin"];
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  route_ids: string[];
  port_ids: string[];
  company_ids: string[];
  departure_ids: string[];
  /** L'actualité avait déjà des traversées : on enregistre aussi leur retrait. */
  hadDepartures?: boolean;
  starts_at: string;
  ends_at: string;
  published: boolean;
};
const emptyNews = (): NewsDraft => ({
  kind: "info",
  origin: "media",
  title: "",
  summary: "",
  source_name: "",
  source_url: "",
  route_ids: [],
  port_ids: [],
  company_ids: [],
  departure_ids: [],
  starts_at: toLocalInput(new Date().toISOString()),
  ends_at: "",
  published: true,
});

/** Flash info : sélection manuelle d'actualités et de perturbations Europe ↔ Algérie, toujours sourcées. */
export function NewsAdmin() {
  const queryClient = useQueryClient();
  const news = useQuery(adminNewsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "?";
  const save = useMutation({
    mutationFn: async (value: NewsDraft) => {
      const url = value.source_url.trim();
      if (url && !/^https:\/\//.test(url))
        throw new Error("Le lien source doit commencer par https://");
      const row = {
        kind: value.kind,
        origin: value.origin,
        title: capitalize(value.title.trim()),
        summary: capitalize(value.summary.trim()),
        source_name: capitalize(value.source_name.trim()),
        source_url: url || null,
        route_ids: value.route_ids,
        port_ids: value.port_ids,
        company_ids: value.company_ids,
        // Colonne ajoutée par le script du 27/10/2026 : envoyée seulement si des traversées sont choisies.
        ...(value.departure_ids.length || value.hadDepartures
          ? { departure_ids: value.departure_ids }
          : {}),
        starts_at: fromLocalInput(value.starts_at) ?? new Date().toISOString(),
        ends_at: fromLocalInput(value.ends_at),
        published: value.published,
        updated_at: new Date().toISOString(),
      };
      const result = value.id
        ? await flashClient.from("bw_news").update(row).eq("id", value.id)
        : await flashClient.from("bw_news").insert(row);
      if (result.error)
        throw new Error(
          /departure_ids/.test(result.error.message)
            ? "Pour rattacher une traversée, exécutez d’abord le script supabase/migrations/20261027120000_flash_info_traversees.sql dans Supabase."
            : result.error.message,
        );
    },
    onSuccess: () => {
      toast.success("Flash info enregistré.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: newsKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const result = await flashClient.from("bw_news").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      toast.success("Actualité supprimée.");
      void queryClient.invalidateQueries({ queryKey: newsKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (news.data === null) return <p className="text-sm text-amber-800">{MISSING_SQL}</p>;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft) save.mutate(draft);
  };
  const routeLabel = (id: string) => {
    const route = routes.find((item) => item.id === id);
    return route ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}` : id;
  };

  return (
    <section className="bw-content-admin space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Flash info</h2>
          <p className="text-sm text-muted-foreground">
            Actualités et perturbations Europe ↔ Algérie, affichées sur l’accueil, les fiches port
            et « Ma traversée ». Titre et court résumé rédigés par vous, avec le lien vers la
            source.
          </p>
        </div>
        {!draft ? <Button onClick={() => setDraft(emptyNews())}>Nouvelle actualité</Button> : null}
      </header>

      {draft ? (
        <form onSubmit={submit} className="rounded-2xl border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              Type
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as NewsDraft["kind"] })}
              >
                <option value="info">Info voyage</option>
                <option value="alerte">Alerte grave</option>
                <option value="perturbation">Perturbation</option>
              </select>
            </label>
            <label>
              Origine
              <select
                value={draft.origin}
                onChange={(e) =>
                  setDraft({ ...draft, origin: e.target.value as NewsDraft["origin"] })
                }
              >
                <option value="media">Média (information relayée)</option>
                <option value="official">Compagnie ou port (source officielle)</option>
                <option value="bledway">BledWay</option>
              </select>
            </label>
          </div>
          <label>
            Titre (idéal : 90 caractères, pour tenir sur une ligne)
            <input
              required
              minLength={4}
              maxLength={160}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Résumé en vos mots (400 caractères max.)
            <textarea
              maxLength={400}
              rows={3}
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              Nom de la source
              <input
                maxLength={80}
                placeholder="Ex. Maghreb Maritime"
                value={draft.source_name}
                onChange={(e) => setDraft({ ...draft, source_name: e.target.value })}
              />
            </label>
            <label>
              Lien de la source (https)
              <input
                type="url"
                placeholder="https://…"
                value={draft.source_url}
                onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              Trajets concernés
              <select
                multiple
                value={draft.route_ids}
                onChange={(e) => setDraft({ ...draft, route_ids: selected(e.target) })}
              >
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {routeLabel(route.id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ports concernés
              <select
                multiple
                value={draft.port_ids}
                onChange={(e) => setDraft({ ...draft, port_ids: selected(e.target) })}
              >
                {ports.map((port) => (
                  <option key={port.id} value={port.id}>
                    {port.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Compagnies concernées
              <select
                multiple
                value={draft.company_ids}
                onChange={(e) => setDraft({ ...draft, company_ids: selected(e.target) })}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Sans trajet, traversée, port ni compagnie, l’actualité concerne tout le réseau. Ctrl /
            Cmd + clic pour choisir plusieurs éléments.
          </p>
          <DeparturePicker
            value={draft.departure_ids}
            onChange={(departure_ids) => setDraft({ ...draft, departure_ids })}
            routeLabel={routeLabel}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              Visible à partir du
              <input
                type="datetime-local"
                required
                value={draft.starts_at}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
              />
            </label>
            <label>
              Jusqu’au (facultatif)
              <input
                type="datetime-local"
                value={draft.ends_at}
                onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
              />
            </label>
            <label className="!flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                className="!min-h-0"
              />
              Publiée
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {news.isPending ? (
        <p role="status">Chargement…</p>
      ) : news.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {news.error.message}
        </p>
      ) : (news.data ?? []).length ? (
        <ul className="grid gap-2">
          {(news.data ?? []).map((item) => {
            const live =
              item.published &&
              Date.parse(item.starts_at) <= Date.now() &&
              (!item.ends_at || Date.parse(item.ends_at) > Date.now());
            return (
              <li key={item.id} className="bw-admin-row">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {newsKinds[item.kind].label} ·{" "}
                    {item.source_name || "sans source"} ·{" "}
                    {live ? "en ligne" : item.published ? "programmée ou expirée" : "brouillon"}
                  </p>
                  <strong className="text-sm">{item.title}</strong>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: item.id,
                        kind: item.kind,
                        origin: item.origin,
                        title: item.title,
                        summary: item.summary,
                        source_name: item.source_name,
                        source_url: item.source_url ?? "",
                        route_ids: item.route_ids,
                        port_ids: item.port_ids,
                        company_ids: item.company_ids,
                        departure_ids: item.departure_ids,
                        hadDepartures: item.departure_ids.length > 0,
                        starts_at: toLocalInput(item.starts_at),
                        ends_at: toLocalInput(item.ends_at),
                        published: item.published,
                      })
                    }
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm("Supprimer définitivement cette actualité ?"))
                        remove.mutate(item.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune actualité pour le moment.</p>
      )}
    </section>
  );
}

type PlaceDraft = Omit<PortPlace, "id" | "latitude" | "longitude" | "verified_at"> & {
  id?: string;
  latitude: string;
  longitude: string;
  verified: boolean;
};
const emptyPlace = (portId: string): PlaceDraft => ({
  port_id: portId,
  kind: "fuel",
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  hours: "",
  note: "",
  distance_label: "",
  published: true,
  verified: true,
});

/** Lieux pratiques autour des ports : station-service, change, distributeur, pharmacie… */
export function PlacesAdmin() {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(portsQuery);
  const [portId, setPortId] = useState("");
  const places = useQuery({
    ...portPlacesQuery(portId || undefined, true),
    enabled: Boolean(portId),
  });
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const save = useMutation({
    mutationFn: async (value: PlaceDraft) => {
      const lat = value.latitude.trim() ? Number(value.latitude.replace(",", ".")) : null;
      const lng = value.longitude.trim() ? Number(value.longitude.replace(",", ".")) : null;
      if ((lat != null && Number.isNaN(lat)) || (lng != null && Number.isNaN(lng)))
        throw new Error("Coordonnées invalides (ex. 43.3389 et 5.3631).");
      const row = {
        port_id: value.port_id,
        kind: value.kind,
        name: value.name.trim(),
        address: value.address.trim(),
        latitude: lat,
        longitude: lng,
        hours: value.hours.trim(),
        note: value.note.trim(),
        distance_label: value.distance_label.trim(),
        published: value.published,
        verified_at: value.verified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const result = value.id
        ? await flashClient.from("bw_port_places").update(row).eq("id", value.id)
        : await flashClient.from("bw_port_places").insert(row);
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      toast.success("Lieu enregistré.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const result = await flashClient.from("bw_port_places").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      toast.success("Lieu supprimé.");
      void queryClient.invalidateQueries({ queryKey: placesKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="bw-content-admin space-y-4">
      <header>
        <h2 className="text-lg font-bold">Lieux pratiques</h2>
        <p className="text-sm text-muted-foreground">
          Stations-service, stationnement, change, distributeurs… autour de chaque port. Affichés
          dans l’onglet « Préparer » de la fiche port, avec un bouton d’itinéraire.
        </p>
      </header>
      <label className="max-w-sm">
        Port
        <select
          value={portId}
          onChange={(e) => {
            setPortId(e.target.value);
            setDraft(null);
          }}
        >
          <option value="">— Choisir un port —</option>
          {ports.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name} ({port.country_name})
            </option>
          ))}
        </select>
      </label>
      {portId && places.data === null ? (
        <p className="text-sm text-amber-800">{MISSING_SQL}</p>
      ) : null}
      {portId && places.data ? (
        <>
          {!draft ? (
            <Button onClick={() => setDraft(emptyPlace(portId))}>Ajouter un lieu</Button>
          ) : (
            <form
              className="rounded-2xl border bg-card p-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft);
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  Type de lieu
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlaceKind })}
                  >
                    {(Object.keys(placeKinds) as PlaceKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {placeKinds[kind].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nom
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Adresse
                <input
                  maxLength={200}
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label>
                  Latitude (facultatif)
                  <input
                    inputMode="decimal"
                    value={draft.latitude}
                    onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
                  />
                </label>
                <label>
                  Longitude (facultatif)
                  <input
                    inputMode="decimal"
                    value={draft.longitude}
                    onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
                  />
                </label>
                <label>
                  Distance (ex. « 5 min avant l’entrée »)
                  <input
                    maxLength={60}
                    value={draft.distance_label}
                    onChange={(e) => setDraft({ ...draft, distance_label: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  Horaires
                  <input
                    maxLength={120}
                    placeholder="Ex. 24 h/24"
                    value={draft.hours}
                    onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                  />
                </label>
                <label>
                  Conseil d’accès
                  <input
                    maxLength={300}
                    placeholder="Ex. Sortie 4, avant le rond-point du terminal"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="!flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="!min-h-0"
                    checked={draft.published}
                    onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                  />
                  Publié
                </label>
                <label className="!flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="!min-h-0"
                    checked={draft.verified}
                    onChange={(e) => setDraft({ ...draft, verified: e.target.checked })}
                  />
                  Vérifié aujourd’hui
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          )}
          {places.data.length ? (
            <ul className="grid gap-2">
              {places.data.map((place) => (
                <li key={place.id} className="bw-admin-row">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {placeKinds[place.kind].label}
                      {place.published ? "" : " · masqué"}
                      {place.verified_at
                        ? ` · vérifié le ${new Date(place.verified_at).toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                    <strong className="text-sm">{place.name}</strong>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          id: place.id,
                          port_id: place.port_id,
                          kind: place.kind,
                          name: place.name,
                          address: place.address,
                          latitude: place.latitude?.toString() ?? "",
                          longitude: place.longitude?.toString() ?? "",
                          hours: place.hours,
                          note: place.note,
                          distance_label: place.distance_label,
                          published: place.published,
                          verified: Boolean(place.verified_at),
                        })
                      }
                    >
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Supprimer ce lieu ?")) remove.mutate(place.id);
                      }}
                    >
                      Supprimer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun lieu pour ce port.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
