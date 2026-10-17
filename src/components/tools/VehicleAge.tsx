import { useState } from "react";
import { vehicleAge } from "@/lib/tools/calculations";
import { CalculatorForm, inputClass, ResultPanel } from "./Fields";
import { displayDate } from "@/lib/seo/site";
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
            Première mise en circulation
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
            Déclaration de mise à la consommation envisagée
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
          Utilisez la date administrative envisagée. L'achat et le départ du ferry ne sont pas les
          dates retenues par le décret de 2023. Ce calcul d'âge n'examine ni le régime, ni la
          motorisation, ni la conformité.
        </p>
      </CalculatorForm>
      {submitted ? (
        <ResultPanel>
          {result ? (
            <>
              <h2 className="font-display text-xl font-bold">
                {result.state === "before"
                  ? "Avant le troisième anniversaire"
                  : result.state === "limit"
                    ? "Jour limite : confirmation nécessaire"
                    : "Troisième anniversaire dépassé"}
              </h2>
              <p className="mt-3">
                Troisième anniversaire : <strong>{displayDate(result.anniversary)}</strong>.
              </p>
              <p className="mt-2">
                {result.remainingDays > 0
                  ? `La déclaration saisie se situe ${result.remainingDays} jours avant cette date.`
                  : result.remainingDays === 0
                    ? "La date saisie coïncide avec le troisième anniversaire. Faites confirmer le traitement de cette limite par les douanes."
                    : `La date saisie se situe ${Math.abs(result.remainingDays)} jours après cette date.`}
              </p>
              {result.leapConvention ? (
                <p className="mt-3 text-sm">
                  Convention du calcul : pour une mise en circulation au 29 février, l'anniversaire
                  est ramené au dernier jour de février si nécessaire. À confirmer pour un dossier
                  situé à la limite.
                </p>
              ) : null}
              <p className="mt-3 text-sm font-medium">
                Ce résultat ne constitue pas une décision d'éligibilité douanière. Recalculez avec
                une date retardée pour apprécier votre marge.
              </p>
            </>
          ) : (
            <p>
              Renseignez deux dates valides, avec une déclaration au moins égale à la première mise
              en circulation.
            </p>
          )}
        </ResultPanel>
      ) : null}
    </>
  );
}
