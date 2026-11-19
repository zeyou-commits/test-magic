import { describe, expect, it } from "vitest";
import {
  buildPassengers,
  buildVehicle,
  loadFromAccessories,
  matchPort,
  pickQuote,
  pickRoute,
  summarizeAccommodations,
  summarizeQuote,
  type DfRoute,
} from "./quote";

const route = (id: number, to: string, operator: string, vehicle = true): DfRoute => ({
  routeId: id,
  name: "",
  isVehicle: vehicle,
  isFootPassenger: true,
  portTo: { code: to, name: to },
  operator: { id: id * 10, name: operator },
});

describe("Direct Ferries : préparation du devis", () => {
  it("trouve le port le plus proche, jamais un port lointain", () => {
    const ports = [
      { code: "MRS", name: "Marseille", latitude: 43.33, longitude: 5.34 },
      { code: "TLN", name: "Toulon", latitude: 43.11, longitude: 5.93 },
    ];
    expect(matchPort({ name: "Marseille", latitude: 43.31, longitude: 5.36 }, ports)?.code).toBe("MRS");
    expect(matchPort({ name: "Sète", latitude: 43.4, longitude: 3.7 }, ports)).toBeNull();
    // Sans coordonnées côté partenaire : repli sur le nom (alias français → anglais).
    expect(
      matchPort({ name: "Alger", latitude: 36.77, longitude: 3.06 }, [
        { code: "ALG", name: "Algiers", latitude: null, longitude: null },
      ])?.code,
    ).toBe("ALG");
  });

  it("garde la ligne de la même compagnie, sinon aucune", () => {
    const routes = [route(1, "ALG", "Algerie Ferries"), route(2, "ALG", "Corsica Linea")];
    expect(pickRoute(routes, "ALG", "Corsica Linea", true)?.routeId).toBe(2);
    expect(pickRoute(routes, "ALG", "Baleària", true)).toBeNull();
    expect(pickRoute([route(3, "ALG", "X", false)], "ALG", null, true)).toBeNull();
  });

  it("répartit les voyageurs dans les tranches de la compagnie", () => {
    const list = buildPassengers({ adults: 2, seniors: 0, children: 1, babies: 1 }, [
      { label: "Adult", from: 14, to: 999 },
      { label: "Child", from: 1, to: 13 },
      { label: "Infant", from: 0, to: 0 },
    ]);
    expect(list.map((p) => p.type)).toEqual(["Adult", "Adult", "Child", "Child"]);
    expect(list.filter((p) => p.isLeadPassenger)).toHaveLength(1);
    expect(list[0]!.isLeadPassenger).toBe(true);
  });

  it("ajoute la galerie et le porte-vélos aux dimensions", () => {
    const load = loadFromAccessories(["roofbox", "bikes"]);
    expect(load).toEqual({ extraHeight: 50, extraLength: 60 });
    expect(loadFromAccessories(["roofbox"], { extraHeight: 90 }).extraHeight).toBe(90);
    const vehicle = buildVehicle(
      { typeId: 2, makeModelId: 9, make: "Peugeot", model: "308", height: 147, length: 425 },
      { extraHeight: 0, extraLength: 0 },
    );
    expect(vehicle.additionalHeight).toBeNull();
    expect(vehicle.length).toBe(425);
  });
});

describe("Direct Ferries : choix du devis", () => {
  const quote = (time: string, total: number) => ({
    isSuccess: true,
    selectedCurrency: "EUR",
    price: { totalInSelectedCurrency: total },
    legs: [{ departureDateTime: `2026-12-20T${time}:00`, ticketTariff: { title: "Standard", isCancellable: false } }],
  });

  it("prend le devis du départ affiché", () => {
    const picked = pickQuote([quote("09:00", 300), quote("19:00", 420)], "2026-12-20T19:30");
    expect(picked?.sameSailing).toBe(true);
    expect(picked?.quote.price?.totalInSelectedCurrency).toBe(420);
  });

  it("sinon le moins cher du jour, signalé comme autre horaire", () => {
    const picked = pickQuote([quote("09:00", 300), quote("12:00", 280)], "2026-12-20T19:30");
    expect(picked?.sameSailing).toBe(false);
    expect(picked?.quote.price?.totalInSelectedCurrency).toBe(280);
    const fare = summarizeQuote(picked!, "EUR", null, new Date("2026-11-18T10:00:00Z"));
    expect(fare).toMatchObject({ status: "ok", total: 280, cancellable: false, tariff: "Standard" });
  });

  it("ignore les devis vides ou en échec", () => {
    expect(pickQuote([{ isSuccess: false, price: { totalInSelectedCurrency: 100 } }], "2026-12-20T10:00")).toBeNull();
  });
});

describe("Direct Ferries : couchages", () => {
  it("calcule fauteuils et cabine pour tout le groupe, du moins cher au plus cher", () => {
    const options = summarizeAccommodations(
      [
        { isSeat: true, price: 19, availability: 40 },
        { isSeat: true, price: 25 },
        { isCabin: true, isShared: false, capacity: 2, price: 90, availability: 5 },
        { isCabin: true, isShared: false, capacity: 4, price: 140, availability: 1 },
        { isDeckSpace: true, price: 0 },
      ],
      4,
    );
    expect(options).toEqual([
      { id: null, kind: "seat", label: "4 fauteuils", extra: 76, units: 4 },
      { id: null, kind: "cabin", label: "Cabine 4 pers.", extra: 140, units: 1 },
    ]);
  });

  it("ignore une cabine sans assez de disponibilité", () => {
    const options = summarizeAccommodations(
      [{ isCabin: true, isShared: false, capacity: 2, price: 90, availability: 1 }],
      4,
    );
    expect(options).toEqual([]);
  });
});

describe("Direct Ferries : couchage obligatoire", () => {
  const base = {
    isSuccess: true,
    selectedCurrency: "EUR",
    price: { totalInSelectedCurrency: 500 },
  };
  const seats = { id: 2, kind: "seat" as const, label: "2 fauteuils", extra: 38, units: 2 };
  const cabin = { id: 3, kind: "cabin" as const, label: "Cabine 2 pers.", extra: 95, units: 1 };

  it("ajoute le couchage imposé au prix et décale les autres suppléments", () => {
    const fare = summarizeQuote(
      {
        quote: { ...base, legs: [{ isAccommodationCompulsory: true, ticketTariff: { compulsoryAccommodationId: 2 } }] },
        sameSailing: true,
      },
      "EUR",
      null,
      new Date(),
      [seats, cabin],
    );
    expect(fare).toMatchObject({ total: 538, baseTotal: 500, included: seats });
    expect(fare.status === "ok" && fare.options).toEqual([{ ...cabin, extra: 57 }]);
  });

  it("sans couchage imposé, le prix reste celui du devis", () => {
    const fare = summarizeQuote({ quote: { ...base, legs: [{}] }, sameSailing: true }, "EUR", null, new Date(), [seats]);
    expect(fare).toMatchObject({ total: 500, included: null, options: [seats] });
  });

  it("couchage imposé mais inconnu : prix de base, sans rien inventer", () => {
    const fare = summarizeQuote(
      { quote: { ...base, legs: [{ isAccommodationCompulsory: true }] }, sameSailing: true },
      "EUR",
      null,
    );
    expect(fare).toMatchObject({ total: 500, included: null, cabinCompulsory: true });
  });
});
