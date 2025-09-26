import { useEffect, useState } from "react";
import { getNotebookData } from "../../services/notebook/api";

export function useNotebookData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getNotebookData().then(setData);
  }, []);

  return data;
}
