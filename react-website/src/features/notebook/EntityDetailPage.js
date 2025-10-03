import { useState } from "react";
import Page from "../../components/notebook/Page";

function formatKey(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    return (
      <ul className="ml-4 list-disc">
        {value.map((v, i) => (
          <li key={i}>{renderValue(v)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="ml-4 space-y-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <strong>{formatKey(k)}:</strong> {renderValue(v)}
          </div>
        ))}
      </div>
    );
  }
  return String(value);
}

const FIELDS_PER_PAGE = 8;

export default function EntityDetailPage({ title, entity, onBack }) {
  const [page, setPage] = useState(0);
  if (!entity) return null;

  console.log("Rendering entity:", entity);
  const displayGroup =
    entity.group === "Person" ? "Character" : formatKey(entity.group || "Entity");

  const visibleEntries = Object.entries(entity).filter(
    ([key]) => !["id", "entity_id", "name", "label", "group"].includes(key)
  );

  const totalPages = Math.ceil(visibleEntries.length / FIELDS_PER_PAGE);
  const start = page * FIELDS_PER_PAGE;
  const currentSlice = visibleEntries.slice(start, start + FIELDS_PER_PAGE);
  
  return (
    <Page title={title || entity.name || entity.title || entity.label || displayGroup} onBack={onBack}>
      <div className="relative notebook-detail">
        <h2>{title}</h2>
        {currentSlice.map(([key, value]) => (
          <div key={key}>
            <strong>{formatKey(key)}:</strong> {renderValue(value)}
          </div>
        ))}

        {/* Left Arrow */}
        {page > 0 && (
          <div
            className="absolute left-2 top-1/2 -translate-y-1/2 text-2xl cursor-pointer select-none"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹
          </div>
        )}

        {/* Right Arrow */}
        {page < totalPages - 1 && (
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 text-2xl cursor-pointer select-none"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            ›
          </div>
        )}

        {/* Page Number */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-500">
          {page + 1} / {totalPages}
        </div>
      </div>
    </Page>
  );
}
