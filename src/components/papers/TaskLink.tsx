import { ExternalLink } from "lucide-react";
import type { Task } from "@/content/formalites";
import { useHotelLink } from "@/lib/papers/hotelLink";

/** Le service en ligne d'une démarche ; le lien hôtel suit le réglage de l'admin. */
export function TaskLink({ link }: { link: NonNullable<Task["link"]> }) {
  const hotel = useHotelLink(link.setting === "hotel_booking");
  const shown = link.setting === "hotel_booking" ? hotel : link;
  return (
    <a href={shown.href} target="_blank" rel="noreferrer" className="bw-task-link">
      {shown.label} <ExternalLink size={13} aria-hidden />
    </a>
  );
}
