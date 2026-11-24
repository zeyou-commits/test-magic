import { useEffect, useState } from "react";
import { ArrowLeftRight, CalendarDays, ChevronRight, Ship, Users } from "lucide-react";
import { PortMultiPicker } from "@/components/panel/PortFilters";
import {
  defaultTripProfile,
  summarizePassengers,
  summarizeVehicle,
  type TripProfileValue,
} from "@/components/panel/TripProfile";
import { swapDirection, withArrivalPorts, withDeparturePorts } from "@/lib/ferry/filtering";
import { isNorthShore, isSouthShore } from "@/lib/ferry/markets";
import { readTravelProfile, TRAVEL_PROFILE_EVENT } from "@/lib/ferry/travelProfile";
import type { Filters, Port, RouteLine } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const day = (key: string) => dayFormatter.format(new Date(`${key}T00:00:00Z`));

/**
 * Accueil du navigateur mobile : la recherche tient dans une carte compacte au-dessus de la carte.
 * D'abord le départ et l'arrivée ; « Quand » apparaît une fois les ports choisis, « Qui voyage »
 * une fois la date choisie. Les dates et les voyageurs s'ouvrent dans l'écran de recherche habituel.
 */
export function HomeSearchCard({
  filters,
  onFiltersChange,
  ports,
  routes,
  onDates,
  onTravellers,
  onShow,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  ports: Port[];
  routes: RouteLine[];
  onDates: () => void;
  onTravellers: () => void;
  onShow: () => void;
}) {
  const [portOpen, setPortOpen] = useState<"departure" | "arrival" | null>(null);
  const [profile, setProfile] = useState<TripProfileValue>(defaultTripProfile);
  useEffect(() => {
    const load = () => setProfile(readTravelProfile() ?? defaultTripProfile);
    load();
    window.addEventListener(TRAVEL_PROFILE_EVENT, load);
    return () => window.removeEventListener(TRAVEL_PROFILE_EVENT, load);
  }, []);

  const reversed = filters.direction === "dz-eu";
  const hasPair = filters.departurePortIds.length > 0 && filters.arrivalPortIds.length > 0;
  // Après la fermeture animée du choix précédent (sinon le suivant se refermerait aussitôt).
  const later = (fn: () => void) => window.setTimeout(fn, 320);
  const onPortOpenChange = (direction: "departure" | "arrival") => (next: boolean) => {
    if (next) return setPortOpen(direction);
    setPortOpen(null);
    if (direction === "departure") {
      if (filters.departurePortIds.length && !filters.arrivalPortIds.length)
        later(() => setPortOpen("arrival"));
      return;
    }
    // Les deux ports choisis : on enchaîne sur les dates, comme dans le formulaire.
    if (filters.departurePortIds.length && filters.arrivalPortIds.length && !filters.date)
      later(onDates);
  };
  const dates = filters.date
    ? `${day(filters.date)}${
        filters.roundTrip
          ? ` → ${filters.returnDate ? day(filters.returnDate) : "retour à choisir"}`
          : ""
      }${filters.flexDays ? ` ±${filters.flexDays} j` : ""}`
    : "Choisir les dates";
  const travellers = `${summarizePassengers(profile.passengers)}${
    profile.vehicle !== "none" ? ` · ${summarizeVehicle(profile)}` : " · sans véhicule"
  }`;

  return (
    <section id="bw-home-card" className="bw-home-card" aria-labelledby="bw-home-card-title">
      <h2 id="bw-home-card-title">{tr("ui.homeSearchCard.reserverUneTraversee")}</h2>
      <div className="bw-home-card__modes">
        <div
          className="batogo-tabbar inline-grid grid-cols-2 gap-0.5 !rounded-full !p-0.5"
          role="radiogroup"
          aria-label={tr("ui.homeSearchCard.typeDeVoyage")}
        >
          {[true, false].map((round) => (
            <button
              key={String(round)}
              type="button"
              role="radio"
              aria-checked={filters.roundTrip === round}
              data-active={filters.roundTrip === round}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  roundTrip: round,
                  returnDate: round ? filters.returnDate : null,
                })
              }
              className="batogo-tab !min-h-7 !rounded-full px-3 !text-xs"
            >
              {round ? tr("ui.homeSearchCard.allerRetour") : tr("ui.homeSearchCard.allerSimple")}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bw-home-card__swap"
          title={tr("ui.homeSearchCard.inverserLeSens")}
          onClick={() => onFiltersChange(swapDirection(filters))}
          aria-label={`Inverser le sens : actuellement ${reversed ? "Algérie → Europe" : "Europe → Algérie"}`}
        >
          <ArrowLeftRight size={16} aria-hidden />
        </button>
      </div>
      <div className="bw-home-card__ports">
        <PortMultiPicker
          title={tr("ui.homeSearchCard.depart")}
          direction="departure"
          ports={ports}
          routes={routes}
          countryFilter={reversed ? isSouthShore : isNorthShore}
          value={filters.departurePortIds}
          otherSide={filters.arrivalPortIds}
          onChange={(ids) => onFiltersChange(withDeparturePorts(filters, ids, ports, routes))}
          open={portOpen === "departure"}
          onOpenChange={onPortOpenChange("departure")}
        />
        <PortMultiPicker
          title={tr("ui.homeSearchCard.arrivee")}
          direction="arrival"
          ports={ports}
          routes={routes}
          countryFilter={reversed ? isNorthShore : isSouthShore}
          value={filters.arrivalPortIds}
          otherSide={filters.departurePortIds}
          onChange={(ids) => onFiltersChange(withArrivalPorts(filters, ids, ports, routes))}
          open={portOpen === "arrival"}
          onOpenChange={onPortOpenChange("arrival")}
        />
      </div>
      {hasPair ? (
        <button type="button" className="bw-home-card__row" onClick={onDates}>
          <CalendarDays size={18} aria-hidden />
          <span>
            <small>{tr("ui.homeSearchCard.quandPartezVous")}</small>
            <strong data-empty={!filters.date || undefined}>{dates}</strong>
          </span>
          <ChevronRight size={18} aria-hidden />
        </button>
      ) : null}
      {hasPair && filters.date ? (
        <button type="button" className="bw-home-card__row" onClick={onTravellers}>
          <Users size={18} aria-hidden />
          <span>
            <small>{tr("ui.homeSearchCard.quiVoyageAvecQuelVehicule")}</small>
            <strong>{travellers}</strong>
          </span>
          <ChevronRight size={18} aria-hidden />
        </button>
      ) : null}
      {hasPair ? (
        <button type="button" className="bw-home-card__go" onClick={onShow}>
          <Ship size={18} aria-hidden />
          {tr("ui.homeSearchCard.afficherLesDeparts")}
        </button>
      ) : null}
    </section>
  );
}
