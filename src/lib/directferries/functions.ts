import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildPassengers,
  buildVehicle,
  loadFromAccessories,
  matchPort,
  normalizeName,
  pickQuote,
  pickRoute,
  REPRESENTATIVE_MODELS,
  summarizeAccommodations,
  summarizeQuote,
  type CarModel,
  type LiveFare,
} from "./quote";
import { tr } from "@/lib/i18n/translate";

const carSchema = z.object({
  typeId: z.number().int().nullable(),
  makeModelId: z.number().int().nullable(),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(120),
  height: z.number().int().min(0).max(600).nullable(),
  length: z.number().int().min(0).max(2500).nullable(),
});

const portSchema = z.object({
  name: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const fareSchema = z.object({
  from: portSchema,
  to: portSchema,
  company: z.string().trim().max(80).nullable(),
  /** « AAAA-MM-JJTHH:MM », heure locale du port de départ. */
  departureLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  vehicle: z.enum(["none", "city", "sedan", "suv", "van", "utility"]),
  accessories: z.array(z.enum(["roofbox", "trailer", "bikes"])).max(3),
  car: carSchema.nullable(),
  load: z
    .object({
      extraHeight: z.number().int().min(0).max(300),
      extraLength: z.number().int().min(0).max(800),
    })
    .nullable(),
  passengers: z.object({
    adults: z.number().int().min(0).max(9),
    seniors: z.number().int().min(0).max(9),
    children: z.number().int().min(0).max(9),
    babies: z.number().int().min(0).max(9),
    pets: z.number().int().min(0).max(9),
  }),
});
export type LiveFareRequest = z.infer<typeof fareSchema>;

/** Direct Ferries est-il branché (identifiants présents sur le serveur) ? */
export const directFerriesStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { dfConfig } = await import("./api.server");
  return { enabled: Boolean(dfConfig()) };
});

/** Recherche dans le catalogue des voitures : « peugeot 3 » → Peugeot 308, 3008… */
export const searchCarModels = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().min(2).max(60) }).parse(input))
  .handler(async ({ data }): Promise<{ enabled: boolean; models: CarModel[] }> => {
    const { dfConfig, dfVehiclesOfMake } = await import("./api.server");
    const config = dfConfig();
    if (!config) return { enabled: false, models: [] };
    const [make = "", ...rest] = data.query.split(/\s+/);
    const modelPart = normalizeName(rest.join(" "));
    try {
      const all = await dfVehiclesOfMake(config, make);
      const models = all
        .filter((car) => !modelPart || normalizeName(car.model).startsWith(modelPart) || normalizeName(car.model).includes(modelPart))
        .slice(0, 30);
      return { enabled: true, models };
    } catch (error) {
      console.error("[directferries] catalogue", error);
      return { enabled: true, models: [] };
    }
  });

async function representativeCar(
  config: NonNullable<ReturnType<typeof import("./api.server").dfConfig>>,
  kind: string,
): Promise<CarModel | null> {
  const wanted = REPRESENTATIVE_MODELS[kind];
  if (!wanted) return null;
  const { dfVehiclesOfMake } = await import("./api.server");
  const models = await dfVehiclesOfMake(config, wanted.make);
  const key = normalizeName(wanted.model);
  return models.find((car) => normalizeName(car.model).startsWith(key)) ?? null;
}

/**
 * Le prix réel d'un départ chez Direct Ferries, pour le profil du voyageur.
 * Répond « off » sans identifiants, « unavailable » (avec la raison) quand aucun devis n'est possible.
 */
export const getLiveFare = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => fareSchema.parse(input))
  .handler(async ({ data }): Promise<LiveFare> => {
    const api = await import("./api.server");
    const config = api.dfConfig();
    if (!config) return { status: "off" };
    const withVehicle = data.vehicle !== "none";
    const travellers = data.passengers.adults + data.passengers.seniors + data.passengers.children + data.passengers.babies;
    if (!travellers) return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.ajoutezAuMoinsUnVoyageur") };
    if (withVehicle && data.accessories.includes("trailer"))
      return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.avecRemorqueLePrixSe") };
    if (data.passengers.pets)
      return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.avecUnAnimalLePrix") };
    try {
      const ports = await api.dfPorts(config);
      const from = matchPort(data.from, ports);
      const to = matchPort(data.to, ports);
      if (!from || !to) return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.cetteLigneNEstPas") };
      const route = pickRoute(await api.dfRoutesFrom(config, from.code), to.code, data.company, withVehicle);
      if (!route) return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.ceDepartNEstPas") };

      let vehicleLabel: string | null = null;
      let vehicles: unknown[] = [];
      if (withVehicle) {
        const car = data.car ?? (await representativeCar(config, data.vehicle));
        if (!car) return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.choisissezLeModeleExactDe") };
        const load = loadFromAccessories(data.accessories, data.load);
        vehicles = [buildVehicle(car, load)];
        vehicleLabel = `${car.make} ${car.model}${data.car ? "" : tr("ui.libDirectferriesFunctions.gabaritType")}`;
      }
      const bands = await api.dfAgeBands(config, route.operator.id, route.routeId);
      const body = {
        quote: {
          ...(config.partnerCode ? { partnerCode: config.partnerCode } : {}),
          selectedCurrency: config.currency,
          isDifferentOutboundReturn: false,
          returnTicketTariffPrices: true,
          returnAlternativeRoutes: false,
          isOpenTicket: false,
          culture: "fr-FR",
          legs: [
            {
              isReturnLeg: false,
              routeId: route.routeId,
              departureDateTime: `${data.departureLocal}:00`,
              vehicles,
              passengers: buildPassengers(data.passengers, bands),
            },
          ],
        },
      };
      const quotes = await api.dfQuotes(config, body, JSON.stringify(body));
      const picked = pickQuote(quotes, data.departureLocal);
      if (!picked) return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.plusDePrixDisponiblePour") };
      // Couchage : seulement pour le départ affiché, et sans bloquer le prix s'il échoue.
      let options: ReturnType<typeof summarizeAccommodations> = [];
      if (picked.sameSailing && picked.quote.hasAccommodations !== false) {
        try {
          options = summarizeAccommodations(await api.dfAccommodations(config, picked.quote), travellers);
        } catch (error) {
          console.error("[directferries] couchages", error);
        }
      }
      return summarizeQuote(picked, config.currency, vehicleLabel, new Date(), options);
    } catch (error) {
      console.error("[directferries] devis", error);
      return { status: "unavailable", reason: tr("ui.libDirectferriesFunctions.lePrixEnDirectNe") };
    }
  });
