const editorial = new Set([
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
]);
const moderation = new Set(["reviews", "community", "reports"]);
export function canUseAdminTab(roles: readonly string[], tab: string) {
  return (
    roles.includes("admin") ||
    (roles.includes("editor") && editorial.has(tab)) ||
    (roles.includes("moderator") && moderation.has(tab))
  );
}
