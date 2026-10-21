// Isolated integration check: npm install --prefix work/db-tests --no-save @electric-sql/pglite
// BW_PGLITE_MODULE may point to another installed PGlite module. Never uses a remote database.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath =
  process.env.BW_PGLITE_MODULE ||
  pathToFileURL(resolve("work/db-tests/node_modules/@electric-sql/pglite/dist/index.js")).href;
const { PGlite } = await import(modulePath);
const db = new PGlite();
const ids = {
  vessel: "10000000-0000-0000-0000-000000000001",
  port: "20000000-0000-0000-0000-000000000001",
  author: "30000000-0000-0000-0000-000000000001",
  other: "30000000-0000-0000-0000-000000000002",
  admin: "30000000-0000-0000-0000-000000000003",
};
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.vessels(id uuid PRIMARY KEY,status text); CREATE TABLE public.ports(id uuid PRIMARY KEY,status text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION private.has_role(p_user uuid,p_role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_user='${ids.admin}'::uuid AND p_role='admin' $$;
INSERT INTO auth.users VALUES('${ids.author}'),('${ids.other}'),('${ids.admin}');INSERT INTO public.vessels VALUES('${ids.vessel}','active');INSERT INTO public.ports VALUES('${ids.port}','active');`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/20261021120000_vessel_community.sql", import.meta.url),
    "utf8",
  ),
);
async function as(role, id = "") {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id}',false); SET ROLE ${role};`,
  );
}
async function feed(kind = null, target = null, moderation = false) {
  return (
    await db.query("SELECT public.bw_community_feed($1,$2,$3) AS feed", [kind, target, moderation])
  ).rows[0].feed;
}
async function denied(sql, args = []) {
  await assert.rejects(db.query(sql, args));
}
await as("anon");
assert.equal((await feed()).enabled, true);
await denied("SELECT * FROM public.bw_travel_alerts");
await denied("SELECT public.bw_submit_review($1,5,'test')", [ids.vessel]);
await assert.rejects(feed(null, null, true));
await as("authenticated", ids.author);
await db.query("SELECT public.bw_submit_review($1,5,'Très bon accueil')", [ids.vessel]);
assert.equal((await feed("vessel", ids.vessel)).reviews[0].status, "pending");
await denied("SELECT public.bw_submit_review($1,4,'retry')", [ids.vessel]);
await denied("SELECT public.bw_moderate_review($1,'published')", [
  (await feed("vessel", ids.vessel)).reviews[0].id,
]);
await as("anon");
assert.equal((await feed("vessel", ids.vessel)).reviews.length, 0);
await as("authenticated", ids.admin);
const review = (await feed(null, null, true)).reviews[0];
await db.query("SELECT public.bw_moderate_review($1,'published')", [review.id]);
await as("anon");
assert.equal((await feed("vessel", ids.vessel)).reviews[0].score, 5);
assert.ok(!JSON.stringify(await feed("vessel", ids.vessel)).includes(ids.author));
await as("authenticated", ids.author);
await db.query("SELECT public.bw_report_travel('vessel',$1,'delay',30)", [ids.vessel]);
let alert = (await feed()).alerts[0];
await denied("SELECT public.bw_report_travel('vessel',$1,'delay',60)", [ids.vessel]);
await denied("SELECT public.bw_report_travel('port',$1,'delay',30)", [ids.port]);
await denied("SELECT public.bw_report_travel('vessel',$1,'delay',45)", [ids.vessel]);
await denied("SELECT public.bw_report_travel('port',$1,'queue',NULL)", [ids.vessel]);
await denied("SELECT public.bw_alert_action($1,'confirm')", [alert.id]);
await as("authenticated", ids.other);
await db.query("SELECT public.bw_alert_action($1,'confirm')", [alert.id]);
await db.query("SELECT public.bw_alert_action($1,'confirm')", [alert.id]);
assert.equal((await feed()).alerts[0].confirmations, 1);
await denied("SELECT public.bw_alert_action($1,'resolve')", [alert.id]);
await as("authenticated", ids.author);
await db.query("SELECT public.bw_alert_action($1,'resolve')", [alert.id]);
assert.equal((await feed()).alerts.length, 0);
await db.query("SELECT public.bw_report_travel('port',$1,'queue',NULL)", [ids.port]);
await as("postgres");
await db.exec("UPDATE public.bw_travel_alerts SET expires_at=now()-interval '1 minute'");
await as("anon");
assert.equal((await feed()).alerts.length, 0);
await denied("SELECT user_id FROM public.bw_vessel_reviews");
await as("authenticated", ids.author);
await db.query("SELECT public.bw_report_travel('vessel',$1,'delay',30)", [ids.vessel]);
await db.query("SELECT public.bw_report_travel('vessel',$1,'boarding',NULL)", [ids.vessel]);
await db.query("SELECT public.bw_report_travel('port',$1,'queue',NULL)", [ids.port]);
await denied("SELECT public.bw_report_travel('port',$1,'access',NULL)", [ids.port]);
await as("authenticated", ids.admin);
alert = (await feed()).alerts[0];
await db.query("SELECT public.bw_alert_action($1,'resolve')", [alert.id]);
await db.close();
console.log(
  "Community DB: authentication, moderation, private IDs, valid targets/categories, duplicate/rate limits, unique confirmation, expiry and owner/admin resolution passed.",
);
