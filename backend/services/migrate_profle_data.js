// migrate_profile_data.js
import { database as db }from "../Firebase/firebaseAdmin.js";
import { getDatabase } from "firebase-admin/database";



async function migrate() {
  const storiesSnap = await db.ref("stories").once("value");
  console.log("Fetched stories snapshot:", storiesSnap.exists());
  const stories = storiesSnap.val() || {};

  for (const [storyId, story] of Object.entries(stories)) {
    console.log(`Migrating story: ${storyId}`);

    // --- Fix nodes ---
    if (story.graph && story.graph.nodes) {
        console.log(`  Found graph with ${Object.keys(story.graph.nodes).length} nodes.`);
      for (const [key, node] of Object.entries(story.graph.nodes)) {
        console.log(`  Checking node: ${node.id} (${node.label})`);
        let updated = false;

        // Normalize aliases into array
        if (typeof node.aliases === "string" && node.aliases.trim() !== "None") {
          const aliases = node.aliases
            .split(",")
            .map(a => a.trim())
            .filter(a => a.length > 0);

          await db.ref(`stories/${storyId}/graph/nodes/${key}/aliases`).set(aliases);
          updated = true;
        }

        if (updated) console.log(`  ✔ Fixed node ${node.id} (${node.label})`);
      }
    }

    // --- Fix links ---
    if (story.graph && story.graph.links) {
      for (const [linkId, link] of Object.entries(story.graph.links)) {
        let updated = false;
        const updateData = { ...link };

        if (link.node1 && link.node2) {
          updateData.source = link.node1;
          updateData.target = link.node2;
          delete updateData.node1;
          delete updateData.node2;
          updated = true;
        }

        if (updated) {
          await db.ref(`stories/graph/${storyId}/links/${linkId}`).set(updateData);
          console.log(`  ✔ Fixed link ${linkId} (${updateData.source} ↔ ${updateData.target})`);
        }
      }
    }
  }

  console.log("Migration complete ✅");
}

migrate().catch(err => {
  console.error("Migration failed ❌", err);
  process.exit(1);
});
