import { FollowButton } from "./FollowButton";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Selection } from "@/lib/ferry/types";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { ShareButtons } from "./ShareButtons";

const primaryLabel: Record<Selection["type"], string> = {
  departure: "La traversée reste ouverte",
  vessel: "Le navire reste ouvert",
  port: "Le port reste ouvert",
  route: "La ligne reste ouverte",
  company: "La compagnie reste ouverte",
};

export function CompanionPanel({
  selection,
  primary,
  onSelect,
  onClose,
}: {
  selection: Selection;
  /** La fiche du volet principal, ou rien quand ce sont les résultats qui restent ouverts. */
  primary: Selection | null;
  onSelect: (s: Selection | null) => void;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setHost(document.getElementById("carte"));
  }, []);
  useEffect(() => {
    if (host) closeRef.current?.focus({ preventScroll: true });
  }, [host, selection.id]);
  if (!host) return null;
  return createPortal(
    <aside
      className="bw-companion"
      aria-label="Fiche associée"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <span>{primary ? primaryLabel[primary.type] : "Vos résultats restent ouverts"}</span>
        <ShareButtons
          compact
          getUrl={() =>
            `${window.location.origin}/?select=${selection.type}&id=${selection.id}`
          }
        />
        {selection.type === "vessel" ? (
          <FollowButton kind="vessel" targetId={selection.id} iconOnly />
        ) : null}
        <button
          ref={closeRef}
          type="button"
          aria-label="Fermer la fiche associée"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="bw-companion__scroll batogo-panel-scroll" key={`${selection.type}:${selection.id}`}>
        {selection.type === "vessel" ? (
          <VesselView
            vesselId={selection.id}
            {...(primary?.type === "departure" ? { contextDepartureId: primary.id } : {})}
            onSelect={onSelect}
          />
        ) : selection.type === "company" ? (
          <CompanyView companyId={selection.id} onSelect={onSelect} />
        ) : selection.type === "departure" ? (
          <DepartureView departureId={selection.id} onSelect={onSelect} />
        ) : selection.type === "route" ? (
          <RouteView routeId={selection.id} onSelect={onSelect} />
        ) : (
          <PortView portId={selection.id} onSelect={onSelect} />
        )}
      </div>
    </aside>,
    host,
  );
}
