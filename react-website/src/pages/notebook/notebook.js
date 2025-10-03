import { useUID } from "../../hooks/useUID";
import { useNotebookData } from "../../hooks/useNotebookData";
import NotebookContainer from "../../components/notebook/NotebookContainer";
import "../../styles/notebook.css";

export default function NotebookPage() {
  const uid = useUID();
  const data = useNotebookData(uid);

  if (!data) {
    return <div>Loading notebook...</div>;
  }
  console.log("Notebook data:", data);

  // data already has characters, factions, etc.
  return <NotebookContainer profile={data} />;
}
