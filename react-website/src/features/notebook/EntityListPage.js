import { useState } from "react";
import Page from "../../components/notebook/Page";

const ITEMS_PER_PAGE = 5;

export default function EntityListPage({ title, entities = [], onSelect, onBack }) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(entities.length / ITEMS_PER_PAGE);
  const start = page * ITEMS_PER_PAGE;
  const currentSlice = entities.slice(start, start + ITEMS_PER_PAGE);

  return (
    <Page title={title} onBack={onBack}>
      <div className="relative">
        {/* Content */}
        <ul className="notebook-list">
          {currentSlice.map((e) => (
            <li key={e.id} onClick={() => onSelect && onSelect(e.id)}>
              {e.name || e.label || e.title || "Unknown"}
            </li>
          ))}
        </ul>

        {page > 0 && (
          <div
            className="notebook-arrow left"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹
          </div>
        )}

        {page < totalPages - 1 && (
          <div
            className="notebook-arrow right"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            ›
          </div>
        )}
      </div>
    </Page>
  );
}
