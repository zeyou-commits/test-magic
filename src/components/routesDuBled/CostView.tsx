import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Coins, Fuel, Ship, SlidersHorizontal } from "lucide-react";
import { tr } from "@/lib/i18n";
import { euros, type Cout, type Reglages } from "@/lib/routesDuBled/budget";

const VEHICULES: { id: Reglages["vehicule"]; label: string }[] = [
  { id: "city", label: "Citadine" },
  { id: "sedan", label: "Berline" },
  { id: "suv", label: "4x4 / SUV" },
  { id: "van", label: "Ludospace" },
  { id: "utility", label: "Utilitaire" },
];
const nomMois = (m: number) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2026, m - 1, 10));

/** Le prix d'une route, affiché seulement quand le voyageur le demande. */
export function CostView({
  cout,
  de,
  a,
  ligne,
  reglages,
  onReglages,
}: {
  cout: Cout;
  de: string;
  a: string;
  ligne: string | null;
  reglages: Reglages;
  onReglages: (r: Reglages) => void;
}) {
  const [edit, setEdit] = useState(false);
  const n = reglages.adultes + reglages.enfants;
  const vehicule = VEHICULES.find((v) => v.id === reglages.vehicule)?.label ?? "";
  const set = (patch: Partial<Reglages>) => onReglages({ ...reglages, ...patch });
  return (
    <div className="rdb-cost__box">
      <p className="rdb-cost__total">
        <b>≈ {euros(cout.total)}</b>
        <span>
          {tr("ui.pageRoutesDuBled.coutEntre", { low: euros(cout.low), high: euros(cout.high) })}
        </span>
      </p>
      <div className="rdb-cost__for">
        <span>
          {tr("ui.pageRoutesDuBled.coutPour", {
            voyageurs: tr(
              n > 1 ? "ui.pageRoutesDuBled.nVoyageurs" : "ui.pageRoutesDuBled.unVoyageur",
              { n },
            ),
            vehicule: vehicule.toLowerCase(),
            mois: nomMois(reglages.mois),
          })}
        </span>
        <button type="button" aria-expanded={edit} onClick={() => setEdit(!edit)}>
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {tr("ui.pageRoutesDuBled.coutModifier")}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </div>
      {edit ? (
        <div className="rdb-cost__form">
          <label>
            {tr("ui.pageRoutesDuBled.reglMois")}
            <select value={reglages.mois} onChange={(e) => set({ mois: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {nomMois(i + 1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("ui.pageRoutesDuBled.reglVehicule")}
            <select
              value={reglages.vehicule}
              onChange={(e) => set({ vehicule: e.target.value as Reglages["vehicule"] })}
            >
              {VEHICULES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("ui.pageRoutesDuBled.reglAdultes")}
            <select
              value={reglages.adultes}
              onChange={(e) => set({ adultes: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("ui.pageRoutesDuBled.reglEnfants")}
            <select
              value={reglages.enfants}
              onChange={(e) => set({ enfants: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <ul className="rdb-cost__lines">
        <li>
          <Ship className="size-4" aria-hidden />
          <span>{tr("ui.pageRoutesDuBled.coutTraversee", { de, a })}</span>
          <b>{euros(cout.traversee.amount)}</b>
        </li>
        <li>
          <Fuel className="size-4" aria-hidden />
          <span>{tr("ui.pageRoutesDuBled.coutEssence")}</span>
          <b>{euros(cout.essence)}</b>
        </li>
        {cout.peages >= 5 ? (
          <li>
            <Coins className="size-4" aria-hidden />
            <span>{tr("ui.pageRoutesDuBled.coutPeages")}</span>
            <b>{euros(cout.peages)}</b>
          </li>
        ) : null}
      </ul>
      <p className="rdb-cost__note">
        {tr("ui.pageRoutesDuBled.coutNote")}{" "}
        {ligne ? (
          <Link
            to="/lignes/$slug"
            params={{ slug: ligne }}
            className="underline underline-offset-2"
          >
            {tr("ui.pageRoutesDuBled.voirDeparts")}
          </Link>
        ) : null}
      </p>
    </div>
  );
}
