import { useState } from "react";
import { euros, parseAmount, parseOccupants, splitRoadCosts } from "@/lib/tools/calculations";
import { CalculatorForm, InvalidResult, NumberField, ResultPanel } from "./Fields";
import { tr } from "@/lib/i18n";
const empty = { km: "", consumption: "", fuelPrice: "", tolls: "", parking: "", occupants: "" };
const labels = {
  km: "Kilomètres totaux à partager",
  consumption: "Consommation (L/100 km)",
  fuelPrice: "Carburant (€/L)",
  tolls: "Péages (€)",
  parking: "Parking (€)",
  occupants: "Occupants, conducteur compris",
};
export function CostSharing() {
  const [values, setValues] = useState(empty),
    [submitted, setSubmitted] = useState(false);
  const km = parseAmount(values.km),
    consumption = parseAmount(values.consumption),
    fuelPrice = parseAmount(values.fuelPrice),
    tolls = parseAmount(values.tolls),
    parking = parseAmount(values.parking),
    count = parseOccupants(values.occupants);
  const result =
    km !== null &&
    consumption !== null &&
    fuelPrice !== null &&
    tolls !== null &&
    parking !== null &&
    count !== null
      ? splitRoadCosts(km, consumption, fuelPrice, tolls, parking, count)
      : null;
  return (
    <>
      <CalculatorForm
        onCalculate={() => setSubmitted(true)}
        onEdit={() => setSubmitted(false)}
        example={() => {
          setValues({
            km: "600",
            consumption: "6.5",
            fuelPrice: "1.8",
            tolls: "55",
            parking: "0",
            occupants: "4",
          });
          setSubmitted(false);
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {(Object.keys(labels) as (keyof typeof empty)[]).map((key) => (
            <NumberField
              key={key}
              id={`share-${key}`}
              label={labels[key]}
              value={values[key]}
              min={key === "occupants" ? 1 : 0}
              max={key === "occupants" ? 99 : 1_000_000_000}
              step={key === "occupants" ? "1" : "any"}
              onChange={(v) => setValues((s) => ({ ...s, [key]: v }))}
            />
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {tr("ui.costSharing.leCalculRepartitLesPostes")}
        </p>
      </CalculatorForm>
      {submitted ? (
        result ? (
          <ResultPanel>
            <h2 className="font-display text-xl font-bold">
              {euros(result.perPerson)}{tr("ui.costSharing.parOccupant")}
            </h2>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between gap-3">
                <dt>{tr("ui.costSharing.carburantCalcule")}</dt>
                <dd>{euros(result.fuel)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{tr("ui.costSharing.peagesParkingSaisis")}</dt>
                <dd>{euros((tolls ?? 0) + (parking ?? 0))}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>{tr("ui.costSharing.totalAPartager")}</dt>
                <dd>{euros(result.total)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm">
              {tr("ui.costSharing.partEgalePour")}{values.occupants}{tr("ui.costSharing.occupantsConducteurInclusLesArrondis")}
            </p>
          </ResultPanel>
        ) : (
          <InvalidResult />
        )
      ) : null}
    </>
  );
}
