"""Remplace les images de BledWay par celles deposees dans images-a-remplacer/.

Lance par REMPLACER-LES-IMAGES.bat (traitement) et REVENIR-EN-ARRIERE.bat (--restaurer).
Bibliotheque requise : Pillow (gratuite et open source).
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import io
import json
import os
import shutil
import sys
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

OUTIL = Path(__file__).resolve().parent
DEPOT = OUTIL.parent
RACINE = DEPOT.parent
CABAS = RACINE / "public" / "cabas"
SAUVEGARDE = DEPOT / "_sauvegarde-originaux"
ANNULEES = DEPOT / "_annulees"
ETAT = DEPOT / "_etat.json"
ETAT_JS = DEPOT / "etat.js"
SOUS_DOSSIERS = ("avatars", "statuts", "persos", "humeurs", "pictos", "reactions")
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PREFIXE_JS = "window.EMPLACEMENTS = "

COTE_TRAVAIL = 1024


class ImageRefusee(Exception):
    """L'image ne peut pas etre traitee proprement : l'ancienne reste en place."""


def charger_emplacements() -> dict[str, dict]:
    texte = (OUTIL / "emplacements.js").read_text(encoding="utf-8").strip()
    liste = json.loads(texte.removeprefix(PREFIXE_JS).rstrip(";"))
    return {e["nom"]: e for e in liste}


def empreinte(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def empreinte_fichier(chemin: Path) -> str | None:
    return empreinte(chemin.read_bytes()) if chemin.exists() else None


# --- Analyse du fond ---------------------------------------------------------


def pixels_du_bord(rgb: bytes, l: int, h: int):
    epaisseur = 2
    for y in range(h):
        bord_y = y < epaisseur or y >= h - epaisseur
        for x in range(l) if bord_y else (*range(epaisseur), *range(l - epaisseur, l)):
            i = (y * l + x) * 3
            yield rgb[i], rgb[i + 1], rgb[i + 2]


def analyser_fond(rgb: bytes, l: int, h: int) -> dict:
    """Reconnait un fond clair uni, ou un faux damier de transparence (deux gris alternes)."""
    neutres = []
    total = 0
    for r, g, b in pixels_du_bord(rgb, l, h):
        total += 1
        if max(r, g, b) - min(r, g, b) <= 16:
            neutres.append(min(r, g, b))
    # Un personnage cadre de pres peut toucher le bord : la moitie de fond suffit.
    if len(neutres) < total * 0.5:
        raise ImageRefusee("le fond n'est ni blanc ni uni")
    histo = [0] * 52
    for v in neutres:
        histo[v // 5] += 1
    pic = max(range(52), key=histo.__getitem__)
    if pic * 5 < 170:
        raise ImageRefusee("le fond est trop sombre")

    # Second pic : un damier alterne deux gris en proportions comparables.
    second = max(
        (i for i in range(52) if abs(i - pic) >= 3 and i * 5 >= 150),
        key=histo.__getitem__,
        default=None,
    )
    if second is not None and histo[second] >= 0.2 * len(neutres):
        bas, haut = sorted((pic * 5 + 2, second * 5 + 2))
        return {"mode": "damier", "bas": bas, "haut": haut}

    proches = sorted(v for v in neutres if abs(v // 5 - pic) <= 2)
    ref = proches[len(proches) // 2]
    bruit = ref - proches[len(proches) // 50]
    return {"mode": "uni", "ref": ref, "tolerance": max(5, min(14, bruit + 3))}


def masque_fond(rgb_img: Image.Image, fond: dict) -> bytes:
    """Octet non nul = cette couleur pourrait etre du fond (sans dire si elle y est reliee)."""
    r, g, b = rgb_img.split()
    mini = ImageChops.darker(ImageChops.darker(r, g), b)
    maxi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    ecart = ImageChops.subtract(maxi, mini)
    if fond["mode"] == "uni":
        bas, haut, ecart_max = fond["ref"] - fond["tolerance"], 255, 14
    else:
        bas, haut, ecart_max = fond["bas"] - 8, min(255, fond["haut"] + 8), 12
    dans_plage = mini.point(lambda v: 255 if bas <= v <= haut else 0)
    peu_colore = ecart.point(lambda v: 255 if v <= ecart_max else 0)
    return ImageChops.multiply(dans_plage, peu_colore).tobytes()


def propager_depuis_bords(masque: bytes, l: int, h: int) -> bytearray:
    """Marque le fond relie au bord. Une zone blanche entouree par le personnage n'est pas atteinte."""
    atteint = bytearray(l * h)
    pile = []
    for x in range(l):
        pile += [x, (h - 1) * l + x]
    for y in range(h):
        pile += [y * l, y * l + l - 1]
    pile = [i for i in pile if masque[i]]
    for i in pile:
        atteint[i] = 1
    while pile:
        i = pile.pop()
        x = i % l
        if x > 0 and masque[i - 1] and not atteint[i - 1]:
            atteint[i - 1] = 1
            pile.append(i - 1)
        if x < l - 1 and masque[i + 1] and not atteint[i + 1]:
            atteint[i + 1] = 1
            pile.append(i + 1)
        if i >= l and masque[i - l] and not atteint[i - l]:
            atteint[i - l] = 1
            pile.append(i - l)
        if i < l * (h - 1) and masque[i + l] and not atteint[i + l]:
            atteint[i + l] = 1
            pile.append(i + l)
    return atteint


def composantes(actif: bytes | bytearray, l: int, h: int):
    """Liste chaque groupe de pixels actifs relies entre eux."""
    vus = bytearray(l * h)
    for depart in range(l * h):
        if not actif[depart] or vus[depart]:
            continue
        vus[depart] = 1
        pile = [depart]
        groupe = []
        while pile:
            i = pile.pop()
            groupe.append(i)
            x = i % l
            for j, valide in (
                (i - 1, x > 0),
                (i + 1, x < l - 1),
                (i - l, i >= l),
                (i + l, i < l * (h - 1)),
            ):
                if valide and actif[j] and not vus[j]:
                    vus[j] = 1
                    pile.append(j)
        yield groupe


def traiter_zones_enfermees(masque, retire, rgb, l, h, fond, cherche_anses, alertes):
    """Fond enferme : damier reconnu partout, blanc pur uniquement entre les anses, en haut du dessin.

    Les autres blancs (yeux, barbe) restent. Les avatars, cadres de pres, n'ont pas d'anses a vider.
    """
    dessin = Image.frombytes("L", (l, h), bytes(0 if r else 255 for r in retire)).getbbox()
    if not dessin:
        return
    limite_haut = dessin[1] + 0.30 * (dessin[3] - dessin[1])
    limite_bas = dessin[1] + 0.45 * (dessin[3] - dessin[1])
    restant = bytearray(1 if m and not r else 0 for m, r in zip(masque, retire))
    for groupe in composantes(restant, l, h):
        if fond["mode"] == "damier":
            if len(groupe) < 30:
                continue
            bas = sum(1 for i in groupe if abs(rgb[i * 3] - fond["bas"]) <= 8)
            haut = sum(1 for i in groupe if abs(rgb[i * 3] - fond["haut"]) <= 8)
            if bas >= 0.15 * len(groupe) and haut >= 0.15 * len(groupe):
                for i in groupe:
                    retire[i] = 1
            continue
        if len(groupe) < 0.0005 * l * h:
            continue
        pur = sum(1 for i in groupe if min(rgb[i * 3 : i * 3 + 3]) >= fond["ref"] - 2)
        if pur < 0.97 * len(groupe):
            continue
        premier, dernier = min(groupe) // l, max(groupe) // l
        if premier > limite_haut:
            continue
        if cherche_anses and dernier <= limite_bas:
            for i in groupe:
                retire[i] = 1
            alertes.append("blanc enlevé en haut du dessin (entre les anses) : vérifiez qu'il s'agissait bien du fond")
        elif len(groupe) >= 0.004 * l * h:
            alertes.append("zone blanche gardée en haut du dessin : vérifiez sur fond sombre que ce n'est pas du fond")


def adoucir_contour(rgb: bytes, retire: bytearray, l: int, h: int, fond: dict) -> tuple[bytearray, bytearray]:
    """Calcule l'alpha des deux rangees de contour et leur retire la teinte du fond."""
    couleurs = bytearray(rgb)
    alpha = bytearray(255 if not r else 0 for r in retire)
    actuel = retire
    for _ in range(2):
        suivant = bytearray(actuel)
        for i in range(l * h):
            if actuel[i]:
                continue
            x = i % l
            voisin = (
                (x > 0 and actuel[i - 1])
                or (x < l - 1 and actuel[i + 1])
                or (i >= l and actuel[i - l])
                or (i < l * (h - 1) and actuel[i + l])
            )
            if not voisin:
                continue
            suivant[i] = 1
            r, g, b = rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]
            mini = min(r, g, b)
            if fond["mode"] == "uni":
                ref = fond["ref"]
            else:
                ref = fond["haut"] if abs(mini - fond["haut"]) < abs(mini - fond["bas"]) else fond["bas"]
            a = max(0.0, min(1.0, (ref - mini) / 55))
            alpha[i] = int(a * 255)
            if 0.04 < a < 1:
                for canal, v in enumerate((r, g, b)):
                    couleurs[i * 3 + canal] = max(0, min(255, round((v - (1 - a) * ref) / a)))
        actuel = suivant
    return couleurs, alpha


def enlever_taches(alpha: bytearray, l: int, h: int) -> None:
    """Efface les poussieres et le petit filigrane en etoile que Gemini met en bas a droite."""
    groupes = list(composantes(bytes(1 if a > 16 else 0 for a in alpha), l, h))
    if not groupes:
        return
    plus_grand = max(len(g) for g in groupes)
    aire = l * h
    for groupe in groupes:
        taille = len(groupe)
        if taille == plus_grand:
            continue
        dans_le_coin = all(i % l > 0.8 * l and i // l > 0.8 * h for i in groupe)
        if taille < 0.0005 * aire or (dans_le_coin and taille < 0.015 * aire):
            for i in groupe:
                alpha[i] = 0


def fond_deja_transparent(im: Image.Image) -> bool:
    l, h = im.size
    a = im.getchannel("A").tobytes()
    bord = [a[x] for x in range(l)] + [a[(h - 1) * l + x] for x in range(l)]
    bord += [a[y * l] for y in range(h)] + [a[y * l + l - 1] for y in range(h)]
    return sum(1 for v in bord if v < 16) >= 0.5 * len(bord)


def detourer(im: Image.Image, cherche_anses: bool, alertes: list[str]) -> Image.Image:
    l, h = im.size
    if fond_deja_transparent(im):
        alpha = bytearray(im.getchannel("A").tobytes())
        enlever_taches(alpha, l, h)
        sortie = im.copy()
        sortie.putalpha(Image.frombytes("L", (l, h), bytes(alpha)))
        return sortie

    rgb_img = im.convert("RGB")
    rgb = rgb_img.tobytes()
    fond = analyser_fond(rgb, l, h)
    masque = masque_fond(rgb_img, fond)
    retire = propager_depuis_bords(masque, l, h)
    part = sum(retire) / (l * h)
    if part < 0.03:
        raise ImageRefusee("le fond n'a pas pu être enlevé (redemandez un fond blanc uni à Gemini)")
    traiter_zones_enfermees(masque, retire, rgb, l, h, fond, cherche_anses, alertes)
    couleurs, alpha = adoucir_contour(rgb, retire, l, h, fond)
    enlever_taches(alpha, l, h)
    sortie = Image.frombytes("RGB", (l, h), bytes(couleurs)).convert("RGBA")
    sortie.putalpha(Image.frombytes("L", (l, h), bytes(alpha)))
    return sortie


def fabriquer_webp(source: Path, emplacement: dict, alertes: list[str]) -> bytes:
    with Image.open(source) as ouverte:
        im = ImageOps.exif_transpose(ouverte).convert("RGBA")
    if max(im.size) > COTE_TRAVAIL:
        im.thumbnail((COTE_TRAVAIL, COTE_TRAVAIL), Image.Resampling.LANCZOS)
    detoure = detourer(im, emplacement["dossier"] != "avatars", alertes)
    cadre = detoure.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if not cadre:
        raise ImageRefusee("l'image est vide une fois le fond enlevé")
    l, h = detoure.size
    if cadre[0] == 0 or cadre[1] == 0 or cadre[2] == l or cadre[3] == h:
        alertes.append("le dessin touche le bord de l'image : il est peut-être coupé")

    cote = emplacement["sortie"]
    interieur = max(1, round(cote * (1 - 2 * emplacement["marge"])))
    sujet = detoure.crop(cadre)
    if max(sujet.size) < interieur:
        alertes.append(f"image source petite ({max(sujet.size)} px) : le rendu peut être flou")
    echelle = interieur / max(sujet.size)
    taille = (max(1, round(sujet.width * echelle)), max(1, round(sujet.height * echelle)))
    sujet = sujet.resize(taille, Image.Resampling.LANCZOS)
    toile = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
    toile.paste(sujet, ((cote - taille[0]) // 2, (cote - taille[1]) // 2))
    tampon = io.BytesIO()
    toile.save(tampon, "WEBP", quality=88, alpha_quality=95, method=6)
    return tampon.getvalue()


# --- Fichiers ----------------------------------------------------------------


def lister_depots() -> list[Path]:
    fichiers = [p for p in DEPOT.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS]
    for dossier in SOUS_DOSSIERS:
        chemin = DEPOT / dossier
        if chemin.is_dir():
            fichiers += [p for p in chemin.iterdir() if p.is_file() and p.name != ".gitkeep"]
    return fichiers


def nom_cible(emplacements: dict, tige: str) -> str | None:
    tige = tige.strip().lower()
    return tige if tige in emplacements else None


def charger_etat() -> dict:
    try:
        return json.loads(ETAT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def ecrire_etat(etat: dict) -> None:
    ETAT.write_text(json.dumps(etat, indent=1, ensure_ascii=False), encoding="utf-8")


def ecrire_apercu(emplacements: dict, rapport: dict) -> None:
    """Etat lu par apercu.html : remplacee = differente de l'image d'origine du depot."""
    images = {}
    for nom, e in emplacements.items():
        cible = CABAS / e["cible"]
        if not cible.exists():
            images[nom] = {"manque": True}
            continue
        images[nom] = {
            "remplacee": empreinte_fichier(cible) != e["empreinte"],
            "version": int(cible.stat().st_mtime),
            "poids": cible.stat().st_size,
            "sauvegarde": (SAUVEGARDE / e["cible"]).exists(),
        }
    contenu = {"date": time.strftime("%d/%m/%Y %H:%M"), "images": images, "rapport": rapport}
    ETAT_JS.write_text("window.ETAT = " + json.dumps(contenu, ensure_ascii=False) + ";\n", encoding="utf-8")


def traiter(emplacements: dict) -> dict:
    etat = charger_etat()
    rapport = {"remplacees": [], "deja": [], "inconnues": [], "refusees": [], "alertes": []}
    retenues: dict[str, Path] = {}
    for fichier in lister_depots():
        if fichier.suffix.lower() not in EXTENSIONS:
            rapport["inconnues"].append({"fichier": fichier.name, "conseil": "ce n'est pas une image PNG ou JPG"})
            continue
        nom = nom_cible(emplacements, fichier.stem)
        if nom is None:
            if fichier.stem.strip().lower() == "voiture_504":
                conseil = "la voiture 504 ne se remplace pas"
            else:
                proches = difflib.get_close_matches(fichier.stem.strip().lower(), emplacements, n=1, cutoff=0.5)
                conseil = f"vouliez-vous dire « {proches[0]} » ?" if proches else "nom absent de la liste"
            rapport["inconnues"].append({"fichier": fichier.name, "conseil": conseil})
        elif nom in retenues:
            ancien, recent = sorted((retenues[nom], fichier), key=lambda p: p.stat().st_mtime)
            retenues[nom] = recent
            rapport["alertes"].append({"nom": nom, "message": f"déposée deux fois : seule « {recent.name} » est utilisée ({ancien.name} ignorée)"})
        else:
            retenues[nom] = fichier

    for nom in sorted(retenues):
        fichier, emplacement = retenues[nom], emplacements[nom]
        cible = CABAS / emplacement["cible"]
        empreinte_source = empreinte_fichier(fichier)
        deja = etat.get(nom, {})
        if deja.get("source") == empreinte_source and deja.get("sortie") == empreinte_fichier(cible):
            rapport["deja"].append(nom)
            continue
        alertes: list[str] = []
        try:
            octets = fabriquer_webp(fichier, emplacement, alertes)
        except ImageRefusee as raison:
            rapport["refusees"].append({"fichier": fichier.name, "raison": str(raison)})
            continue
        except Exception:  # fichier abime : les autres images continuent
            rapport["refusees"].append({"fichier": fichier.name, "raison": "fichier illisible ou abîmé"})
            continue
        copie = SAUVEGARDE / emplacement["cible"]
        if cible.exists() and not copie.exists():
            copie.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cible, copie)
        if empreinte_fichier(cible) != empreinte(octets):
            provisoire = cible.with_suffix(".tmp")
            provisoire.write_bytes(octets)
            os.replace(provisoire, cible)
        etat[nom] = {"source": empreinte_source, "sortie": empreinte(octets)}
        ecrire_etat(etat)
        rapport["remplacees"].append(nom)
        rapport["alertes"] += [{"nom": nom, "message": m} for m in alertes]
    return rapport


def restaurer(emplacements: dict, noms: list[str]) -> dict:
    """Remet les anciennes images. Les depots concernes vont dans _annulees/ pour ne pas revenir."""
    etat = charger_etat()
    voulus = [nom_cible(emplacements, n) or n for n in noms] or list(emplacements)
    rapport = {"restaurees": [], "introuvables": []}
    depots = lister_depots()
    for nom in voulus:
        emplacement = emplacements.get(nom)
        copie = SAUVEGARDE / emplacement["cible"] if emplacement else None
        if not copie or not copie.exists():
            if noms:
                rapport["introuvables"].append(nom)
            continue
        cible = CABAS / emplacement["cible"]
        if empreinte_fichier(cible) != empreinte_fichier(copie):
            shutil.copy2(copie, cible)
            rapport["restaurees"].append(nom)
        etat.pop(nom, None)
        for fichier in depots:
            if fichier.exists() and nom_cible(emplacements, fichier.stem) == nom:
                ANNULEES.mkdir(exist_ok=True)
                os.replace(fichier, ANNULEES / fichier.name)
    ecrire_etat(etat)
    return rapport


def afficher(rapport: dict) -> None:
    print()
    print(f"  Images remplacées    : {len(rapport['remplacees'])}")
    print(f"  Déjà faites, ignorées : {len(rapport['deja'])}")
    for nom in rapport["remplacees"]:
        print(f"    OK  {nom}")
    if rapport["inconnues"]:
        print(f"\n  Noms inconnus, fichiers ignorés : {len(rapport['inconnues'])}")
        for i in rapport["inconnues"]:
            print(f"    ??  {i['fichier']} : {i['conseil']}")
    if rapport["refusees"]:
        print(f"\n  Images refusées, l'ancienne reste en place : {len(rapport['refusees'])}")
        for r in rapport["refusees"]:
            print(f"    !!  {r['fichier']} : {r['raison']}")
    if rapport["alertes"]:
        print("\n  À regarder dans l'aperçu :")
        for a in rapport["alertes"]:
            print(f"    ..  {a['nom']} : {a['message']}")
    print()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--restaurer", nargs="*", metavar="NOM", help="sans nom : toutes les images")
    options = analyseur.parse_args()

    emplacements = charger_emplacements()
    for dossier in SOUS_DOSSIERS:
        (DEPOT / dossier).mkdir(exist_ok=True)
    if options.restaurer is not None:
        rapport = restaurer(emplacements, options.restaurer)
        print(f"\n  Images remises comme avant : {len(rapport['restaurees'])}")
        for nom in rapport["introuvables"]:
            print(f"    ??  {nom} : aucune sauvegarde à ce nom")
        print()
        ecrire_apercu(emplacements, {"remplacees": [], "deja": [], "inconnues": [], "refusees": [], "alertes": []})
        return 0
    rapport = traiter(emplacements)
    ecrire_apercu(emplacements, rapport)
    afficher(rapport)
    return 0


if __name__ == "__main__":
    sys.exit(main())
