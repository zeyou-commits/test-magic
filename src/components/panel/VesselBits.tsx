import { useState } from "react";
import { Ship } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Vessel } from "@/lib/ferry/types";
import { safeExternalUrl } from "./shared";
import { tr, intlLocale } from "@/lib/i18n";

const number = (value: number | null | undefined) => value?.toLocaleString(intlLocale());

export function VesselSpecs({ vessel }: { vessel: Vessel }) {
  const items = [
    { label: tr("ui.vesselBits.passagers"), value: number(vessel.passenger_capacity) },
    { label: tr("ui.vesselBits.vehicules"), value: number(vessel.car_capacity) },
    { label: tr("ui.vesselBits.cabines"), value: number(vessel.cabin_capacity) },
    { label: tr("ui.vesselBits.fauteuils"), value: number(vessel.seat_capacity) },
    { label: tr("ui.vesselBits.longueur"), value: vessel.length_meters ? `${number(vessel.length_meters)} m` : null },
    { label: tr("ui.vesselBits.largeur"), value: vessel.beam_meters ? `${number(vessel.beam_meters)} m` : null },
    { label: tr("ui.vesselBits.ponts"), value: vessel.deck_count },
    {
      label: tr("ui.vesselBits.jaugeBrute"),
      value: vessel.gross_tonnage ? `${number(vessel.gross_tonnage)} t` : null,
    },
    { label: tr("ui.vesselBits.miseEnService"), value: vessel.build_year },
    {
      label: tr("ui.vesselBits.vitesse"),
      value: vessel.speed_knots ? `${Math.round(vessel.speed_knots * 1.852)} km/h` : null,
    },
    { label: tr("ui.vesselBits.construitPar"), value: vessel.builder },
    { label: tr("ui.vesselBits.type"), value: vessel.vessel_type },
  ].filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  const source = safeExternalUrl(vessel.specs_source_url);
  return items.length ? (
    <>
      <dl className="bw-vessel-specs">
        {items.map((i) => (
          <div key={i.label}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
      </dl>
      {vessel.specs_source_name ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {tr("ui.vesselBits.source")}{" "}
          {source ? (
            <a href={source} target="_blank" rel="noopener noreferrer" className="underline">
              {vessel.specs_source_name}
            </a>
          ) : (
            vessel.specs_source_name
          )}
        </p>
      ) : null}
    </>
  ) : null;
}

export function ShipPhoto({
  url,
  name,
  zoomable = false,
}: {
  url: string | undefined;
  name: string;
  /** Un toucher agrandit la photo en plein écran (fiche du navire). */
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const canZoom = zoomable && url && !failed;
  return (
    <div className="bw-ship-photo">
      {canZoom ? (
        <>
          <button
            type="button"
            className="bw-ship-photo__zoom"
            aria-label={tr("ui.vesselBits.agrandirLaPhotoDu", { name })}
            onClick={() => setOpen(true)}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="bw-photo-viewer max-w-3xl p-2">
              <DialogTitle className="sr-only">{name}</DialogTitle>
              <img
                src={url}
                alt={name}
                referrerPolicy="no-referrer"
                className="max-h-[80vh] w-full rounded-lg object-contain"
              />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      <Ship size={32} aria-hidden />
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          width={88}
          height={80}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
