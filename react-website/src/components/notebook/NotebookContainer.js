// components/notebook/NotebookContainer.jsx
import { useState } from "react";
import BookContainer from "./BookContainer";
import Page from "./Page";
import ContentsPage from "../../features/notebook/ContentsPage";
import EntityListPage from "../../features/notebook/EntityListPage";
import EntityDetailPage from "../../features/notebook/EntityDetailPage";

function findEntity(list, id) {
  return list.find((e) => e.id === id);
}

export default function NotebookContainer({ profile }) {
  const [navStack, setNavStack] = useState(["contents"]);

  const currentPage = navStack[navStack.length - 1];
  const [selectedId, setSelectedId] = useState(null);

  const sections = [
    { key: "characters", label: "Characters" },
    { key: "factions", label: "Factions" },
    { key: "locations", label: "Locations" },
    { key: "world", label: "Worldbuilding" },
    { key: "timeline", label: "Timeline" },
  ];

  const goTo = (key) => setNavStack((s) => [...s, key]);
  const goBack = () =>
    setNavStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <BookContainer currentPageKey={currentPage}>
      {currentPage === "contents" && (
        <ContentsPage sections={sections} onNavigate={goTo} />
      )}

      {currentPage === "characters" && !selectedId && (
        <EntityListPage
          title="Characters"
          entities={profile?.characters || []}
          onSelect={(id) => {
            setSelectedId(id);
            goTo("characterDetail");
          }}
          onBack={goBack}
        />
      )}
      {currentPage === "characterDetail" && selectedId && (
        <EntityDetailPage
          title="Character"
          entity={findEntity(profile?.characters || [], selectedId)}
          onBack={goBack}
        />
      )}

      {currentPage === "factions" && !selectedId && (
        <EntityListPage
          title="Factions"
          entities={profile?.factions || []}
          onSelect={(id) => {
            setSelectedId(id);
            goTo("factionDetail");
          }}
          onBack={goBack}
        />
      )}
      {currentPage === "factionDetail" && selectedId && (
        <EntityDetailPage
          title="Faction"
          entity={findEntity(profile?.factions || [], selectedId)}
          onBack={goBack}
        />
      )}

      {currentPage === "locations" && !selectedId && (
        <EntityListPage
          title="Locations"
          entities={profile?.locations || []}
          onSelect={(id) => {
            setSelectedId(id);
            goTo("locationDetail");
          }}
          onBack={goBack}
        />
      )}
      {currentPage === "locationDetail" && selectedId && (
        <EntityDetailPage
          title="Location"
          entity={findEntity(profile?.locations || [], selectedId)}
          onBack={goBack}
        />
      )}

      {currentPage === "world" && !selectedId && (
        <EntityListPage
          title="Worldbuilding"
          entities={profile?.world || []}
          onSelect={(id) => {
            setSelectedId(id);
            goTo("worldDetail");
          }}
          onBack={goBack}
        />
      )}
      {currentPage === "worldDetail" && selectedId && (
        <EntityDetailPage
          title="World"
          entity={findEntity(profile?.world || [], selectedId)}
          onBack={goBack}
        />
      )}

      {currentPage === "timeline" && !selectedId && (
        <EntityListPage
          title="Timeline"
          entities={profile?.timeline || []}
          onSelect={(id) => {
            setSelectedId(id);
            goTo("timelineDetail");
          }}
          onBack={goBack}
        />
      )}
      {currentPage === "timelineDetail" && selectedId && (
        <EntityDetailPage
          title="Timeline Event"
          entity={findEntity(profile?.timeline || [], selectedId)}
          onBack={goBack}
        />
      )}
    </BookContainer>
  );
}
