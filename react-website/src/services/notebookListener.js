import { ref, onValue } from "firebase/database";
import { database } from "../../Firebase/firebase";

export function listenToNotebook(callback) {
  const notebookRef = ref(database, "stories");
  return onValue(notebookRef, (snapshot) => {
    callback(snapshot.val());
  });
}
