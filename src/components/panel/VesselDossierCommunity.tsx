import { useAuth } from "@/hooks/useAuth";
import { communityQuery } from "@/lib/ferry/community";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { vesselsQuery } from "@/lib/ferry/queries";
import { TravelSignals, VesselReviews } from "./TravelCommunity";
import { FollowButton } from "./FollowButton";
import { tr } from "@/lib/i18n";

export function VesselDossierFollow({ slug }: { slug: string }) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const vessel = vessels.find((item) => item.slug === slug && item.status === "active");
  if (!vessel) return null;
  return <div className="mb-6 mt-3 max-w-sm"><FollowButton kind="vessel" targetId={vessel.id} label={vessel.name} demo={Boolean(vessel.is_demo)} /></div>;
}

/** Editorial dossiers and the map share the same vessel ID and contributions. */
export function VesselDossierCommunity({ slug }: { slug: string }) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const vessel = vessels.find((v) => v.slug === slug && v.status === "active");
  const { user } = useAuth();
  const community = useQuery({
    ...communityQuery("vessel", vessel?.id, false, user?.id),
    enabled: Boolean(vessel),
  });
  if (!vessel) return null;
  return (
    <section className="bw-dossier-community" aria-label={tr("ui.vesselDossierCommunity.laCommunauteDeCeBateau")}>
      <div className="bw-section-heading">
        <div>
          <span className="bw-eyebrow">{tr("ui.vesselDossierCommunity.leVoyageSePartage")}</span>
          <h2>{tr("ui.vesselDossierCommunity.aBordAvecLaCommunaute")}</h2>
        </div>
      </div>
      <a className="bw-map-button" href={`/?select=vessel&id=${encodeURIComponent(vessel.id)}`}>
        <MapPin size={16} aria-hidden />
        {tr("ui.vesselDossierCommunity.voirSesTraverseesSurLa")}
      </a>
      {community.data && <><TravelSignals kind="vessel" target={vessel.id} /><VesselReviews vesselId={vessel.id} /></>}
    </section>
  );
}
