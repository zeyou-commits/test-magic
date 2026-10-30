import { ExternalLink, Mail, Phone } from "lucide-react";
import type { Company } from "@/lib/ferry/types";
import { safeExternalUrl } from "./shared";
import { ReportButton } from "./ReportButton";

/** Coordonnées utiles d'une compagnie, avec leur vérification et un signalement si elles ont changé. */
export function CompanyContacts({ company }: { company: Company }) {
  const links = [
    ["Réserver sur le site", safeExternalUrl(company.booking_url)],
    ["Contacter le service client", safeExternalUrl(company.contact_url)],
    ["Réclamation et droits des passagers", safeExternalUrl(company.claims_url)],
  ] as const;
  const site = safeExternalUrl(company.website_url);
  const hasAny = links.some(([, href]) => href) || company.phone || company.contact_email || site;
  return (
    <section className="rounded-xl border border-border bg-card p-3 text-sm">
      <h3 className="text-sm font-semibold">Contacter {company.name}</h3>
      {hasAny ? (
        <ul className="mt-2 grid gap-1.5">
          {company.phone ? (
            <li>
              <a
                className="inline-flex items-center gap-1.5 font-medium text-primary"
                href={`tel:${company.phone.replace(/[^+\d]/g, "")}`}
              >
                <Phone size={14} aria-hidden /> {company.phone}
              </a>
            </li>
          ) : null}
          {company.contact_email ? (
            <li>
              <a
                className="inline-flex items-center gap-1.5 font-medium text-primary"
                href={`mailto:${company.contact_email}`}
              >
                <Mail size={14} aria-hidden /> {company.contact_email}
              </a>
            </li>
          ) : null}
          {links.map(([label, href]) =>
            href ? (
              <li key={label}>
                <a
                  className="inline-flex items-center gap-1.5 font-medium text-primary"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} aria-hidden /> {label}
                </a>
              </li>
            ) : null,
          )}
          {site && !links.some(([, href]) => href) ? (
            <li>
              <a
                className="inline-flex items-center gap-1.5 font-medium text-primary"
                href={site}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden /> Site de la compagnie
              </a>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Coordonnées en cours de vérification.</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {company.contact_verified_at
          ? `Vérifié le ${new Date(company.contact_verified_at).toLocaleDateString("fr-FR")} sur le site de la compagnie.`
          : "Non vérifié par BledWay : à confirmer sur le site de la compagnie."}
      </p>
      <div className="mt-1">
        <ReportButton
          targetType="company"
          targetId={company.id}
          label="Ces informations ont changé ?"
          initialReason="outdated_info"
          variant="link"
        />
      </div>
    </section>
  );
}
