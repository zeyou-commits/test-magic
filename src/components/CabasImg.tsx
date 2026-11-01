import type { ImgHTMLAttributes } from "react";
import { useIllustrationUrl } from "@/lib/illustrations/store";

/** Image d'illustration : affiche la version choisie dans l'admin, sinon celle d'origine. */
export function CabasImg({
  src,
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  return <img {...props} src={useIllustrationUrl(src)} alt={alt} />;
}
