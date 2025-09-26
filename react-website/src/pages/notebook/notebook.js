import { useUID } from "../../hooks/useUID";
import { useNotebookData } from "../../hooks/useNotebookData";
import NotebookContainer from "../../components/notebook/NotebookContainer";

export default function NotebookPage() {
  const uid = useUID();
  const data = useNotebookData(uid);

  if (!data) {
    return <div>Loading notebook...</div>;
  }

  // data already has characters, factions, etc.
  return <NotebookContainer profile={data} />;
}
