// components/notebook/NotebookContainer.jsx
import { useState } from "react";
import BookContainer from "./BookContainer";
import ContentsPage from "../../features/notebook/ContentsPage";
import EntityListPage from "../../features/notebook/EntityListPage";
import EntityDetailPage from "../../features/notebook/EntityDetailPage";
import TitlePage from "../../features/notebook/TitlePage";
import PrefacePage from "../../features/notebook/PrefacePage";
import SummaryPage from "../../features/notebook/SummaryPage";

// utils/bookBuilder.js (or inside NotebookContainer if you prefer)

// helper: split array into chunks of size n
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Flatten profile data into a single linear book
export function buildBook(profile) {
  const book = [];

  // ---- Front matter ----
  book.push({ type: "title", key: "title", title: profile.title || "My Notebook" });
  book.push({ type: "preface", key: "preface", content: profile.preface || "" });

  // ---- Contents ----
  const sectionKeys = ["characters", "factions", "locations", "world", "timeline"];
  const sections = sectionKeys.map((key) => ({
    key,
    label: key === "world" ? "Worldbuilding" : key.charAt(0).toUpperCase() + key.slice(1),
    list: profile[key] || [],
  }));

  book.push({ type: "contents", key: "contents", sections });

  // ---- Sections ----
  sections.forEach((sec) => {
    // split section list into chunks of 5 items
    const chunked = chunk(sec.list, 5);
    chunked.forEach((entities, idx) => {
      book.push({
        type: "list",
        key: `${sec.key}-list-${idx}`,
        title: sec.label,
        entities,
      });
    });

    // then add detail pages
    sec.list.forEach((item) => {
      book.push({
        type: "detail",
        key: `${sec.key}-${item.id}`,
        title: sec.label,
        entity: item,
      });
    });
  });

  // ---- End matter ----
  book.push({ type: "summary", key: "summary", content: profile.summary || "" });
  book.push({ type: "about", key: "about", content: profile.about || "" });

  console.log(sections);

  return { book, sections };
}

export default function NotebookContainer({ profile }) {
  const { book } = buildBook(profile);
  const totalPages = book.length;
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const currentPage = book[pageIndex];
  if (!currentPage) return <div>No pages found</div>;

  const currentPageNumber = pageIndex + 1;

  // component selection
  const PageComponent =
    currentPage.type === "title"
      ? TitlePage
      : currentPage.type === "preface"
      ? PrefacePage
      : currentPage.type === "contents"
      ? ContentsPage
      : currentPage.type === "list"
      ? EntityListPage
      : currentPage.type === "detail"
      ? EntityDetailPage
      : currentPage.type === "summary"
      ? SummaryPage
      : () => <div>Unknown page type</div>;

  // navigation
  const goNext = () => {
    if (pageIndex < book.length - 1) {
      setDirection(1);
      setPageIndex((i) => i + 1);
    }
  };
  const goPrev = () => {
    if (pageIndex > 0) {
      setDirection(-1);
      setPageIndex((i) => i - 1);
    }
  };

  // jump helpers
  const jumpTo = (key) => {
    const targetIndex = book.findIndex((p) => p.key === key);
    if (targetIndex >= 0) {
      setDirection(targetIndex > pageIndex ? 1 : -1);
      setPageIndex(targetIndex);
    }
  };
  const jumpToEntity = (id) => {
    const targetIndex = book.findIndex(
      (p) => p.type === "detail" && p.entity?.id === id
    );
    if (targetIndex >= 0) {
      setDirection(targetIndex > pageIndex ? 1 : -1);
      setPageIndex(targetIndex);
    }
  };

  // props for each type
  const pageProps =
    currentPage.type === "contents"
      ? { sections: currentPage.sections, onNavigate: jumpTo }
      : currentPage.type === "list"
      ? { title: currentPage.title, entities: currentPage.entities, onSelect: jumpToEntity }
      : currentPage.type === "detail"
      ? { title: currentPage.title, entity: currentPage.entity }
      : { content: currentPage.content, title: currentPage.title };

  return (
    <BookContainer
      currentPageKey={currentPage.key}
      direction={direction}
      onNext={pageIndex < book.length - 1 ? goNext : null}
      onPrev={pageIndex > 0 ? goPrev : null}
      pageNumber={currentPageNumber}
      totalPages={totalPages}
    >
      <PageComponent {...pageProps} />
    </BookContainer>
  );
}