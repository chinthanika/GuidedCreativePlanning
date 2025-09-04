import { database } from "../Firebase/firebaseAdmin.js";
import { get, set, update, remove, ref, child } from "../Firebase/firebase.js";
import StoryProfileManager from "./StoryProfileManager.js";

export default class ConfirmationPipeline {
    constructor({ uid } = {}) {
        if (!uid) throw new Error("User ID is required");
        this.uid = uid;

        this.pendingRef = ref(database, `stories/${this.uid}/pendingChanges`);
        this.manager = new StoryProfileManager({ uid });
    }

    /* =========================
       VALIDATION HELPERS
    ========================= */
    async _validateNode(data) {
        if (!data.label || !data.group) {
            throw new Error("Node must have 'label' and 'group'");
        }
        const validGroups = ["Person", "Location", "Organization"];
        if (!validGroups.includes(data.group)) {
            throw new Error(`Node group must be one of: ${validGroups.join(", ")}`);
        }
    }

    async _validateLink(data) {
        if (!data.node1 || !data.node2 || !data.type) {
            throw new Error("Link must have 'node1', 'node2', and 'type'");
        }

        const nodeA = await this.manager.getNode(data.node1)
            || await this.manager.resolveNodeByName(data.node1);
        const nodeB = await this.manager.getNode(data.node2)
            || await this.manager.resolveNodeByName(data.node2);

        if (!nodeA || !nodeB) {
            throw new Error(`Both nodes must exist. Got: node1=${data.node1}, node2=${data.node2}`);
        }
    }


    async _validateEvent(data) {
        if (!data.title || !data.date) {
            throw new Error("Event must have 'title' and 'date'");
        }
    }

    async _validateChange(entityType, data) {
        switch (entityType) {
            case "node": await this._validateNode(data); break;
            case "link": await this._validateLink(data); break;
            case "event": await this._validateEvent(data); break;
            case "profile": break; // optional profile validation
            default: throw new Error(`Unknown entityType: ${entityType}`);
        }
    }

    /* =========================
       STAGE / CONFIRM / DENY
    ========================= */
    async stageChange(entityType, entityId, newData) {
        await this._validateChange(entityType, newData);

        if (entityType === "link") {
            const nodeA = await this.manager.getNode(newData.node1)
                || await this.manager.resolveNodeByName(newData.node1);
            const nodeB = await this.manager.getNode(newData.node2)
                || await this.manager.resolveNodeByName(newData.node2);

            if (!nodeA || !nodeB) {
                throw new Error(
                    `Cannot stage link: node1='${newData.node1}' or node2='${newData.node2}' not found`
                );
            }

            const [n1, n2] = this.manager._normalizePair(nodeA.id, nodeB.id);

            newData = {
                context: newData.context || "",
                type: newData.type,
                source: n1,
                target: n2,
            };
        }

        const changeKey = Date.now().toString();
        const changeRef = child(this.pendingRef, changeKey);

        const payload = { entityType, newData, timestamp: Date.now() };
        if (entityId) payload.entityId = entityId;

        await set(changeRef, payload);

        return { changeKey, entityType, entityId, newData };
    }



    async confirm(changeKey, { overwrite = false } = {}) {
        if (!changeKey) throw new Error("changeKey is required");

        const snapshot = await get(child(this.pendingRef, changeKey));
        if (!snapshot.exists()) throw new Error("Pending change not found");

        const { entityType, entityId, newData } = snapshot.val();
        let result;

        try {
            switch (entityType) {
                case "link": {
                    result = await this.manager.upsertLinkByIds(
                        newData.source,
                        newData.target,
                        newData.type,
                        newData.context,
                        overwrite // pass in user’s choice
                    );

                    if (result.action === "exists" && !overwrite) {
                        // Don’t delete pending request yet — user must decide
                        return {
                            confirmed: false,
                            status: 409,
                            message: `Link already exists between ${newData.node1} and ${newData.node2}`,
                            conflict: result
                        };
                    }
                    break;
                }

                case "node":
                    result = await this.manager.upsertNode(
                        entityId || Date.now().toString(),
                        newData
                    );
                    break;

                case "event":
                    if (entityId) {
                        const oldData = await this.manager.getEvent(entityId) || {};
                        result = await this.manager.updateEvent(entityId, { ...oldData, ...newData });
                    } else {
                        const newId = Date.now().toString();
                        result = await this.manager.setEvent(newId, newData);
                    }
                    break;

                case "profile":
                    const oldProfile = await this.manager.getProfile() || {};
                    result = await this.manager.updateProfile({ ...oldProfile, ...newData });
                    break;

                default:
                    throw new Error(`Unknown entityType: ${entityType}`);
            }

            // Only remove if successful (not in conflict)
            await remove(child(this.pendingRef, changeKey));
            return { confirmed: true, result };

        } catch (err) {
            return { confirmed: false, error: err.message };
        }
    }

    async deny(changeKey) {
        if (!changeKey) throw new Error("changeKey is required");

        await remove(child(this.pendingRef, changeKey));
        return { denied: true, changeKey };
    }

    async listPending() {
        const snapshot = await get(this.pendingRef);
        return snapshot.exists() ? snapshot.val() : {};
    }
}