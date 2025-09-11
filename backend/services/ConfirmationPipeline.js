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

        // If either node is missing in confirmed nodes, check pending changes
        if (!nodeA || !nodeB) {
            const pending = await this.listPending();
            const pendingNodes = Object.values(pending)
                .filter(c => c.entityType === "node")
                .map(c => c.newData);

            const nodeAInPending = !nodeA && pendingNodes.find(n => n.id === data.node1 || n.label === data.node1);
            const nodeBInPending = !nodeB && pendingNodes.find(n => n.id === data.node2 || n.label === data.node2);

            if (!nodeA && !nodeAInPending) {
                throw new Error(`Node not found: ${data.node1}`);
            }
            if (!nodeB && !nodeBInPending) {
                throw new Error(`Node not found: ${data.node2}`);
            }
        }
    }

    async _validateEvent(data) {
        if (!data.title || !data.date || !data.stage) {
            throw new Error("Event must have 'title', 'date', and 'stage'");
        }

        const validStages = ["introduction", "rising action", "climax", "falling action", "resolution"];
        if (!validStages.includes(data.stage)) {
            throw new Error(`Event stage must be one of: ${validStages.join(", ")}`);
        }

        // ✅ enforce MM/DD/YYYY format
        const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
        if (!dateRegex.test(data.date)) {
            throw new Error("Event 'date' must be in MM/DD/YYYY format, e.g. 07/03/2023");
        }

        // Apply defaults if not provided
        if (data.description === undefined) {
            data.description = "";
        }
        if (data.isMainEvent === undefined) {
            data.isMainEvent = false;
        }
    }

    async _validateChange(entityType, data) {
        switch (entityType) {
            case "node":
                await this._validateNode(data);
                break;

            case "link":
                await this._validateLink(data);
                break;

            case "event":
                await this._validateEvent(data);
                break;

            case "profile":
                break;

            case "node-delete":
                if (!data.identifier || typeof data.identifier !== "string") {
                    throw new Error("node-delete requires 'identifier' (ID or label)");
                }
                break;

            case "link-delete":
                if (!data.node1 || !data.node2) {
                    throw new Error("link-delete requires 'node1' and 'node2' (IDs or labels)");
                }
                if (typeof data.node1 !== "string" || typeof data.node2 !== "string") {
                    throw new Error("link-delete node1/node2 must be strings");
                }
                break;

            case "event-delete":
                if (!data.identifier || typeof data.identifier !== "string") {
                    throw new Error("event-delete requires 'identifier' (ID or title)");
                }
                break;

            default:
                throw new Error(`Unknown entityType: ${entityType}`);
        }
    }



    /* =========================
       STAGE / CONFIRM / DENY
    ========================= */
    async stageChange(entityType, entityId, newData) {
        await this._validateChange(entityType, newData);

        // ===== Prevent duplicate pending changes =====
        const pending = await this.listPending();
        const duplicate = Object.values(pending).find(c => {
            if (c.entityType !== entityType) return false;
            switch (entityType) {
                case "node":
                    return c.newData.label === newData.label && c.newData.group === newData.group;
                case "link":
                    const [n1, n2] = this.manager._normalizePair(newData.node1, newData.node2);
                    const [p1, p2] = this.manager._normalizePair(c.newData.source || c.newData.node1, c.newData.target || c.newData.node2);
                    return n1 === p1 && n2 === p2 && newData.type === c.newData.type;
                case "event":
                    return c.newData.title === newData.title && c.newData.date === newData.date;
                default:
                    return false;
            }
        });
        if (duplicate) throw new Error(`A pending ${entityType} with the same data already exists.`);

        // ===== Handle links =====
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

        /* ===== validate deletes against DB ===== */
        if (entityType === "node-delete") {
            const node = await this.manager.getNode(newData.identifier)
                || await this.manager.resolveNodeByName(newData.identifier);
            if (!node) throw new Error(`Cannot stage node-delete: '${newData.identifier}' not found`);
            newData.identifier = node.id;
        }

        if (entityType === "link-delete") {
            const nodeA = await this.manager.getNode(newData.node1)
                || await this.manager.resolveNodeByName(newData.node1);
            const nodeB = await this.manager.getNode(newData.node2)
                || await this.manager.resolveNodeByName(newData.node2);
            if (!nodeA || !nodeB) {
                throw new Error(`Cannot stage link-delete: nodes not found: ${newData.node1}, ${newData.node2}`);
            }

            const link = await this.manager.getLinkByIds(nodeA.id, nodeB.id);
            if (!link) throw new Error(`Cannot stage link-delete: no link exists between ${nodeA.id} and ${nodeB.id}`);

            const [n1, n2] = this.manager._normalizePair(nodeA.id, nodeB.id);
            newData = { node1: n1, node2: n2 };
        }

        if (entityType === "event-delete") {
            const event = await this.manager.resolveEventById(newData.identifier)
                || await this.manager.resolveEventByName(newData.identifier);
            if (!event) throw new Error(`Cannot stage event-delete: '${newData.identifier}' not found`);
            newData.identifier = event.id;
        }

        // ===== Stage change =====
        const changeKey = Date.now().toString();
        const changeRef = child(this.pendingRef, changeKey);

        const payload = { entityType, newData, timestamp: Date.now() };
        if (entityId) payload.entityId = entityId;

        await set(changeRef, payload);

        return {
            status: "staged",
            changeKey,
            entityType,
            entityId: entityId || null,
            newData,
            editable: true,
            nextStep: "Review in pending-changes widget and confirm/deny"
        };
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
                    const nodeA = await this.manager.getNode(newData.source);
                    const nodeB = await this.manager.getNode(newData.target);
                    if (!nodeA || !nodeB) {
                        throw new Error(
                            `Cannot confirm link: node(s) not yet confirmed: ${newData.source}, ${newData.target}`
                        );
                    }

                    result = await this.manager.upsertLinkByIds(
                        newData.source,
                        newData.target,
                        newData.type,
                        newData.context,
                        overwrite
                    );

                    if (result.action === "exists" && !overwrite) {
                        return {
                            confirmed: false,
                            status: 409,
                            message: `Link already exists between ${newData.source} and ${newData.target}`,
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
                        result = await this.manager.upsertEvent(entityId, newData);
                    } else {
                        const newId = Date.now().toString();
                        result = await this.manager.upsertEvent(newId, newData);
                    }
                    break;

                case "profile":
                    const oldProfile = await this.manager.getProfile() || {};
                    result = await this.manager.updateProfile({ ...oldProfile, ...newData });
                    break;

                /* ====== NEW: unified delete calls ====== */
                case "node-delete":
                    result = await this.manager.deleteNode(newData.identifier);
                    break;

                case "link-delete":
                    result = await this.manager.deleteLinkByIds(newData.node1, newData.node2);
                    break;

                case "event-delete":
                    result = await this.manager.deleteEventById(newData.identifier);
                    if (!result.deleted) {
                        // fallback: try by title if ID didn't match
                        result = await this.manager.deleteEventByTitle(newData.identifier);
                    }
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
        const pending = snapshot.exists() ? snapshot.val() : {};

        const enhanced = {};
        for (const [key, change] of Object.entries(pending)) {
            if (change.entityType === "link") {
                const nodeA = await this.manager.getNode(change.newData.source);
                const nodeB = await this.manager.getNode(change.newData.target);
                change.can_confirm = !!nodeA && !!nodeB;
            }
            enhanced[key] = change;
        }
        return enhanced;
    }
}