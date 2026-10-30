import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Company, Vessel } from "@/lib/ferry/types";
import { CompanyBadge } from "./CompanyBadge";
import { ShipPhoto } from "./VesselBits";
import { VesselAlertTag } from "./VesselAlert";

export function VesselMiniCard({
  vessel,
  company,
  onOpen,
  onCompanyOpen,
}: {
  vessel: Vessel;
  company?: Company | undefined;
  onOpen: () => void;
  onCompanyOpen?: (() => void) | undefined;
}) {
  const photo = useQuery(vesselPhotoQuery(vessel)).data;
  return (
    <div className="bw-vessel-mini">
      <button
        type="button"
        className="bw-vessel-mini__open"
        onClick={onOpen}
        aria-label={`Voir le navire ${vessel.name}`}
      >
        <span className="bw-vessel-mini__photo">
          <ShipPhoto key={photo?.url ?? vessel.id} url={photo?.url} name={vessel.name} />
        </span>
        <span className="bw-vessel-mini__identity">
          <strong>{vessel.name}</strong>
          <VesselAlertTag vesselId={vessel.id} />
          {!company ? <small>Fiche du navire</small> : null}
        </span>
        <ChevronRight size={17} aria-hidden />
      </button>
      {company && onCompanyOpen ? (
        <button
          type="button"
          className="bw-vessel-mini__company"
          onClick={onCompanyOpen}
          aria-label={`Voir la compagnie ${company.name}`}
        >
          <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
          <span>{company.name}</span>
        </button>
      ) : null}
    </div>
  );
}
