import { useEffect, useState } from "react";
import { getNotebookData } from "../services/notebookAPI";

export function useNotebookData(uid) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) return; // 🚦 don't fetch until uid is ready

    (async () => {
      try {
        const notebook = await getNotebookData(uid);
        setData(notebook);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [uid]);

  return data;
}
