import admin from "firebase-admin";
import { readFileSync } from "fs";

// Load the service account key JSON file
const serviceAccount = JSON.parse(
  readFileSync(new URL("structuredcreativeplanning-fdea4acca240.json", import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
