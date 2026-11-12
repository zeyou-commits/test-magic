import { useState } from "react";
import { vehicleAge } from "@/lib/tools/calculations";
import { CalculatorForm, inputClass, ResultPanel } from "./Fields";
import { displayDate } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
export function VehicleAge() {
  const [first, setFirst] = useState("");
  const [declaration, setDeclaration] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const result = vehicleAge(first, declaration);
  return (
    <>
      <CalculatorForm
        onCalculate={() => setSubmitted(true)}
        onEdit={() => setSubmitted(false)}
        example={() => {
          setFirst("2024-03-15");
          setDeclaration("2026-11-01");
          setSubmitted(false);
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label htmlFor="first-use" className="text-sm font-medium">
            {tr("ui.vehicleAge.premiereMiseEnCirculation")}
            <input
              id="first-use"
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              required
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className={inputClass}
            />
          </label>
          <label htmlFor="declaration" className="text-sm font-medium">
            {tr("ui.vehicleAge.declarationDeMiseALa")}
            <input
              id="declaration"
              type="date"
              min={first || "1900-01-01"}
              max="2100-12-31"
              required
              value={declaration}
              onChange={(e) => setDeclaration(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {tr("ui.vehicleAge.utilisezLaDateAdministrativeEnvisagee")}
        </p>
      </CalculatorForm>
      {submitted ? (
        <ResultPanel>
          {result ? (
            <>
              <h2 className="font-display text-xl font-bold">
                {result.state === "before"
                  ? tr("ui.vehicleAge.avantLeTroisiemeAnniversaire")
                  : result.state === "limit"
                    ? tr("ui.vehicleAge.jourLimiteConfirmationNecessaire")
                    : tr("ui.vehicleAge.troisiemeAnniversaireDepasse")}
              </h2>
              <p className="mt-3">
                {tr("ui.vehicleAge.troisiemeAnniversaire")}<strong>{displayDate(result.anniversary)}</strong>.
              </p>
              <p className="mt-2">
                {result.remainingDays > 0
                  ? `La déclaration saisie se situe ${result.remainingDays} jours avant cette date.`
                  : result.remainingDays === 0
                    ? tr("ui.vehicleAge.laDateSaisieCoincideAvec")
                    : `La date saisie se situe ${Math.abs(result.remainingDays)} jours après cette date.`}
              </p>
              {result.leapConvention ? (
                <p className="mt-3 text-sm">
                  {tr("ui.vehicleAge.conventionDuCalculPourUne")}
                </p>
              ) : null}
              <p className="mt-3 text-sm font-medium">
                {tr("ui.vehicleAge.ceResultatNeConstituePas")}
              </p>
            </>
          ) : (
            <p>
              {tr("ui.vehicleAge.renseignezDeuxDatesValidesAvec")}
            </p>
          )}
        </ResultPanel>
      ) : null}
    </>
  );
}
