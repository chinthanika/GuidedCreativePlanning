import Page from "../../components/notebook/Page";

export default function EntityDetailPage({ title, entity }) {
  if (!entity) return null;

  return (
    <Page title={title || entity.name || entity.title}>
      <div className="notebook-detail">
        {Object.entries(entity).map(([key, value]) => {
          if (["id", "name", "title"].includes(key)) return null;
          return (
            <p key={key}>
              <strong>{key}:</strong> {String(value)}
            </p>
          );
        })}
      </div>
    </Page>
  );
}
