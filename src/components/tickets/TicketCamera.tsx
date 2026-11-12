import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { tr } from "@/lib/i18n";

type Quality = { light: "dark" | "bright" | "ok"; sharp: boolean };

/** Luminosité moyenne et netteté (variance du laplacien) d'une petite copie de l'image. */
function measure(video: HTMLVideoElement, probe: HTMLCanvasElement): Quality | null {
  if (!video.videoWidth) return null;
  const w = 160;
  const h = Math.round((w * video.videoHeight) / video.videoWidth);
  probe.width = w;
  probe.height = h;
  const context = probe.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(video, 0, 0, w, h);
  const d = context.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i += 1) {
    gray[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
    sum += gray[i]!;
  }
  const mean = sum / (w * h);
  let lap = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1)
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const v = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
      lap += v;
      lapSq += v * v;
      n += 1;
    }
  const variance = lapSq / n - (lap / n) ** 2;
  return { light: mean < 70 ? "dark" : mean > 215 ? "bright" : "ok", sharp: variance > 120 };
}

/**
 * Prise de vue guidée du billet : cadre à remplir, et indications en direct (lumière, netteté).
 * Sans caméra accessible, la personne passe par l'import d'une photo ou d'un PDF.
 */
export function TicketCamera({
  onShot,
  onCancel,
}: {
  onShot: (file: File) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const probe = useRef<HTMLCanvasElement | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    probe.current = document.createElement("canvas");
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = window.setInterval(() => {
          if (video.current && probe.current) setQuality(measure(video.current, probe.current));
        }, 400);
      })
      .catch(() =>
        setProblem(
          "Caméra indisponible : autorisez-la, ou importez une photo ou un PDF du billet.",
        ),
      );
    if (!navigator.mediaDevices)
      setProblem("Caméra indisponible sur ce navigateur : importez une photo ou un PDF.");
    return () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const shoot = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onShot(new File([blob], `billet-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  const hint = !quality
    ? "Placez le billet dans le cadre."
    : quality.light === "dark"
      ? "Plus de lumière : approchez-vous d’une fenêtre ou d’une lampe."
      : quality.light === "bright"
        ? "Trop de reflet : inclinez légèrement le billet."
        : !quality.sharp
          ? "Tenez le téléphone immobile, ou rapprochez-vous un peu."
          : "C’est net : prenez la photo.";
  const good = quality?.light === "ok" && quality.sharp;

  return (
    <div className="bw-ticket-camera">
      {problem ? (
        <p role="alert">{problem}</p>
      ) : (
        <div className="bw-ticket-camera__view">
          <video ref={video} playsInline muted aria-label={tr("ui.ticketCamera.apercuDeLaCamera")} />
          <div className="bw-ticket-camera__frame" data-good={good || undefined} aria-hidden />
          <p className="bw-ticket-camera__hint" data-good={good || undefined} role="status">
            {hint}
          </p>
        </div>
      )}
      <div className="bw-ticket-camera__actions">
        <button type="button" onClick={onCancel} aria-label={tr("ui.ticketCamera.fermerLaCamera")}>
          <X size={18} aria-hidden />
        </button>
        {problem ? null : (
          <button
            type="button"
            className="bw-ticket-camera__shoot"
            data-good={good || undefined}
            disabled={busy}
            onClick={shoot}
            aria-label={tr("ui.ticketCamera.prendreLaPhotoDuBillet")}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={22} />
            ) : (
              <Camera size={24} aria-hidden />
            )}
          </button>
        )}
        <span />
      </div>
    </div>
  );
}
