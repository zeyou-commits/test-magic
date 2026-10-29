const editorial = new Set([
  "planning",
  "commercial",
  "departures",
  "schedules",
  "import",
  "vessels",
  "ports",
  "routes",
  "companies",
  "alerts",
  "data",
  "flash",
  "signals",
  "places",
  "walletMedia",
]);
const moderation = new Set(["reviews", "community", "reports"]);
export function canUseAdminTab(roles: readonly string[], tab: string) {
  return (
    roles.includes("admin") ||
    (roles.includes("editor") && editorial.has(tab)) ||
    (roles.includes("moderator") && moderation.has(tab))
  );
}
