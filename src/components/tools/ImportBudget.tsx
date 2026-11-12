import { useState } from "react";
import { euros, importBudget, parseAmount } from "@/lib/tools/calculations";
import { CalculatorForm, InvalidResult, NumberField, ResultPanel } from "./Fields";
import { tr } from "@/lib/i18n";
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
          <legend className="mb-4 font-semibold">{tr("ui.importBudget.lesDepensesConnuesEnEuros")}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="purchase"
              label={tr("ui.importBudget.achatDuVehicule")}
              value={values.purchase}
              onChange={(v) => update("purchase", v)}
            />
            <NumberField
              id="transport"
              label={tr("ui.importBudget.acheminementTraverseeOuFret")}
              value={values.transport}
              onChange={(v) => update("transport", v)}
            />
            <NumberField
              id="fees"
              label={tr("ui.importBudget.autresFraisEtFormalites")}
              value={values.fees}
              onChange={(v) => update("fees", v)}
            />
            <NumberField
              id="reserve"
              label={tr("ui.importBudget.reserveChoisiePourImprevus")}
              max={100}
              value={values.reserve}
              onChange={(v) => update("reserve", v)}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-4 font-semibold">{tr("ui.importBudget.laFiscaliteQueVousAvez")}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="tax"
              label={tr("ui.importBudget.montantDesDroitsEtTaxes")}
              optional
              value={values.tax}
              onChange={(v) => update("tax", v)}
            />
            <NumberField
              id="rate"
              label={tr("ui.importBudget.conversionChoisie1Dzd")}
              min={0.000001}
              optional
              value={values.rate}
              onChange={(v) => update("rate", v)}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {tr("ui.importBudget.aucunBaremeNiTauxDe")}
          </p>
        </fieldset>
      </CalculatorForm>
      {submitted ? (
        result ? (
          <ResultPanel>
            <h2 className="font-display text-xl font-bold">
              {result.total === null
                ? tr("ui.importBudget.budgetIncompletFiscaliteARenseigner")
                : tr("ui.importBudget.budgetSelonVosHypotheses")}
            </h2>
            <dl className="mt-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>{tr("ui.importBudget.achatTransportFraisSaisis")}</dt>
                <dd className="font-semibold">{euros(result.knownSubtotal)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>{tr("ui.importBudget.droitsEtTaxesConvertis")}</dt>
                <dd className="font-semibold">
                  {result.taxEur === null ? tr("ui.importBudget.nonCalcules") : euros(result.taxEur)}
                </dd>
              </div>
              {result.total !== null ? (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>{tr("ui.importBudget.reserveDe")}{values.reserve}{tr("ui.importBudget.surLeTotalAvantReserve")}</dt>
                    <dd>{euros(result.reserve)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-lg font-bold">
                    <dt>{tr("ui.importBudget.totalPrevisionnel")}</dt>
                    <dd>{euros(result.total)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <p className="mt-4 text-sm">
              {result.total === null
                ? tr("ui.importBudget.ceSousTotalExclutLes")
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
