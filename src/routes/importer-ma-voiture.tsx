import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Car,
  Check,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  ShieldCheck,
  Ship,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, textLink } from "@/components/editorial/Editorial";
import { VehicleAge } from "@/components/tools/VehicleAge";
import { ImportBudget } from "@/components/tools/ImportBudget";
import { formaliteSources, papersProgress } from "@/content/formalites";
import { sources } from "@/content/sources";
import {
  IMPORT_PATH,
  IMPORT_PORTS,
  IMPORT_STEPS,
  loadImport,
  saveImport,
  defaultImportState,
  type ImportPort,
  type ImportState,
  type ImportStepId,
  type ImportWho,
} from "@/lib/ferry/importJourney";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/importer-ma-voiture")({
  head: () =>
    seoHead(
      tr("ui.pageImporterMaVoiture.seoTitle"),
      tr("ui.pageImporterMaVoiture.seoDescription"),
      IMPORT_PATH,
    ),
  component: ImportPage,
});

type StepMeta = { icon: LucideIcon; phase: "before" | "departure" | "algeria" };

const META: Record<ImportStepId, StepMeta> = {
  eligibilite: { icon: ShieldCheck, phase: "before" },
  achat: { icon: Wallet, phase: "before" },
  export: { icon: FileText, phase: "departure" },
  papiers: { icon: Users, phase: "departure" },
  traversee: { icon: Ship, phase: "departure" },
  arrivee: { icon: Landmark, phase: "algeria" },
  immatriculation: { icon: BadgeCheck, phase: "algeria" },
};

const PHASES = ["before", "departure", "algeria"] as const;

const t = (key: string, vars?: Record<string, string | number>) =>
  tr(`ui.pageImporterMaVoiture.${key}` as never, vars as never);

/** Un lien de source officielle, avec sa date de lecture quand on l'a. */
function SourceLinks({ items }: { items: { name: string; url: string; updated?: string }[] }) {
  return (
    <div className="mt-5 border-t pt-3 text-xs text-muted-foreground">
      <p className="font-semibold">{t("sources")}</p>
      <ul className="mt-1 grid gap-1">
        {items.map((item) => (
          <li key={item.url}>
            <a href={item.url} target="_blank" rel="noreferrer" className={`${textLink} inline-flex items-center gap-1`}>
              {item.name}
              {item.updated ? `, ${item.updated}` : ""}
              <ExternalLink size={11} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({ tone = "info", title, children }: { tone?: "info" | "warn"; title?: string; children: ReactNode }) {
  return (
    <div
      className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
        tone === "warn" ? "border-amber-300/60 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "border-primary/20 bg-primary/5"
      }`}
    >
      <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-1" : ""}>{children}</div>
      </div>
    </div>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 grid gap-2 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Numbered({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-3 grid gap-2 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border bg-card p-4 md:p-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
              on ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-background hover:border-primary/40"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckLine({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm ${checked ? "bg-secondary/40" : "bg-background"}`}
    >
      <span
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
        }`}
      >
        {checked ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
      </span>
      <span className={checked ? "font-semibold" : "font-semibold"}>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ Les étapes */

function Eligibilite() {
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("eligIntro")}</p>
      <Bullets items={[t("eligAge"), t("eligMotor"), t("eligFreq"), t("eligResidence")]} />
      <Box title={t("eligCalcTitle")}>
        <div className="mt-3">
          <VehicleAge />
        </div>
      </Box>
      <Notice tone="warn" title={t("eligAskTitle")}>
        {t("eligAskText")}
      </Notice>
      <p className="mt-3 text-sm">
        <a href="/guide/importer-voiture-moins-3-ans-algerie" className={textLink}>
          {t("eligGuide")}
        </a>
      </p>
      <SourceLinks items={[sources["decree"]!, sources["customs"]!]} />
    </>
  );
}

function Achat() {
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("achatIntro")}</p>
      <Box title={t("achatAskTitle")}>
        <Bullets items={[t("achatAsk1"), t("achatAsk2"), t("achatAsk3"), t("achatAsk4"), t("achatAsk5")]} />
      </Box>
      <Box title={t("achatBudgetTitle")}>
        <p className="mt-1 text-sm text-muted-foreground">{t("achatBudgetHint")}</p>
        <div className="mt-3">
          <ImportBudget />
        </div>
      </Box>
      <p className="mt-3 text-sm">
        <a href="/guide/budget-importation-voiture-algerie" className={textLink}>
          {t("achatGuide")}
        </a>
      </p>
      <SourceLinks items={[sources["decree"]!, sources["customs"]!]} />
    </>
  );
}

function Export({ state, patch }: { state: ImportState; patch: (p: Partial<ImportState>) => void }) {
  const who: Record<ImportWho, string> = {
    seller: t("exportWhoSellerText"),
    me: t("exportWhoMeText"),
    agent: t("exportWhoAgentText"),
  };
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("exportIntro")}</p>
      <Box title={t("exportWhoTitle")}>
        <Choice<ImportWho>
          label={t("exportWhoTitle")}
          value={state.who}
          onChange={(v) => patch({ who: v })}
          options={[
            { value: "seller", label: t("exportWhoSeller") },
            { value: "me", label: t("exportWhoMe") },
            { value: "agent", label: t("exportWhoAgent") },
          ]}
        />
        {state.who ? <p className="mt-3 text-sm leading-relaxed">{who[state.who]}</p> : null}
      </Box>
      <Box title={t("exportHowTitle")}>
        <Numbered items={[t("exportHow1"), t("exportHow2"), t("exportHow3"), t("exportHow4"), t("exportHow5")]} />
      </Box>
      <Box title={t("exportMrnTitle")}>
        <label className="mt-3 block text-sm font-medium" htmlFor="import-mrn">
          {t("exportMrnLabel")}
        </label>
        <input
          id="import-mrn"
          value={state.mrn}
          onChange={(e) => patch({ mrn: e.target.value.toUpperCase().slice(0, 24) })}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 h-11 w-full rounded-xl border bg-background px-3 font-mono tracking-wider"
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("exportMrnHint")}</p>
      </Box>
      <Notice>{t("exportOtherCountry")}</Notice>
      <SourceLinks
        items={[
          formaliteSources["douane-export-vehicule"],
          formaliteSources["douane-mrn"],
          formaliteSources["douane-export-formalites"],
        ]}
      />
    </>
  );
}

function Papiers() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => setProgress(papersProgress()), []);
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("papiersIntro")}</p>
      <div className="mt-4 rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">
          {progress ? t("papiersProgress", { done: progress.done, total: progress.total }) : t("papiersNotStarted")}
        </p>
        <a href="/papiers-voyage-algerie" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
          {progress ? t("papiersOpen") : t("papiersStart")}
          <ArrowRight size={16} aria-hidden />
        </a>
      </div>
    </>
  );
}

function Traversee({ state, patch }: { state: ImportState; patch: (p: Partial<ImportState>) => void }) {
  const portText: Record<ImportPort, string> = {
    valence: t("travValence"),
    barcelone: t("travBarcelone"),
    almeria: t("travAlmeria"),
    other: t("travOther"),
  };
  const portLabel: Record<ImportPort, string> = {
    valence: "Valence",
    barcelone: "Barcelone",
    almeria: "Almería",
    other: t("travOtherLabel"),
  };
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("travIntro")}</p>
      <Box title={t("travPortTitle")}>
        <Choice<ImportPort>
          label={t("travPortTitle")}
          value={state.port}
          onChange={(v) => patch({ port: v })}
          options={IMPORT_PORTS.map((p) => ({ value: p, label: portLabel[p] }))}
        />
        {state.port ? <p className="mt-3 text-sm leading-relaxed">{portText[state.port]}</p> : null}
      </Box>
      <Box title={t("travDaeTitle")}>
        <Bullets items={[t("travDae1"), t("travDae2")]} />
      </Box>
      <Notice tone="warn" title={t("travSummerTitle")}>
        {t("travSummerText")}
      </Notice>
      <Notice title={t("travDuaTitle")}>{tr("ui.pagePreparerMonVoyage.auDepartDeValenceOu")}</Notice>
      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/30">
        <p className="font-semibold">{t("travCommonTitle")}</p>
        <p className="mt-1">{t("travCommonText")}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <a href="/" className={textLink}>
            {t("travBook")}
          </a>
          <a href="/preparer-mon-voyage" className={textLink}>
            {t("travPrepare")}
          </a>
        </p>
      </div>
      <SourceLinks items={[formaliteSources["balearia-export"], formaliteSources["balearia-dua"]]} />
    </>
  );
}

const DOSSIER = ["identity", "registration", "purchase", "condition", "conformity"] as const;

function Arrivee({ state, patch }: { state: ImportState; patch: (p: Partial<ImportState>) => void }) {
  const toggle = (id: string) =>
    patch({ dossier: state.dossier.includes(id) ? state.dossier.filter((x) => x !== id) : [...state.dossier, id] });
  const count = DOSSIER.filter((id) => state.dossier.includes(id)).length;
  return (
    <>
      <p className="mt-3 leading-relaxed">{t("arrIntro")}</p>
      <Box title={t("arrStepsTitle")}>
        <Numbered items={[t("arrStep1"), t("arrStep2"), t("arrStep3")]} />
      </Box>
      <Box title={t("arrDossierTitle")}>
        <p className="mt-1 text-sm text-muted-foreground">{t("arrDossierCount", { count, total: DOSSIER.length })}</p>
        <div className="mt-3 grid gap-2">
          {DOSSIER.map((id) => (
            <CheckLine key={id} checked={state.dossier.includes(id)} onToggle={() => toggle(id)}>
              {t(`arrDoc_${id}`)}
            </CheckLine>
          ))}
        </div>
      </Box>
      <Notice tone="warn" title={t("arrAskTitle")}>
        {t("arrAskText")}
      </Notice>
      <p className="mt-3 text-sm">
        <a href="/guide/documents-importation-voiture-algerie" className={textLink}>
          {t("arrGuide")}
        </a>
      </p>
      <SourceLinks items={[sources["decree"]!, sources["customs"]!]} />
    </>
  );
}

function Immatriculation() {
  return (
    <>
      <Notice tone="warn" title={t("immatNoSourceTitle")}>
        {t("immatNoSourceText")}
      </Notice>
      <SourceLinks items={[sources["customs"]!]} />
    </>
  );
}

/* ------------------------------------------------------------------ La page */

function ImportPage() {
  const [state, setState] = useState<ImportState>(defaultImportState);
  const [open, setOpen] = useState<ImportStepId | null>(null);
  const [papersDone, setPapersDone] = useState(false);

  useEffect(() => {
    setState(loadImport());
    const p = papersProgress();
    setPapersDone(!!p && p.total > 0 && p.done === p.total);
    const asked = new URLSearchParams(window.location.search).get("etape");
    if (asked && (IMPORT_STEPS as readonly string[]).includes(asked)) setOpen(asked as ImportStepId);
  }, []);

  const patch = (p: Partial<ImportState>) =>
    setState((prev) => {
      const next = { ...prev, ...p };
      saveImport(next);
      return next;
    });

  const isDone = (id: ImportStepId) => state.done.includes(id) || (id === "papiers" && papersDone);
  const doneCount = IMPORT_STEPS.filter(isDone).length;

  const go = (id: ImportStepId | null) => {
    setOpen(id);
    const url = id ? `${IMPORT_PATH}?etape=${id}` : IMPORT_PATH;
    window.history.replaceState(window.history.state, "", url);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };

  const toggleDone = (id: ImportStepId) =>
    patch({ done: state.done.includes(id) ? state.done.filter((x) => x !== id) : [...state.done, id] });

  const index = open ? IMPORT_STEPS.indexOf(open) : -1;
  const nextStep = index >= 0 ? IMPORT_STEPS[index + 1] : undefined;

  return (
    <SiteLayout>
      <div className="hidden md:block">
        <Breadcrumbs items={[{ name: t("title"), path: IMPORT_PATH }]} />
      </div>
      <div className="mx-auto max-w-3xl pb-10 pt-3 md:py-10">
        {open === null ? (
          <>
            <header className="rounded-3xl bg-gradient-to-br from-[#0b4a32] to-[#0e7a43] p-5 text-white md:p-7">
              <a href="/preparer-mon-voyage" className="inline-flex items-center gap-1 text-sm font-semibold text-white/80 hover:text-white">
                <ArrowLeft size={14} aria-hidden />
                {t("backToPrepare")}
              </a>
              <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-bold leading-tight md:text-4xl">
                <Car size={28} className="shrink-0 text-[#f6c445]" aria-hidden />
                {t("title")}
              </h1>
              <p className="mt-2 text-white/85">{t("subtitle")}</p>
              <p className="mt-4 text-sm font-semibold" aria-live="polite">
                {t("progress", { done: doneCount, total: IMPORT_STEPS.length })}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-[#f6c445] transition-[width]"
                  style={{ width: `${Math.max(4, (doneCount / IMPORT_STEPS.length) * 100)}%` }}
                />
              </div>
            </header>

            {PHASES.map((phase) => (
              <section key={phase} className="mt-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t(`phase_${phase}`)}</h2>
                <ul className="mt-2 grid gap-2">
                  {IMPORT_STEPS.filter((id) => META[id].phase === phase).map((id) => {
                    const { icon: Icon } = META[id];
                    const done = isDone(id);
                    const n = IMPORT_STEPS.indexOf(id) + 1;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => go(id)}
                          className="flex w-full items-center gap-3 rounded-2xl border bg-background p-3 text-left transition-colors hover:border-primary/40"
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                              done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                            }`}
                          >
                            {done ? <Check size={16} strokeWidth={3} aria-hidden /> : n}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-semibold">
                              <Icon size={16} className="shrink-0 text-primary" aria-hidden />
                              {t(`step_${id}`)}
                            </span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">{t(`stepHint_${id}`)}</span>
                          </span>
                          <ArrowRight size={16} className="shrink-0 text-primary" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="mt-5 text-sm text-muted-foreground">{t("declarative")}</p>
          </>
        ) : (
          <article>
            <button type="button" onClick={() => go(null)} className={`${textLink} inline-flex items-center gap-1 text-sm`}>
              <ArrowLeft size={14} aria-hidden />
              {t("backToJourney")}
            </button>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-primary">
              {t("stepOf", { n: index + 1, total: IMPORT_STEPS.length })}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight md:text-3xl">{t(`stepTitle_${open}`)}</h1>
            {open === "eligibilite" ? <Eligibilite /> : null}
            {open === "achat" ? <Achat /> : null}
            {open === "export" ? <Export state={state} patch={patch} /> : null}
            {open === "papiers" ? <Papiers /> : null}
            {open === "traversee" ? <Traversee state={state} patch={patch} /> : null}
            {open === "arrivee" ? <Arrivee state={state} patch={patch} /> : null}
            {open === "immatriculation" ? <Immatriculation /> : null}

            <div className="mt-6">
              <CheckLine checked={isDone(open)} onToggle={() => toggleDone(open)}>
                {t(`doneLabel_${open}`)}
              </CheckLine>
            </div>
            <nav className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => go(index > 0 ? IMPORT_STEPS[index - 1]! : null)}
                className={`${textLink} inline-flex min-h-11 items-center gap-1 text-sm`}
              >
                <ArrowLeft size={14} aria-hidden />
                {t("back")}
              </button>
              <button
                type="button"
                onClick={() => go(nextStep ?? null)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {nextStep ? t("continueTo", { step: t(`step_${nextStep}`) }) : t("backToJourney")}
                <ArrowRight size={16} aria-hidden />
              </button>
            </nav>
          </article>
        )}
      </div>
    </SiteLayout>
  );
}
