import Page from "../../components/notebook/Page";

export default function EntityListPage({ title, entities = [], onSelect }) {
  return (
    <Page title={title}>
      <ul className="space-y-2">
        {entities.map((e) => (
          <li
            key={e.id}
            onClick={() => onSelect && onSelect(e.id)}
            className="cursor-pointer hover:underline"
          >
            {e.name || e.title || "Untitled"}
          </li>
        ))}
      </ul>
    </Page>
  );
}
