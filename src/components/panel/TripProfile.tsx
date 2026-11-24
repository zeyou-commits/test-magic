import {
  Baby,
  Bike,
  Bus,
  Car,
  CarFront,
  Caravan,
  Minus,
  Package,
  PawPrint,
  PersonStanding,
  Plus,
  Truck,
  User,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { tr } from "@/lib/i18n";
import type { CarLoad, CarModel } from "@/lib/directferries/quote";
import { CarModelPicker } from "./CarModelPicker";

export type VehicleKind = "none" | "city" | "sedan" | "suv" | "van" | "utility";
export type Accessory = "roofbox" | "trailer" | "bikes";
export interface Passengers {
  adults: number;
  seniors: number;
  children: number;
  babies: number;
  pets: number;
}
export interface TripProfileValue {
  vehicle: VehicleKind;
  accessories: Accessory[];
  passengers: Passengers;
  /** Modèle exact (catalogue Direct Ferries), pour un prix et une catégorie justes. */
  car?: CarModel | null;
  /** Hauteur/longueur ajoutées corrigées par le voyageur (galerie chargée, porte-vélos…). */
  load?: CarLoad | null;
}

export const defaultTripProfile: TripProfileValue = {
  vehicle: "sedan",
  accessories: [],
  passengers: { adults: 2, seniors: 0, children: 0, babies: 0, pets: 0 },
};

export const VEHICLES: { id: VehicleKind; Icon: LucideIcon; label: string; hint: string }[] = [
  { id: "none", Icon: PersonStanding, get label() { return tr("ui.tripProfile.pieton"); }, get hint() { return tr("ui.tripProfile.sansVehicule"); } },
  { id: "city", Icon: Car, get label() { return tr("ui.tripProfile.citadine"); }, get hint() { return tr("ui.tripProfile.clio208Sandero"); } },
  { id: "sedan", Icon: CarFront, get label() { return tr("ui.tripProfile.berline"); }, get hint() { return tr("ui.tripProfile.t308SwPassat"); } },
  { id: "suv", Icon: Car, label: "4x4 / SUV", get hint() { return tr("ui.tripProfile.t3008DusterTiguan"); } },
  { id: "van", Icon: Bus, get label() { return tr("ui.tripProfile.ludospace"); }, get hint() { return tr("ui.tripProfile.kangooBerlingo"); } },
  { id: "utility", Icon: Truck, get label() { return tr("ui.tripProfile.utilitaire"); }, get hint() { return tr("ui.tripProfile.traficMaster"); } },
];

export const ACCESSORIES: { id: Accessory; Icon: LucideIcon; label: string }[] = [
  { id: "roofbox", Icon: Package, get label() { return tr("ui.tripProfile.coffreDeToit"); } },
  { id: "trailer", Icon: Caravan, get label() { return tr("ui.tripProfile.remorque"); } },
  { id: "bikes", Icon: Bike, get label() { return tr("ui.tripProfile.porteVelos"); } },
];

// Les tranches d'âge varient selon les compagnies : elles sont données à titre indicatif.
const PASSENGER_ROWS: {
  key: keyof Passengers;
  Icon: LucideIcon;
  label: string;
  hint: string;
  min: number;
}[] = [
  { key: "adults", Icon: User, get label() { return tr("ui.tripProfile.adultes"); }, get hint() { return tr("ui.tripProfile.t1259AnsIndicatif"); }, min: 0 },
  { key: "seniors", Icon: UserRound, get label() { return tr("ui.tripProfile.seniors"); }, get hint() { return tr("ui.tripProfile.t60AnsEtIndicatif"); }, min: 0 },
  { key: "children", Icon: User, get label() { return tr("ui.tripProfile.enfants"); }, get hint() { return tr("ui.tripProfile.t411AnsIndicatif"); }, min: 0 },
  { key: "babies", Icon: Baby, get label() { return tr("ui.tripProfile.bebes"); }, get hint() { return tr("ui.tripProfile.t03AnsIndicatif"); }, min: 0 },
  { key: "pets", Icon: PawPrint, get label() { return tr("ui.tripProfile.animaux"); }, get hint() { return tr("ui.tripProfile.chienChat"); }, min: 0 },
];

export function summarizePassengers(p: Passengers) {
  const parts = [
    p.adults && `${p.adults} adulte${p.adults > 1 ? "s" : ""}`,
    p.seniors && `${p.seniors} senior${p.seniors > 1 ? "s" : ""}`,
    p.children && `${p.children} enfant${p.children > 1 ? "s" : ""}`,
    p.babies && tr("ui.tripProfile.bebe", { babies: p.babies, v: p.babies > 1 ? "s" : "" }),
    p.pets && `${p.pets} animal${p.pets > 1 ? "aux" : ""}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : tr("ui.tripProfile.aucunVoyageur");
}

export function summarizeVehicle(value: TripProfileValue) {
  const vehicle = VEHICLES.find((item) => item.id === value.vehicle)!;
  const extras = ACCESSORIES.filter((item) => value.accessories.includes(item.id)).map((item) =>
    item.label.toLowerCase(),
  );
  return `${vehicle.label}${extras.length ? ` + ${extras.join(", ")}` : ""}`;
}

export function TripProfile({
  value,
  onChange,
  hideVehicle = false,
}: {
  value: TripProfileValue;
  onChange: (value: TripProfileValue) => void;
  /** Le véhicule est déjà choisi ailleurs (pastilles du volet) : on ne garde que les options. */
  hideVehicle?: boolean;
}) {
  const setCount = (key: keyof Passengers, delta: number) => {
    const next = Math.max(0, Math.min(9, value.passengers[key] + delta));
    onChange({ ...value, passengers: { ...value.passengers, [key]: next } });
  };
  const toggleAccessory = (id: Accessory) =>
    onChange({
      ...value,
      accessories: value.accessories.includes(id)
        ? value.accessories.filter((a) => a !== id)
        : [...value.accessories, id],
    });

  return (
    <div className="space-y-4">
      {hideVehicle ? null : (
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{tr("ui.tripProfile.votreVehicule")}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {VEHICLES.map(({ id, Icon, label, hint }) => {
            const selected = value.vehicle === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    ...value,
                    vehicle: id,
                    accessories: id === "none" ? [] : value.accessories,
                    // Un autre gabarit : le modèle exact choisi avant ne vaut plus.
                    car: id === value.vehicle ? (value.car ?? null) : null,
                  })
                }
                className={`rounded-xl border px-1.5 py-2 text-center transition ${selected ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-background hover:bg-muted"}`}
              >
                <Icon className="mx-auto size-6" aria-hidden />
                <span className="mt-1 block text-xs font-semibold text-foreground">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {value.vehicle !== "none" ? (
        <div className="flex flex-wrap gap-1.5">
          {hideVehicle ? <p className="w-full text-xs font-semibold text-muted-foreground">{tr("ui.tripProfile.optionsDuVehicule")}</p> : null}
          {ACCESSORIES.map(({ id, Icon, label }) => {
            const selected = value.accessories.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleAccessory(id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {value.vehicle !== "none" ? <CarModelPicker value={value} onChange={onChange} /> : null}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tr("ui.tripProfile.voyageurs")}</p>
        <div className="divide-y divide-border/50 rounded-xl bg-background">
          {PASSENGER_ROWS.map(({ key, Icon, label, hint, min }) => (
            <div key={key} className="flex items-center gap-2 px-3 py-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
              <button
                type="button"
                aria-label={tr("ui.tripProfile.retirer", { label })}
                onClick={() => setCount(key, -1)}
                disabled={value.passengers[key] <= min}
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-30"
              >
                <Minus className="size-3.5" />
              </button>
              <span
                className="w-5 text-center text-sm font-semibold tabular-nums"
                aria-live="polite"
              >
                {value.passengers[key]}
              </span>
              <button
                type="button"
                aria-label={tr("ui.tripProfile.ajouter", { label })}
                onClick={() => setCount(key, 1)}
                disabled={value.passengers[key] >= 9}
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-30"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Choix du véhicule en pastilles (icône + libellé court), défilement horizontal sur smartphone. */
export function VehicleChips({
  value,
  onChange,
}: {
  value: TripProfileValue;
  onChange: (value: TripProfileValue) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={tr("ui.tripProfile.votreVehicule")}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:-mx-5 md:px-5 [&::-webkit-scrollbar]:hidden"
    >
      {VEHICLES.map(({ id, Icon, label, hint }) => {
        const selected = value.vehicle === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={hint}
            onClick={() =>
              onChange({
                ...value,
                vehicle: id,
                accessories: id === "none" ? [] : value.accessories,
                car: id === value.vehicle ? (value.car ?? null) : null,
              })
            }
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition active:scale-95 ${selected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
