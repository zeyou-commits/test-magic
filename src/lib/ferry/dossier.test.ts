import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_KEY, defaultPlan } from "./companion";
import { carPrepItems, preTripDone, setPreTripItem } from "./dossier";
import { PAPERS_STORAGE_KEY, defaultAnswers, tasksFor } from "@/content/formalites";

describe("un seul dossier entre Préparer et Mon voyage", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    const storage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("les démarches voiture cochées dans la préparation comptent dans Mon voyage", () => {
    const [first] = carPrepItems;
    store[COMPANION_KEY] = JSON.stringify({ ...defaultPlan(), carDone: [first!.id] });
    expect(preTripDone()).toEqual([first!.id]);
  });

  it("décocher dans Mon voyage décoche aussi dans la préparation", () => {
    const [first, second] = carPrepItems;
    setPreTripItem(first!.id, true);
    setPreTripItem(second!.id, true);
    setPreTripItem(first!.id, false);
    expect(JSON.parse(store[COMPANION_KEY]!).carDone).toEqual([second!.id]);
    // Une ligne qui n'est pas une démarche voiture ne touche pas la préparation.
    setPreTripItem("checkin", true);
    expect(JSON.parse(store[COMPANION_KEY]!).carDone).toEqual([second!.id]);
  });

  it("la liste des papiers finie coche « les papiers de chacun »", () => {
    const ids = tasksFor(defaultAnswers).map((t) => t.id);
    store[PAPERS_STORAGE_KEY] = JSON.stringify({
      answers: defaultAnswers,
      done: ids,
      finished: true,
    });
    expect(preTripDone()).toContain("identity");
    store[PAPERS_STORAGE_KEY] = JSON.stringify({
      answers: defaultAnswers,
      done: [],
      finished: true,
    });
    expect(preTripDone()).not.toContain("identity");
  });
});
