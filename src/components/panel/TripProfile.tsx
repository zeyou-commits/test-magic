import { Minus, Plus } from "lucide-react";

export type VehicleKind = "none" | "city" | "sedan" | "suv" | "van" | "utility";
export type Accessory = "roofbox" | "trailer" | "bikes";
export interface Passengers { adults: number; seniors: number; children: number; babies: number; pets: number }
export interface TripProfileValue { vehicle: VehicleKind; accessories: Accessory[]; passengers: Passengers }

export const defaultTripProfile: TripProfileValue = {
  vehicle: "none",
  accessories: [],
  passengers: { adults: 2, seniors: 0, children: 0, babies: 0, pets: 0 },
};

export const VEHICLES: { id: VehicleKind; icon: string; label: string; hint: string }[] = [
  { id: "none", icon: "🚶", label: "Piéton", hint: "Sans véhicule" },
  { id: "city", icon: "🚗", label: "Citadine", hint: "Clio, 208, Sandero" },
  { id: "sedan", icon: "🚘", label: "Berline", hint: "308 SW, Passat" },
  { id: "suv", icon: "🚙", label: "4x4 / SUV", hint: "3008, Duster, Tiguan" },
  { id: "van", icon: "🚐", label: "Ludospace", hint: "Kangoo, Berlingo" },
  { id: "utility", icon: "🚚", label: "Utilitaire", hint: "Trafic, Master" },
];

export const ACCESSORIES: { id: Accessory; icon: string; label: string }[] = [
  { id: "roofbox", icon: "📦", label: "Coffre de toit" },
  { id: "trailer", icon: "🛻", label: "Remorque" },
  { id: "bikes", icon: "🚲", label: "Porte-vélos" },
];

const PASSENGER_ROWS: { key: keyof Passengers; icon: string; label: string; hint: string; min: number }[] = [
  { key: "adults", icon: "🧑", label: "Adultes", hint: "12–59 ans", min: 0 },
  { key: "seniors", icon: "🧓", label: "Seniors", hint: "60 ans et +", min: 0 },
  { key: "children", icon: "🧒", label: "Enfants", hint: "4–11 ans", min: 0 },
  { key: "babies", icon: "👶", label: "Bébés", hint: "0–3 ans", min: 0 },
  { key: "pets", icon: "🐾", label: "Animaux", hint: "Chien, chat", min: 0 },
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
  const extras = ACCESSORIES.filter((item) => value.accessories.includes(item.id)).map((item) => `${item.icon} ${item.label}`);
  return `${vehicle.icon} ${vehicle.label}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
}

export function TripProfile({ value, onChange }: { value: TripProfileValue; onChange: (value: TripProfileValue) => void }) {
  const setCount = (key: keyof Passengers, delta: number) => {
    const next = Math.max(0, Math.min(9, value.passengers[key] + delta));
    onChange({ ...value, passengers: { ...value.passengers, [key]: next } });
  };
  const toggleAccessory = (id: Accessory) =>
    onChange({ ...value, accessories: value.accessories.includes(id) ? value.accessories.filter((a) => a !== id) : [...value.accessories, id] });

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Votre véhicule</p>
        <div className="grid grid-cols-3 gap-1.5">
          {VEHICLES.map((item) => {
            const selected = value.vehicle === item.id;
            return (
              <button key={item.id} type="button" aria-pressed={selected}
                onClick={() => onChange({ ...value, vehicle: item.id, accessories: item.id === "none" ? [] : value.accessories })}
                className={`rounded-xl border px-1.5 py-2 text-center transition ${selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:bg-muted"}`}>
                <span className="block text-2xl leading-none" aria-hidden>{item.icon}</span>
                <span className="mt-1 block text-[11px] font-semibold">{item.label}</span>
                <span className="block truncate text-[9px] text-muted-foreground">{item.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {value.vehicle !== "none" ? (
        <div className="flex flex-wrap gap-1.5">
          {ACCESSORIES.map((item) => {
            const selected = value.accessories.includes(item.id);
            return (
              <button key={item.id} type="button" aria-pressed={selected} onClick={() => toggleAccessory(item.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>
                {item.icon} {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Voyageurs</p>
        <div className="divide-y divide-border/50 rounded-xl bg-background">
          {PASSENGER_ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-lg" aria-hidden>{row.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{row.label}</span>
                <span className="block text-[10px] text-muted-foreground">{row.hint}</span>
              </span>
              <button type="button" aria-label={`Retirer ${row.label}`} onClick={() => setCount(row.key, -1)} disabled={value.passengers[row.key] <= row.min}
                className="grid size-7 place-items-center rounded-full border border-border disabled:opacity-30"><Minus className="size-3" /></button>
              <span className="w-4 text-center text-sm font-semibold tabular-nums">{value.passengers[row.key]}</span>
              <button type="button" aria-label={`Ajouter ${row.label}`} onClick={() => setCount(row.key, 1)}
                className="grid size-7 place-items-center rounded-full border border-border"><Plus className="size-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
