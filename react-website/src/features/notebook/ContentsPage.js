import Page from "../../components/notebook/Page";

export default function ContentsPage({ sections, onNavigate }) {
  return (
    <Page title="Contents">
      <ul className="space-y-4 text-lg">
        {sections.map((sec) => (
          <li
            key={sec.key}
            onClick={() => onNavigate && onNavigate(sec.key)}
            className="cursor-pointer hover:underline flex justify-between"
          >
            <span>{sec.label}</span>
            <span className="text-gray-500">...</span> {/* dotted guide like TOC */}
          </li>
        ))}
      </ul>
    </Page>
  );
}
