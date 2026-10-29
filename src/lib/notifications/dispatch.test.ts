import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  sequence: 0,
  send: vi.fn().mockResolvedValue({}),
  vapid: vi.fn(),
}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: mock.vapid, sendNotification: mock.send },
}));
vi.mock("@/integrations/supabase/client.server", () => {
  function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let action = "select",
      values: Record<string, unknown>[] = [],
      fromIndex = 0,
      toIndex = Infinity,
      count = false;
    let single = false,
      sortKey = "",
      conflict: string[] = [];
    const builder = {
      select: (_columns?: string, options?: { count?: string }) => {
        count = Boolean(options?.count);
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return builder;
      },
      neq: (key: string, value: unknown) => {
        filters.push((row) => row[key] !== value);
        return builder;
      },
      in: (key: string, list: unknown[]) => {
        filters.push((row) => list.includes(row[key]));
        return builder;
      },
      is: (key: string, value: unknown) => {
        filters.push((row) => (row[key] ?? null) === value);
        return builder;
      },
      gte: (key: string, value: string | number) => {
        filters.push((row) => (row[key] as typeof value) >= value);
        return builder;
      },
      gt: (key: string, value: string | number) => {
        filters.push((row) => (row[key] as typeof value) > value);
        return builder;
      },
      lte: (key: string, value: string | number) => {
        filters.push((row) => (row[key] as typeof value) <= value);
        return builder;
      },
      lt: (key: string, value: string | number) => {
        filters.push((row) => (row[key] as typeof value) < value);
        return builder;
      },
      or: () => {
        filters.push(
          (row) => !row["leased_until"] || String(row["leased_until"]) < new Date().toISOString(),
        );
        return builder;
      },
      order: (key: string) => {
        sortKey = key;
        return builder;
      },
      range: (start: number, end: number) => {
        fromIndex = start;
        toIndex = end + 1;
        return builder;
      },
      limit: (limit: number) => {
        toIndex = limit;
        return builder;
      },
      upsert: (
        value: Record<string, unknown> | Record<string, unknown>[],
        options: { onConflict: string },
      ) => {
        action = "upsert";
        values = Array.isArray(value) ? value : [value];
        conflict = options.onConflict.split(",");
        return builder;
      },
      update: (value: Record<string, unknown>) => {
        action = "update";
        values = [value];
        return builder;
      },
      delete: () => {
        action = "delete";
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      single: () => {
        single = true;
        return builder;
      },
      then: (resolve: (value: unknown) => unknown) => {
        const tableRows = mock.tables[table] ?? (mock.tables[table] = []);
        let rows = tableRows.filter((row) => filters.every((filter) => filter(row)));
        if (action === "upsert") {
          rows = [];
          for (const value of values)
            if (!tableRows.some((row) => conflict.every((key) => row[key] === value[key]))) {
              const row = { id: `notice-${++mock.sequence}`, attempts: 0, sent_at: null, ...value };
              tableRows.push(row);
              rows.push(row);
            }
        } else if (action === "update") rows.forEach((row) => Object.assign(row, values[0]));
        else if (action === "delete")
          mock.tables[table] = tableRows.filter((row) => !rows.includes(row));
        if (sortKey) rows.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
        return Promise.resolve({
          data: single ? (rows[0] ?? null) : rows.slice(fromIndex, toIndex),
          count: count ? rows.length : null,
          error: null,
        }).then(resolve);
      },
    };
    return builder;
  }
  return { supabaseAdmin: { from, rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) } };
});
import { dispatchPush } from "./dispatch.server";

beforeEach(() => {
  vi.clearAllMocks();
  mock.sequence = 0;
  vi.stubEnv("VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("VAPID_SUBJECT", "https://example.test");
  mock.tables = {
    routes: [{ id: "route", departure_port_id: "fr", arrival_port_id: "dz", status: "active" }],
    ports: [
      { id: "fr", name: "Sète", country_code: "FR", status: "active" },
      { id: "dz", name: "Béjaïa", country_code: "DZ", status: "active" },
    ],
    vessels: [],
    departures: [
      {
        id: "dep",
        route_id: "route",
        departure_at: "2030-07-15T12:00:00Z",
        status: "scheduled",
        is_demo: false,
      },
    ],
    bw_notification_campaigns: [
      { id: "campaign", route_id: "route", period_month: "2030-07-01", status: "approved" },
    ],
    bw_itinerary_watches: [
      {
        id: "watch",
        user_id: "user",
        route_id: "route",
        period_month: "2030-07-01",
        active: true,
        origin_label: "Paris",
        destination_label: "Chlef",
      },
    ],
    bw_push_subscriptions: [
      {
        id: "device",
        user_id: "user",
        endpoint: "https://push.example.test",
        p256dh: "test",
        auth_key: "test",
      },
    ],
    bw_notification_preferences: [],
    bw_notifications: [],
    bw_push_deliveries: [],
  };
});
describe("Diffusion des ouvertures de lignes", () => {
  it("ne diffuse jamais une campagne en attente de validation", async () => {
    mock.tables["bw_notification_campaigns"]![0]!["status"] = "pending";
    const result = await dispatchPush({ onlyOpenings: true });
    expect(result.created).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("diffuse une campagne approuvée une seule fois avec le parcours suivi", async () => {
    const result = await dispatchPush({ onlyOpenings: true, openingCampaignId: "campaign" });
    expect(result).toMatchObject({ created: 1, pushed: 1, publishedCampaigns: 1, pending: 0 });
    expect(mock.tables["bw_notifications"]![0]).toMatchObject({
      user_id: "user",
      event_key: "opening:watch",
      body: expect.stringContaining("Paris → Chlef"),
    });
    await dispatchPush({ onlyOpenings: true, openingCampaignId: "campaign" });
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it("respecte le désabonnement aux ouvertures", async () => {
    mock.tables["bw_notification_preferences"] = [
      { user_id: "user", openings: false, push_enabled: true },
    ];
    const result = await dispatchPush({ onlyOpenings: true });
    expect(result.created).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("conserve la notification dans le compte lorsque le push est désactivé", async () => {
    mock.tables["bw_notification_preferences"] = [
      { user_id: "user", openings: true, push_enabled: false },
    ];
    const result = await dispatchPush({ onlyOpenings: true });
    expect(result.created).toBe(1);
    expect(result.pushed).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("écarte une campagne si son départ a été annulé avant l’envoi", async () => {
    mock.tables["departures"]![0]!["status"] = "cancelled";
    const result = await dispatchPush({ onlyOpenings: true });
    expect(result.created).toBe(0);
    expect(mock.tables["bw_notification_campaigns"]![0]!["status"]).toBe("dismissed");
  });
  it("garde les push en attente si les clés VAPID sont absentes", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const result = await dispatchPush({ onlyOpenings: true });
    expect(result).toMatchObject({ created: 1, pushed: 0, pending: 1, pushConfigured: false });
  });
  it("reprend un push échoué sans recréer la notification du voyageur", async () => {
    mock.send.mockRejectedValueOnce({ statusCode: 503 });
    const first = await dispatchPush({ onlyOpenings: true });
    expect(first).toMatchObject({ created: 1, pushed: 0, pending: 1 });
    const retry = await dispatchPush();
    expect(retry).toMatchObject({ created: 0, pushed: 1, pending: 0 });
    expect(mock.tables["bw_notifications"]).toHaveLength(1);
  });
  it("prévient le voyageur quand son bateau est remplacé", async () => {
    mock.tables["bw_notification_campaigns"] = [];
    mock.tables["bw_follows"] = [
      {
        id: "follow",
        user_id: "user",
        target_kind: "vessel",
        target_id: "old-vessel",
        active: true,
        created_at: new Date(Date.now() - 60000).toISOString(),
      },
    ];
    mock.tables["bw_voyage_events"] = [
      {
        id: "change",
        departure_id: "dep",
        vessel_id: "new-vessel",
        previous_vessel_id: "old-vessel",
        title: "Votre voyage est mis à jour",
        body: "Le navire affecté a changé.",
        created_at: new Date().toISOString(),
      },
    ];
    const result = await dispatchPush();
    expect(result).toMatchObject({ created: 1, pushed: 1 });
    expect(mock.tables["bw_notifications"]![0]).toMatchObject({
      event_key: "voyage-update:follow:change",
      follow_id: "follow",
    });
  });
  it("réserve les préparatifs au voyageur et applique quatre heures par défaut", async () => {
    mock.tables["bw_notification_campaigns"] = [];
    mock.tables["departures"]![0]!["departure_at"] = new Date(Date.now() + 23 * 3_600_000).toISOString();
    mock.tables["bw_follows"] = [
      { id: "mine", user_id: "user", target_kind: "departure", target_id: "dep", traveller: true, follow_purpose: "voyageur", active: true, created_at: new Date().toISOString() },
      { id: "close", user_id: "friend", target_kind: "departure", target_id: "dep", traveller: false, follow_purpose: "proche", active: true, created_at: new Date().toISOString() },
    ];
    await dispatchPush();
    const mine = mock.tables["bw_notifications"]!.find((item) => item["user_id"] === "user");
    const close = mock.tables["bw_notifications"]!.find((item) => item["user_id"] === "friend");
    expect(mine?.["body"]).toContain("préparatifs");
    expect(close?.["body"]).not.toContain("préparatifs");
    expect(mine?.["body"]).toContain("4 h avant");
    expect(close?.["body"]).not.toContain("4 h");
  });
});

describe("Suivi déclaré après coup (rattrapage)", () => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  beforeEach(() => {
    mock.tables["bw_notification_campaigns"] = [];
  });
  it("envoie la dernière mise à jour de la traversée, avec sa date, une seule fois", async () => {
    mock.tables["bw_follows"] = [
      {
        id: "trip",
        user_id: "user",
        target_kind: "departure",
        target_id: "dep",
        traveller: true,
        active: true,
        created_at: ago(5),
      },
    ];
    mock.tables["bw_voyage_events"] = [
      {
        id: "old",
        departure_id: "dep",
        title: "Horaire 1",
        body: "Premier changement.",
        created_at: ago(300),
      },
      {
        id: "new",
        departure_id: "dep",
        title: "Horaire 2",
        body: "Dernier changement.",
        created_at: ago(60),
      },
    ];
    const result = await dispatchPush();
    expect(result.created).toBe(1);
    expect(mock.tables["bw_notifications"]![0]).toMatchObject({
      event_key: "voyage-update:trip:new",
      body: expect.stringMatching(/^Mise à jour du .* · Dernier changement\.$/),
    });
    await dispatchPush();
    expect(mock.tables["bw_notifications"]).toHaveLength(1);
  });
  it("n'envoie rien si la traversée est déjà partie", async () => {
    mock.tables["departures"]![0]!["departure_at"] = ago(600);
    mock.tables["bw_follows"] = [
      {
        id: "trip",
        user_id: "user",
        target_kind: "departure",
        target_id: "dep",
        active: true,
        created_at: ago(5),
      },
    ];
    mock.tables["bw_voyage_events"] = [
      {
        id: "new",
        departure_id: "dep",
        title: "Horaire",
        body: "Changement.",
        created_at: ago(60),
      },
    ];
    expect((await dispatchPush()).created).toBe(0);
  });
  it("envoie un signalement encore actif publié avant le suivi du bateau", async () => {
    mock.tables["bw_follows"] = [
      {
        id: "boat",
        user_id: "user",
        target_kind: "vessel",
        target_id: "ship",
        active: true,
        created_at: ago(5),
      },
    ];
    mock.tables["bw_travel_alerts"] = [
      {
        id: "delay",
        target_kind: "vessel",
        target_id: "ship",
        category: "delay",
        delay_minutes: 90,
        detail: null,
        resolved: false,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        created_at: ago(120),
      },
      {
        id: "gone",
        target_kind: "vessel",
        target_id: "ship",
        category: "boarding",
        detail: null,
        resolved: true,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        created_at: ago(100),
      },
    ];
    const result = await dispatchPush();
    expect(result.created).toBe(1);
    expect(mock.tables["bw_notifications"]![0]).toMatchObject({
      event_key: "signal:boat:delay",
      body: expect.stringContaining("toujours d’actualité"),
    });
  });
  it("annonce une ouverture déjà publiée à une alerte créée ensuite", async () => {
    mock.tables["bw_notification_campaigns"] = [
      { id: "c", route_id: "route", period_month: "2030-07-01", status: "sent", sent_at: ago(600) },
    ];
    mock.tables["bw_itinerary_watches"]![0]!["created_at"] = ago(5);
    const result = await dispatchPush();
    expect(result.created).toBe(1);
    expect(mock.tables["bw_notifications"]![0]).toMatchObject({ event_key: "opening:watch" });
  });
  it("envoie un message de l'équipe encore valable à un voyageur arrivé après, sans renvoi aux autres", async () => {
    mock.tables["vessels"] = [];
    mock.tables["bw_follows"] = [
      {
        id: "a",
        user_id: "early",
        target_kind: "departure",
        target_id: "dep",
        traveller: true,
        active: true,
        created_at: ago(300),
      },
      {
        id: "b",
        user_id: "user",
        target_kind: "departure",
        target_id: "dep",
        traveller: true,
        active: true,
        created_at: ago(5),
      },
    ];
    mock.tables["bw_notifications"] = [
      {
        id: "n0",
        user_id: "early",
        event_key: "admin-msg:reminders:msg",
        title: "Retard",
        body: "Retard de 2 h.",
        url: "/",
      },
    ];
    mock.tables["bw_admin_messages"] = [
      {
        id: "msg",
        audience: { kind: "departure", departureId: "dep", who: "everyone" },
        category: "reminders",
        title: "Retard",
        body: "Retard de 2 h.",
        url: "/",
        status: "sent",
        sent_at: ago(240),
        valid_until: new Date(Date.now() + 3_600_000).toISOString(),
        late_recipients: 0,
      },
    ];
    await dispatchPush();
    const late = mock.tables["bw_notifications"]!.filter(
      (n) => n["event_key"] === "admin-msg:reminders:msg",
    );
    expect(late).toHaveLength(2);
    expect(late.find((n) => n["user_id"] === "user")).toMatchObject({
      body: expect.stringMatching(/^Info du .* · Retard de 2 h\.$/),
    });
    expect(mock.tables["bw_admin_messages"]![0]).toMatchObject({
      late_recipients: 1,
      recipients: 2,
    });
    await dispatchPush();
    expect(
      mock.tables["bw_notifications"]!.filter((n) => n["event_key"] === "admin-msg:reminders:msg"),
    ).toHaveLength(2);
  });
  it("pousse sur le téléphone activé après le suivi, sans toucher aux autres comptes", async () => {
    // Le cas vécu : le suivi crée la notification (cloche) alors que le téléphone n'est pas encore abonné.
    const device = mock.tables["bw_push_subscriptions"]![0]!;
    mock.tables["bw_push_subscriptions"] = [];
    mock.tables["bw_follows"] = [
      {
        id: "trip",
        user_id: "user",
        target_kind: "departure",
        target_id: "dep",
        active: true,
        created_at: ago(5),
      },
      {
        id: "other",
        user_id: "someone",
        target_kind: "departure",
        target_id: "dep",
        active: true,
        created_at: ago(5),
      },
    ];
    mock.tables["bw_voyage_events"] = [
      {
        id: "new",
        departure_id: "dep",
        title: "Horaire",
        body: "Changement.",
        created_at: ago(60),
      },
    ];
    const first = await dispatchPush({ userId: "user" });
    expect(first).toMatchObject({ created: 1, pushed: 0 });
    expect(mock.tables["bw_notifications"]!.map((n) => n["user_id"])).toEqual(["user"]);
    mock.tables["bw_push_subscriptions"] = [device];
    const second = await dispatchPush({ userId: "user" });
    expect(second).toMatchObject({ created: 0, pushed: 1 });
    expect(mock.send).toHaveBeenCalledTimes(1);
    await dispatchPush({ userId: "user" });
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
});

describe("Remerciements", () => {
  it("prévient l'auteur une fois par jour, sans compter ses propres mercis", async () => {
    mock.tables["bw_notification_campaigns"] = [];
    const recent = new Date(Date.now() - 10 * 60_000).toISOString();
    mock.tables["bw_travel_alerts"] = [
      {
        id: "info",
        user_id: "user",
        target_kind: "port",
        target_id: "fr",
        resolved: true,
        expires_at: recent,
        created_at: recent,
      },
    ];
    mock.tables["bw_reactions"] = [
      {
        target_kind: "alert",
        target_id: "info",
        user_id: "fan1",
        code: "merci",
        created_at: recent,
      },
      {
        target_kind: "alert",
        target_id: "info",
        user_id: "fan2",
        code: "merci",
        created_at: recent,
      },
      {
        target_kind: "alert",
        target_id: "info",
        user_id: "user",
        code: "merci",
        created_at: recent,
      },
    ];
    mock.tables["bw_traveller_profiles"] = [{ user_id: "fan1", pseudo: "Jeddi 1934" }];
    await dispatchPush();
    const notices = mock.tables["bw_notifications"]!.filter((n) =>
      String(n["event_key"]).startsWith("thanks:"),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      user_id: "user",
      body: expect.stringContaining("et 1 autre vous remercient"),
    });
    await dispatchPush();
    expect(
      mock.tables["bw_notifications"]!.filter((n) => String(n["event_key"]).startsWith("thanks:")),
    ).toHaveLength(1);
  });
});
