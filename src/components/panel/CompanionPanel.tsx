import { FollowButton } from "./FollowButton";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Selection } from "@/lib/ferry/types";
import { CompanyView, VesselView } from "./EntityViews";
import { PortView } from "./PortView";

export function CompanionPanel({
  selection,
  departureId,
  onSelect,
  onClose,
}: {
  selection: Selection;
  departureId: string;
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
      aria-label="Détails associés à la traversée"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <span>La traversée reste ouverte</span>
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
      <div className="bw-companion__scroll" key={`${selection.type}:${selection.id}`}>
        {selection.type === "vessel" ? (
          <VesselView
            vesselId={selection.id}
            contextDepartureId={departureId}
            onSelect={onSelect}
          />
        ) : selection.type === "company" ? (
          <CompanyView companyId={selection.id} onSelect={onSelect} />
        ) : (
          <PortView portId={selection.id} onSelect={onSelect} />
        )}
      </div>
    </aside>,
    host,
  );
}
