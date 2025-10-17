// migration-addEventOrder.js
// Run this once to add 'order' field to all existing events

import { database } from "../Firebase/firebaseAdmin.js";
import { get, set, ref, child, update } from '../Firebase/firebase.js';

async function migrateEventOrder() {
    console.log("Starting event order migration...");

    try {
        // Get all users (you might need to adjust this based on your user structure)
        const usersRef = ref(database, "stories");
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            console.log("No stories found");
            return;
        }

        const allUsers = snapshot.val();
        let totalEventsMigrated = 0;

        // Iterate through each user
        for (const [userId, userData] of Object.entries(allUsers)) {
            console.log(`Processing user: ${userId}`);

            const timelineRef = child(usersRef, `${userId}/timeline`);
            const timelineSnapshot = await get(timelineRef);

            if (!timelineSnapshot.exists()) {
                console.log(`  No timeline found for user ${userId}`);
                continue;
            }

            const events = timelineSnapshot.val();
            let userEventCount = 0;

            // Add order to each event
            for (const [eventKey, event] of Object.entries(events)) {
                // Skip if order already exists
                if (event.order !== undefined && event.order !== null) {
                    console.log(`  Event ${eventKey} already has order: ${event.order}`);
                    continue;
                }

                // Assign order based on key index
                const order = Object.keys(events).indexOf(eventKey);
                const eventRef = child(timelineRef, eventKey);

                const updatedEvent = {
                    ...event,
                    order: order
                };

                await set(eventRef, updatedEvent);
                console.log(`  [PASS] Event ${eventKey} - Added order: ${order}`);
                userEventCount++;
                totalEventsMigrated++;
            }

            console.log(`  User ${userId}: ${userEventCount} events updated\n`);
        }

        console.log(`\n✅ Migration complete! ${totalEventsMigrated} events updated with order field.`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

// Run the migration
migrateEventOrder();