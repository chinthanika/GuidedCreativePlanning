import admin from "firebase-admin";
import { readFileSync } from "fs";

// Load the service account key JSON file
const serviceAccount = JSON.parse(
  readFileSync(new URL("structuredcreativeplanning-fdea4acca240.json", import.meta.url))
);

const DATABASE_URL = "https://structuredcreativeplanning-default-rtdb.firebaseio.com";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://structuredcreativeplanning-default-rtdb.firebaseio.com/", // <-- add this
});

export const database = admin.database();
export default admin;
