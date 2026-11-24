import { useQuery } from "@tanstack/react-query";
import { tr } from "@/lib/i18n";
import { photoUrl, photosQuery } from "@/lib/photos/photos";

/** Les photos validées par l'équipe d'une halte proposée par un voyageur (id « c-… »). */
export function StopPhotos({ id }: { id: string }) {
  const uuid = id.startsWith("c-") ? id.slice(2) : null;
  const q = useQuery(photosQuery("route_stop", uuid ? [uuid] : []));
  const list = uuid ? (q.data?.get(uuid) ?? []) : [];
  if (!list.length) return null;
  return (
    <div className="rdb-stop-photos" aria-label={tr("ui.pageRoutesDuBled.photosHalte")}>
      {list.map((p) => (
        <a key={p.id} href={photoUrl(p.path)} target="_blank" rel="noreferrer">
          <img src={photoUrl(p.path)} alt="" loading="lazy" width={p.width} height={p.height} />
        </a>
      ))}
    </div>
  );
}
