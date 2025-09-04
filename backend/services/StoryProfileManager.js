import { database } from "../Firebase/firebaseAdmin.js";
import { get, set, update, ref, onValue, push, child, remove } from '../Firebase/firebase.js';


// const { database } = require("../../react-website/src/Firebase/firebase");
// const { get, set, update, ref, child, remove } = require("../../react-website/src/Firebase/firebase");
// const { useAuthValue } = require("../../react-website/src/Firebase/AuthContext");

class StoryProfileManager {
    constructor({ uid }) {
        this.user = uid;
        if (!this.user) {
            throw new Error("User not authenticated");
        }

        // Base references
        this.baseRef = ref(database, `stories/${this.user}/`);
        this.graphRef = child(this.baseRef, "graph");
        this.nodesRef = child(this.graphRef, "nodes");
        this.linksRef = child(this.graphRef, "links");
        this.eventsRef = child(this.baseRef, "timeline"); // ✅ events live in "timeline"
    }

    /* =========================
       PROFILE (root-level story data)
    ========================= */

    async getProfile() {
        const snapshot = await get(this.baseRef);
        return snapshot.exists() ? snapshot.val() : null;
    }

    async createProfile(profileData = {}) {
        return set(this.baseRef, profileData);
    }

    async updateProfile(updates) {
        return update(this.baseRef, updates);
    }

    async deleteProfile() {
        return remove(this.baseRef);
    }

    /* =========================
       NODES (characters, orgs, settings, etc.)
    ========================= */

    async getAllNodes() {
        const snapshot = await get(this.nodesRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getNode(entityId) {
        const nodes = await this.getAllNodes();
        for (const [key, node] of Object.entries(nodes)) {
            if (node.id === entityId) {
                return node;
            }
        }
        return null;
    }

    async upsertNode(entityId, data) {
        const nodes = await this.getAllNodes();
        let targetKey = null;

        for (const [key, node] of Object.entries(nodes)) {
            if (node.id === entityId) {
                targetKey = key;
                break;
            }
        }

        if (targetKey) {
            // Merge update
            const updated = { ...nodes[targetKey], ...data, id: entityId };
            await set(child(this.nodesRef, targetKey), updated);
            return updated;
        } else {
            // Insert new sequential key
            const nextKey = (Object.keys(nodes).length).toString();
            const newNode = { id: entityId, ...data };
            await set(child(this.nodesRef, nextKey), newNode);
            return newNode;
        }
    }

    async deleteNode(entityId) {
        const nodes = await this.getAllNodes();
        for (const [key, node] of Object.entries(nodes)) {
            if (node.id === entityId) {
                await remove(child(this.nodesRef, key));
                return true;
            }
        }
        return false;
    }

    async deleteNode(nodeId) {
        return remove(child(this.nodesRef, nodeId));
    }

    async filterNodesByGroup(groupType) {
        const allNodes = await this.getAllNodes();
        return Object.fromEntries(
            Object.entries(allNodes).filter(([_, node]) => node.group === groupType)
        );
    }

    async resolveNodeByName(name) {
        const allNodes = await this.getAllNodes();

        for (const [key, node] of Object.entries(allNodes)) {
            if (!node) continue;

            // Check primary label
            if (node.label?.toLowerCase() === name.toLowerCase()) {
                return node;
            }

            // Check aliases (comma-separated string, "None" if empty)
            if (node.aliases && node.aliases !== "None") {
                const aliasList = node.aliases.split(",").map(a => a.trim().toLowerCase());
                if (aliasList.includes(name.toLowerCase())) {
                    return node;
                }
            }
        }

        return null; // not found
    }

    async addAlias(entityId, alias) {
        const nodes = await this.getAllNodes();
        let targetKey = null;
        let targetNode = null;

        for (const [key, node] of Object.entries(nodes)) {
            if (node.id === entityId) {
                targetKey = key;
                targetNode = node;
                break;
            }
        }

        if (!targetKey) throw new Error(`Node with id ${entityId} not found`);

        let aliases = targetNode.aliases || "None";
        if (aliases === "None") {
            aliases = alias;
        } else {
            const aliasList = aliases.split(",").map(a => a.trim());
            if (!aliasList.includes(alias)) {
                aliasList.push(alias);
            }
            aliases = aliasList.join(", ");
        }

        const updated = { ...targetNode, aliases };
        await set(child(this.nodesRef, targetKey), updated);
        return updated;
    }


    /* =========================
       LINKS (connections between nodes)
    ========================= */

    async getAllLinks() {
        const snapshot = await get(this.linksRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    // Helper: return [normalizedsource, normalizedtarget] (sorted)
    _normalizePair(id1, id2) {
        return id1 < id2 ? [id1, id2] : [id2, id1];
    }

    // Helper: find the key for a normalized pair (returns null if not found)
    async _findLinkKeyForPair(n1, n2) {
        const links = await this.getAllLinks();
        for (const [key, link] of Object.entries(links)) {
            // tolerate both storage shapes (source/target or source/target if older)
            const a = link.source ?? link.source;
            const b = link.target ?? link.target;
            if (!a || !b) continue;
            const [ln1, ln2] = this._normalizePair(a, b);
            if (ln1 === n1 && ln2 === n2) {
                return key;
            }
        }
        return null;
    }

    // Get a link given two node IDs (returns null if none)
    async getLinkByIds(nodeA, nodeB) {
        if (!nodeA || !nodeB) return null;
        const [n1, n2] = this._normalizePair(nodeA, nodeB);
        const links = await this.getAllLinks();
        for (const [key, link] of Object.entries(links)) {
            const a = link.source ?? link.source;
            const b = link.target ?? link.target;
            if (!a || !b) continue;
            const [ln1, ln2] = this._normalizePair(a, b);
            if (ln1 === n1 && ln2 === n2) {
                // attach the key so caller can remove/update by key if needed
                return { key, ...link };
            }
        }
        return null;
    }

    // Upsert by node IDs (source/target normalized). Returns { action: "created"|"updated", key, data }
    async upsertLinkByIds(source, target, type, context = "", allowOverwrite = false) {
        if (!source || !target) throw new Error("Both source and target are required");
        if (!type) throw new Error("Link type is required");

        // Ensure both nodes exist
        const nodeA = await this.getNode(source);
        const nodeB = await this.getNode(target);
        if (!nodeA || !nodeB) {
            throw new Error(`Node(s) not found: ${source}, ${target}`);
        }

        const [n1, n2] = this._normalizePair(source, target);
        const links = await this.getAllLinks();

        // find existing link key (if any)
        let existingKey = null;
        for (const [key, link] of Object.entries(links)) {
            const a = link.source ?? link.source;
            const b = link.target ?? link.target;
            if (!a || !b) continue;
            const [ln1, ln2] = this._normalizePair(a, b);
            if (ln1 === n1 && ln2 === n2) {
                existingKey = key;
                break;
            }
        }

        const payload = {
            source: n1,
            target: n2,
            type,
            context: context ?? ""
        };

        if (existingKey) {
            if (!allowOverwrite) {
                throw new Error(`Link already exists between ${n1} and ${n2}`);
            }
            await set(child(this.linksRef, existingKey), payload);
            return { action: "updated", key: existingKey, data: payload };
        } else {
            // sequential key preserving behaviour (next index)
            const nextKey = Object.keys(links).length.toString();
            await set(child(this.linksRef, nextKey), payload);
            return { action: "created", key: nextKey, data: payload };
        }
    }

    // Upsert by user-provided node names (resolves label/aliases to IDs)
    async upsertLinkByNames(name1, name2, type, context = "", allowOverwrite = false) {
        const nodeA = await this.resolveNodeByName(name1);
        const nodeB = await this.resolveNodeByName(name2);
        if (!nodeA || !nodeB) {
            throw new Error(`Node(s) not found by name/alias: ${name1}, ${name2}`);
        }
        return this.upsertLinkByIds(nodeA.id, nodeB.id, type, context, allowOverwrite);
    }

    // Delete link by node IDs (handles both orders). Returns { action, key?, source, target }
    async deleteLinkByIds(source, target) {
        if (!source || !target) throw new Error("Both source and target are required");
        const [n1, n2] = this._normalizePair(source, target);
        const links = await this.getAllLinks();

        const deletedKeys = [];
        for (const [key, link] of Object.entries(links)) {
            const a = link.source ?? link.source;
            const b = link.target ?? link.target;
            if (!a || !b) continue;
            const [ln1, ln2] = this._normalizePair(a, b);
            if (ln1 === n1 && ln2 === n2) {
                await remove(child(this.linksRef, key));
                deletedKeys.push(key);
            }
        }

        if (deletedKeys.length) {
            return { action: "deleted", keys: deletedKeys, source: n1, target: n2 };
        } else {
            return { action: "not_found", source: n1, target: n2 };
        }
    }

    // Delete by names (resolves names to IDs then deletes)
    async deleteLinkByNames(name1, name2) {
        const nodeA = await this.resolveNodeByName(name1);
        const nodeB = await this.resolveNodeByName(name2);
        if (!nodeA || !nodeB) {
            throw new Error(`Node(s) not found by name/alias: ${name1}, ${name2}`);
        }
        return this.deleteLinkByIds(nodeA.id, nodeB.id);
    }

    // Filter links touching a node (checks both source & target)
    async filterLinksByNode(nodeId) {
        const allLinks = await this.getAllLinks();
        return Object.fromEntries(
            Object.entries(allLinks).filter(([_, link]) => {
                const a = link.source ?? link.source;
                const b = link.target ?? link.target;
                return a === nodeId || b === nodeId;
            })
        );
    }

    /* =========================
       EVENTS (timeline events)
    ========================= */

    async getAllEvents() {
        const snapshot = await get(this.eventsRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getEvent(eventId) {
        const snapshot = await get(child(this.eventsRef, eventId));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async setEvent(eventId, data) {
        return set(child(this.eventsRef, eventId), data);
    }

    async updateEvent(eventId, updates) {
        return update(child(this.eventsRef, eventId), updates);
    }

    async deleteEvent(eventId) {
        return remove(child(this.eventsRef, eventId));
    }

    async filterEventsByField(field, value) {
        const allEvents = await this.getAllEvents();
        return Object.fromEntries(
            Object.entries(allEvents).filter(([_, event]) => event[field] === value)
        );
    }

    /* =========================
       STORY TITLE & SUMMARY
    ========================= */

    async getStoryTitle() {
        const snapshot = await get(child(this.baseRef, "title"));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async updateStoryTitle(newTitle) {
        return set(child(this.baseRef, "title"), newTitle);
    }

    async getStorySummary() {
        const snapshot = await get(child(this.baseRef, "summary"));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async updateStorySummary(newSummary) {
        return set(child(this.baseRef, "summary"), newSummary);
    }

    /* =========================
       DIFF HELPERS
    ========================= */

    _diffObjects(oldData, newData) {
        if (!oldData && newData) return { created: newData };
        if (oldData && !newData) return { deleted: oldData };

        const diffs = {};
        for (const key of new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])) {
            if (oldData?.[key] !== newData?.[key]) {
                diffs[key] = { before: oldData?.[key], after: newData?.[key] };
            }
        }
        return diffs;
    }

    async diffNode(nodeId, newData) {
        const oldData = await this.getNode(nodeId);
        return this._diffObjects(oldData, newData);
    }

    async diffLink(linkId, newData) {
        const oldData = await this.getLink(linkId);
        if (!oldData) return { created: newData };
        const { sourceNode, targetNode, ...oldLinkData } = oldData;
        return this._diffObjects(oldLinkData, newData);
    }

    async diffEvent(eventId, newData) {
        const oldData = await this.getEvent(eventId);
        return this._diffObjects(oldData, newData);
    }
}

export default StoryProfileManager;

// module.exports = StoryProfileManager;
