import Page from "../../components/notebook/Page";

export default function ContentsPage({ sections, onNavigate }) {
  return (
    <Page title="Contents">
      <ul className="notebook-toc">
        {sections.map((sec) => (
          <li key={sec.key} onClick={() => onNavigate && onNavigate(sec.key)}>
            <span>{sec.label}</span>
            <span className="text-gray-500">...</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}
