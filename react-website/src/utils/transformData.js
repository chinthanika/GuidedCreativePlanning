export function transformProfileData(raw) {
  const nodes = raw?.graph?.nodes || [];
  const links = raw?.graph?.links || [];

  // Group nodes by their "group" field
  const characters = nodes.filter(n => n.group === "Person");
  const factions = nodes.filter(n => n.group === "Organisation");
  const locations = nodes.filter(n => n.group === "Location");
  const world = nodes.filter(n => n.group === "WorldBuilding");

  // Normalize events (Firebase-style object → array)
  const timeline = Object.entries(raw?.events || {}).map(([id, ev]) => ({
    id,
    ...ev,
  }));

  return {
    characters,
    factions,
    locations,
    world,
    timeline,
    links, // keep relationships available too
    profile: raw?.profile || {},
  };
}
