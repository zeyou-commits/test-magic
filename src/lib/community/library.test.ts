import { describe, expect, it } from "vitest";
import type { AvatarRow } from "./avatars";
import { groupLibrary, moveInList, normalizeSearch, renumber, UNSORTED } from "./library";

const row = (id: string, sort: number, kind: AvatarRow["kind"] = "other"): AvatarRow => ({
  id,
  label: id,
  kind,
  image: `/cabas/persos/${id}.webp`,
  storage_path: null,
  sort,
  active: true,
});

describe("groupLibrary", () => {
  const rows = [
    row("papa", 10, "persona"),
    row("zen", 20, "mood"),
    row("merci", 30),
    row("seul", 40),
  ];
  const categories = [
    { id: "c1", label: "Personnages", sort: 10 },
    { id: "c2", label: "Favoris", sort: 20 },
    { id: "c3", label: "Vide", sort: 30 },
  ];
  const links = [
    { category_id: "c1", item_id: "papa", sort: 10 },
    { category_id: "c2", item_id: "merci", sort: 1 },
    { category_id: "c2", item_id: "papa", sort: 2 },
    { category_id: "c2", item_id: "zen", sort: 3 },
    // Lien vers une image retirée du choix : ignoré.
    { category_id: "c1", item_id: "absente", sort: 5 },
  ];

  it("range chaque image dans toutes ses catégories, dans l'ordre choisi", () => {
    const groups = groupLibrary(rows, categories, links);
    expect(groups.map((g) => [g.id, g.rows.map((r) => r.id)])).toEqual([
      ["c1", ["papa"]],
      ["c2", ["merci", "papa", "zen"]],
      ["c3", []],
      [UNSORTED, ["seul"]],
    ]);
  });

  it("ne perd aucune image quand une catégorie est supprimée", () => {
    const groups = groupLibrary(
      rows,
      categories.filter((c) => c.id !== "c2"),
      links.filter((l) => l.category_id !== "c2"),
    );
    const all = new Set(groups.flatMap((g) => g.rows.map((r) => r.id)));
    expect([...all].sort()).toEqual(["merci", "papa", "seul", "zen"]);
    expect(groups.at(-1)).toMatchObject({ id: UNSORTED });
  });
});

describe("normalizeSearch", () => {
  it("ignore accents et majuscules", () => {
    expect(normalizeSearch("  Réactions ")).toBe("reactions");
    expect(normalizeSearch("Mâalem")).toBe("maalem");
  });
});

describe("ordre de la bibliothèque", () => {
  it("déplace un élément vers une autre place", () => {
    expect(moveInList(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInList(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveInList(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("renumérote 10, 20, 30 en ne gardant que les changements, même avec des rangs égaux", () => {
    const list = [
      { id: "a", sort: 10 },
      { id: "b", sort: 10 },
      { id: "c", sort: 30 },
    ];
    expect(renumber(list).map(({ item, sort }) => [item.id, sort])).toEqual([["b", 20]]);
  });
});
