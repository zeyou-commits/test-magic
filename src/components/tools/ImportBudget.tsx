import { useState } from "react";
import { euros, importBudget, parseAmount } from "@/lib/tools/calculations";
import { CalculatorForm, InvalidResult, NumberField, ResultPanel } from "./Fields";
const initial = { purchase: "", transport: "", fees: "", tax: "", rate: "", reserve: "" };
export function ImportBudget() {
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const update = (key: keyof typeof initial, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const a = parseAmount(values.purchase),
    t = parseAmount(values.transport),
    f = parseAmount(values.fees),
    p = parseAmount(values.reserve);
  const tax = parseAmount(values.tax),
    rate = parseAmount(values.rate);
  const valid =
    a !== null &&
    t !== null &&
    f !== null &&
    p !== null &&
    p <= 100 &&
    (!values.tax || tax !== null) &&
    (!values.rate || (rate !== null && rate > 0));
  const result = valid ? importBudget(a, t, f, tax, rate, p) : null;
  return (
    <>
      <CalculatorForm
        onCalculate={() => setSubmitted(true)}
        onEdit={() => setSubmitted(false)}
        example={() => {
          setValues({
            purchase: "12000",
            transport: "700",
            fees: "300",
            tax: "",
            rate: "",
            reserve: "10",
          });
          setSubmitted(false);
        }}
      >
        <fieldset>
          <legend className="mb-4 font-semibold">Les dépenses connues en euros</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="purchase"
              label="Achat du véhicule (€)"
              value={values.purchase}
              onChange={(v) => update("purchase", v)}
            />
            <NumberField
              id="transport"
              label="Acheminement + traversée ou fret (€)"
              value={values.transport}
              onChange={(v) => update("transport", v)}
            />
            <NumberField
              id="fees"
              label="Autres frais et formalités (€)"
              value={values.fees}
              onChange={(v) => update("fees", v)}
            />
            <NumberField
              id="reserve"
              label="Réserve choisie pour imprévus (%)"
              max={100}
              value={values.reserve}
              onChange={(v) => update("reserve", v)}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-4 font-semibold">La fiscalité que vous avez fait confirmer</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="tax"
              label="Montant des droits et taxes (DZD)"
              optional
              value={values.tax}
              onChange={(v) => update("tax", v)}
            />
            <NumberField
              id="rate"
              label="Conversion choisie : 1 € = … DZD"
              min={0.000001}
              optional
              value={values.rate}
              onChange={(v) => update("rate", v)}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun barème ni taux de change automatique. Sans montant fiscal et conversion, le budget
            reste incomplet. Un montant nul doit être justifié auprès du service compétent.
          </p>
        </fieldset>
      </CalculatorForm>
      {submitted ? (
        result ? (
          <ResultPanel>
            <h2 className="font-display text-xl font-bold">
              {result.total === null
                ? "Budget incomplet : fiscalité à renseigner"
                : "Budget selon vos hypothèses"}
            </h2>
            <dl className="mt-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Achat + transport + frais saisis</dt>
                <dd className="font-semibold">{euros(result.knownSubtotal)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Droits et taxes convertis</dt>
                <dd className="font-semibold">
                  {result.taxEur === null ? "Non calculés" : euros(result.taxEur)}
                </dd>
              </div>
              {result.total !== null ? (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>Réserve de {values.reserve} % sur le total avant réserve</dt>
                    <dd>{euros(result.reserve)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-lg font-bold">
                    <dt>Total prévisionnel</dt>
                    <dd>{euros(result.total)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <p className="mt-4 text-sm">
              {result.total === null
                ? "Ce sous-total exclut les taxes et la réserve finale. Il ne représente pas le prix rendu en Algérie."
                : `Conversion saisie : 1 € = ${values.rate} DZD. Les frais non saisis restent exclus. Il s'agit d'un budget personnel, pas d'une liquidation douanière.`}
            </p>
          </ResultPanel>
        ) : (
          <InvalidResult />
        )
      ) : null}
    </>
  );
}
