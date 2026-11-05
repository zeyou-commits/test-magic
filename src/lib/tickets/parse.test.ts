import { describe, expect, it } from "vitest";
import { parseTicket, type Catalog } from "./parse";

// Billets fictifs : noms, références et plaques inventés pour les tests.
const catalog: Catalog = {
  companies: [
    { id: "c-corsica", name: "Corsica Linea" },
    { id: "c-alg", name: "Algérie Ferries" },
    { id: "c-balearia", name: "Baleària" },
  ],
  vessels: [
    { id: "v-nicoli", name: "Jean Nicoli", company_id: "c-corsica" },
    { id: "v-tassili", name: "Tassili II", company_id: "c-alg" },
  ],
  ports: [
    { id: "p-mrs", name: "Marseille" },
    { id: "p-alg", name: "Alger" },
    { id: "p-ali", name: "Alicante" },
    { id: "p-ora", name: "Oran" },
  ],
};

const allerRetour = `CORSICA LINEA
Confirmation de réservation - émis le 02/03/2026
Référence : KX7Q2M9
ALLER  Marseille → Alger   Navire : Jean Nicoli
Départ le 12/07/2026 à 19h00  Arrivée le 13/07/2026 à 14h00
RETOUR Alger → Marseille
Départ le 23/08/2026 à 12:00
Passagers
M. BENALI KARIM   Adulte
MME BENALI SARAH  Adulte
2 adultes 1 enfant
Véhicule : Voiture  Immatriculation AB-123-CD
Agence : Voyages Méditerranée Lyon - Tél 04 00 00 00 00`;

describe("lecture d'un billet", () => {
  it("aller-retour complet", () => {
    const t = parseTicket(allerRetour, [], catalog);
    expect(t.companyId).toBe("c-corsica");
    expect(t.vesselId).toBe("v-nicoli");
    expect(t.legs).toEqual([
      { fromPortId: "p-mrs", toPortId: "p-alg", date: "2026-07-12", time: "19:00" },
      { fromPortId: "p-alg", toPortId: "p-mrs", date: "2026-08-23", time: "12:00" },
    ]);
    expect(t.reference).toBe("KX7Q2M9");
    expect(t.passengers).toEqual(["BENALI KARIM", "BENALI SARAH"]);
    expect(t.adults).toBe(2);
    expect(t.children).toBe(1);
    expect(t.vehicleKind).toBe("Voiture");
    expect(t.vehiclePlate).toBe("AB-123-CD");
    expect(t.agency).toBe("Voyages Méditerranée Lyon");
  });

  it("n'invente rien : billet aller simple, en espagnol, incomplet", () => {
    const t = parseTicket(
      `BALEARIA  Localizador: 8HJ4KL2
Alicante - Orán   15 jul 2026   Salida 17:30
Pasajeros: 1 adulto`,
      [],
      catalog,
    );
    expect(t.companyId).toBe("c-balearia");
    expect(t.vesselId).toBeNull();
    expect(t.legs).toEqual([
      { fromPortId: "p-ali", toPortId: "p-ora", date: "2026-07-15", time: "17:30" },
    ]);
    expect(t.reference).toBe("8HJ4KL2");
    expect(t.adults).toBe(1);
    expect(t.children).toBeNull();
    expect(t.vehicleKind).toBeNull();
    expect(t.vehiclePlate).toBeNull();
    expect(t.agency).toBeNull();
    expect(t.passengers).toEqual([]);
  });

  it("ignore la date d'émission et de naissance", () => {
    const t = parseTicket(
      `Algérie Ferries - Tassili II
Date d'émission : 01/02/2026
Oran → Marseille le 05/08/2026 départ 20h30
Passager : HADDAD YACINE né le 14/05/1990`,
      [],
      catalog,
    );
    expect(t.legs[0]).toEqual({
      fromPortId: "p-ora",
      toPortId: "p-mrs",
      date: "2026-08-05",
      time: "20:30",
    });
    expect(t.passengers).toEqual(["HADDAD YACINE"]);
  });

  it("référence lue dans le QR code si absente du texte", () => {
    const t = parseTicket(
      `Marseille Alger 12/07/2026`,
      ["ZT88K2Q", "https://exemple.test/billet"],
      catalog,
    );
    expect(t.reference).toBe("ZT88K2Q");
    expect(t.codes).toHaveLength(2);
  });

  it("une plaque sans mention de véhicule n'est pas retenue", () => {
    const t = parseTicket(`Marseille Alger 12/07/2026 Dossier AB-123-CD`, [], catalog);
    expect(t.vehiclePlate).toBeNull();
  });

  it("texte illisible : tout reste vide", () => {
    const t = parseTicket(`%%% ~~~ ### ...`, [], catalog);
    expect(t.companyId).toBeNull();
    expect(t.legs).toEqual([{ fromPortId: null, toPortId: null, date: null, time: null }]);
    expect(t.reference).toBeNull();
  });
});

describe("agence : bruit de l'OCR", () => {
  it("retire « Cl [=] » en fin de ligne", () => {
    const t = parseTicket("Agence : Voyages Méditerranée Lyon Cl [=]", [], catalog);
    expect(t.agency).toBe("Voyages Méditerranée Lyon");
  });
});
