function buildBook(profile) {
  const book = [];

  // Contents
  book.push({ type: "contents" });

  // Characters list
  book.push({ type: "list", key: "characters", title: "Characters", entities: profile.characters });

  // Each character detail page
  (profile.characters || []).forEach((c) => {
    book.push({ type: "detail", key: "characterDetail", title: "Character", entity: c });
  });

  // Factions list
  book.push({ type: "list", key: "factions", title: "Factions", entities: profile.factions });
  (profile.factions || []).forEach((f) => {
    book.push({ type: "detail", key: "factionDetail", title: "Faction", entity: f });
  });

  // Locations
  book.push({ type: "list", key: "locations", title: "Locations", entities: profile.locations });
  (profile.locations || []).forEach((l) => {
    book.push({ type: "detail", key: "locationDetail", title: "Location", entity: l });
  });

  // Worldbuilding
  book.push({ type: "list", key: "world", title: "Worldbuilding", entities: profile.world });
  (profile.world || []).forEach((w) => {
    book.push({ type: "detail", key: "worldDetail", title: "World", entity: w });
  });

  // Timeline
  book.push({ type: "list", key: "timeline", title: "Timeline", entities: profile.timeline });
  (profile.timeline || []).forEach((t) => {
    book.push({ type: "detail", key: "timelineDetail", title: "Timeline Event", entity: t });
  });

  return book;
}
