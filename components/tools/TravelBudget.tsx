import { useState } from "react";
import { euros, journeyBudget, parseAmount, parseOccupants } from "@/lib/tools/calculations";
import { CalculatorForm, InvalidResult, NumberField, ResultPanel } from "./Fields";
const emptyScenario = {
  ticket: "",
  km: "",
  consumption: "",
  fuelPrice: "",
  tolls: "",
  lodging: "",
  other: "",
};
const fieldLabels: Record<keyof typeof emptyScenario, string> = {
  ticket: "Billet total du groupe, véhicule et installation (€)",
  km: "Kilomètres routiers totaux du scénario",
  consumption: "Consommation (L/100 km)",
  fuelPrice: "Prix moyen du carburant (€/L)",
  tolls: "Péages totaux (€)",
  lodging: "Hébergement total (€)",
  other: "Autres dépenses (€)",
};
function ScenarioFields({
  id,
  title,
  values,
  update,
}: {
  id: string;
  title: string;
  values: typeof emptyScenario;
  update: (key: keyof typeof emptyScenario, value: string) => void;
}) {
  return (
    <fieldset className="rounded-xl border p-5">
      <legend className="px-2 font-display text-lg font-bold">{title}</legend>
      <div className="grid gap-5">
        {(Object.keys(fieldLabels) as (keyof typeof emptyScenario)[]).map((key) => (
          <NumberField
            key={key}
            id={`${id}-${key}`}
            label={fieldLabels[key]}
            value={values[key]}
            onChange={(v) => update(key, v)}
          />
        ))}
      </div>
    </fieldset>
  );
}
function parseScenario(v: typeof emptyScenario) {
  const ticket = parseAmount(v.ticket),
    km = parseAmount(v.km),
    consumption = parseAmount(v.consumption),
    fuelPrice = parseAmount(v.fuelPrice),
    tolls = parseAmount(v.tolls),
    lodging = parseAmount(v.lodging),
    other = parseAmount(v.other);
  return ticket === null ||
    km === null ||
    consumption === null ||
    fuelPrice === null ||
    tolls === null ||
    lodging === null ||
    other === null
    ? null
    : { ticket, km, consumption, fuelPrice, tolls, lodging, other };
}
export function TravelBudget() {
  const [a, setA] = useState(emptyScenario),
    [b, setB] = useState(emptyScenario);
  const [people, setPeople] = useState("1"),
    [submitted, setSubmitted] = useState(false);
  const inputA = parseScenario(a),
    inputB = parseScenario(b),
    count = parseOccupants(people);
  const resultA = inputA ? journeyBudget(inputA) : null,
    resultB = inputB ? journeyBudget(inputB) : null;
  return (
    <>
      <CalculatorForm
        onCalculate={() => setSubmitted(true)}
        onEdit={() => setSubmitted(false)}
        example={() => {
          setA({
            ticket: "900",
            km: "1000",
            consumption: "6.5",
            fuelPrice: "1.8",
            tolls: "90",
            lodging: "0",
            other: "50",
          });
          setB({
            ticket: "750",
            km: "1800",
            consumption: "6.5",
            fuelPrice: "1.8",
            tolls: "150",
            lodging: "100",
            other: "50",
          });
          setPeople("4");
          setSubmitted(false);
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Même groupe et même périmètre pour A et B. Si vous comparez un aller-retour, saisissez
          déjà les kilomètres, les billets et les frais des deux sens. Tous les montants couvrent le
          groupe entier. Saisissez 0 pour un poste sans dépense.
        </p>
        <div className="max-w-sm">
          <NumberField
            id="travel-people"
            label="Personnes dans le groupe"
            min={1}
            max={99}
            step="1"
            value={people}
            onChange={setPeople}
          />
        </div>
        <div className="grid items-start gap-5 md:grid-cols-2">
          <ScenarioFields
            id="a"
            title="Scénario A"
            values={a}
            update={(key, value) => setA((v) => ({ ...v, [key]: value }))}
          />
          <ScenarioFields
            id="b"
            title="Scénario B"
            values={b}
            update={(key, value) => setB((v) => ({ ...v, [key]: value }))}
          />
        </div>
      </CalculatorForm>
      {submitted ? (
        resultA && resultB && count ? (
          <ResultPanel>
            <h2 className="font-display text-xl font-bold">Comparaison avec vos montants</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-2">
                      Poste
                    </th>
                    <th scope="col" className="py-2">
                      A
                    </th>
                    <th scope="col" className="py-2">
                      B
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="py-2 font-medium">
                      Carburant calculé
                    </th>
                    <td>{euros(resultA.fuel)}</td>
                    <td>{euros(resultB.fuel)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 font-medium">
                      Budget du groupe
                    </th>
                    <td className="font-bold">{euros(resultA.total)}</td>
                    <td className="font-bold">{euros(resultB.total)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 font-medium">
                      Moyenne par personne
                    </th>
                    <td>{euros(resultA.total / count)}</td>
                    <td>{euros(resultB.total / count)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-semibold">
              {resultA.total === resultB.total
                ? "Les deux scénarios ont le même total."
                : `Le scénario ${resultA.total < resultB.total ? "A" : "B"} coûte ${euros(Math.abs(resultA.total - resultB.total))} de moins pour le groupe.`}
            </p>
            <p className="mt-3 text-sm">
              Carburant = kilomètres × consommation / 100 × prix au litre. Ce calcul ne donne ni
              disponibilités de billets, ni tarif garanti, ni itinéraire routier automatique.
            </p>
          </ResultPanel>
        ) : (
          <InvalidResult />
        )
      ) : null}
    </>
  );
}
