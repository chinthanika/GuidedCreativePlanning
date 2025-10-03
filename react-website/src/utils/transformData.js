export function transformProfileData(raw) {
  console.log("Transforming profile data:", raw);

  // Get nodes + links, filter out nulls
  const nodes = (raw?.graph?.nodes || []).filter(Boolean);
  const links = raw?.graph?.links || [];

  console.log("Nodes:", nodes);
  console.log("Links:", links);
  console.log("Raw events:", raw?.events);

  // Group nodes by "group"
  const characters = nodes.filter((n) => n.group === "Person");
  const factions = nodes.filter((n) => n.group === "Organization");
  const locations = nodes.filter((n) => n.group === "Location");
  const world = nodes.filter((n) => n.group === "WorldBuilding"); // will be empty if group not used

  // Normalize events (Firebase-style object → array)
  const timeline = Object.entries(raw?.events || {}).map(([id, ev]) => ({
    id,
    ...ev,
  }));

  console.log("Characters:", characters);
  console.log("Factions:", factions);
  console.log("Locations:", locations);
  console.log("World:", world);
  console.log("Timeline:", timeline);

  return {
    characters,
    factions,
    locations,
    world,
    timeline,
    links,
    profile: raw?.profile || {},
  };
}
