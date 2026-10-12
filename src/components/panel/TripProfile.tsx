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
}

export const defaultTripProfile: TripProfileValue = {
  vehicle: "none",
  accessories: [],
  passengers: { adults: 2, seniors: 0, children: 0, babies: 0, pets: 0 },
};

export const VEHICLES: { id: VehicleKind; Icon: LucideIcon; label: string; hint: string }[] = [
  { id: "none", Icon: PersonStanding, label: "Piéton", hint: "Sans véhicule" },
  { id: "city", Icon: Car, label: "Citadine", hint: "Clio, 208, Sandero" },
  { id: "sedan", Icon: CarFront, label: "Berline", hint: "308 SW, Passat" },
  { id: "suv", Icon: Car, label: "4x4 / SUV", hint: "3008, Duster, Tiguan" },
  { id: "van", Icon: Bus, label: "Ludospace", hint: "Kangoo, Berlingo" },
  { id: "utility", Icon: Truck, label: "Utilitaire", hint: "Trafic, Master" },
];

export const ACCESSORIES: { id: Accessory; Icon: LucideIcon; label: string }[] = [
  { id: "roofbox", Icon: Package, label: "Coffre de toit" },
  { id: "trailer", Icon: Caravan, label: "Remorque" },
  { id: "bikes", Icon: Bike, label: "Porte-vélos" },
];

// Les tranches d'âge varient selon les compagnies : elles sont données à titre indicatif.
const PASSENGER_ROWS: {
  key: keyof Passengers;
  Icon: LucideIcon;
  label: string;
  hint: string;
  min: number;
}[] = [
  { key: "adults", Icon: User, label: "Adultes", hint: "12–59 ans (indicatif)", min: 0 },
  { key: "seniors", Icon: UserRound, label: "Seniors", hint: "60 ans et + (indicatif)", min: 0 },
  { key: "children", Icon: User, label: "Enfants", hint: "4–11 ans (indicatif)", min: 0 },
  { key: "babies", Icon: Baby, label: "Bébés", hint: "0–3 ans (indicatif)", min: 0 },
  { key: "pets", Icon: PawPrint, label: "Animaux", hint: "Chien, chat", min: 0 },
];

export function summarizePassengers(p: Passengers) {
  const parts = [
    p.adults && `${p.adults} adulte${p.adults > 1 ? "s" : ""}`,
    p.seniors && `${p.seniors} senior${p.seniors > 1 ? "s" : ""}`,
    p.children && `${p.children} enfant${p.children > 1 ? "s" : ""}`,
    p.babies && `${p.babies} bébé${p.babies > 1 ? "s" : ""}`,
    p.pets && `${p.pets} animal${p.pets > 1 ? "aux" : ""}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Aucun voyageur";
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
}: {
  value: TripProfileValue;
  onChange: (value: TripProfileValue) => void;
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
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Votre véhicule</p>
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

      {value.vehicle !== "none" ? (
        <div className="flex flex-wrap gap-1.5">
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

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Voyageurs</p>
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
                aria-label={`Retirer : ${label}`}
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
                aria-label={`Ajouter : ${label}`}
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
