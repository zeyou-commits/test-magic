export type FleetPoint = { id: string; x: number; y: number; priority: number };

/** Regroupe uniquement les coques presque superposées, sans déplacer leurs coordonnées. */
export function fleetGroups(points: FleetPoint[], distance = 14) {
  const groups = new Map<string, { groupId: string; groupCount: number }>();
  const visited = new Set<string>();
  for (const point of points) {
    if (visited.has(point.id)) continue;
    const members = [point];
    visited.add(point.id);
    for (let i = 0; i < members.length; i++) {
      const current = members[i]!;
      for (const candidate of points) {
        if (
          !visited.has(candidate.id) &&
          Math.hypot(candidate.x - current.x, candidate.y - current.y) <= distance
        ) {
          visited.add(candidate.id);
          members.push(candidate);
        }
      }
    }
    members.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const leader = members[0]!;
    for (const member of members)
      groups.set(member.id, {
        groupId: leader.id,
        groupCount: member === leader && members.length > 1 ? members.length : 0,
      });
  }
  return groups;
}
