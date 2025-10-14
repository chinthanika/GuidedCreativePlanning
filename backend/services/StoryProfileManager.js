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
        this.worldBuildingRef = child(this.baseRef, "worldBuilding");
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
            const existing = nodes[targetKey] || {};
            const merged = { ...existing, ...data, id: entityId };
            await set(child(this.nodesRef, targetKey), merged);
            return merged;
        } else {
            const nextKey = Object.keys(nodes).length.toString(); // 👈 safe numeric key
            const newNode = { id: entityId, ...data };
            await set(child(this.nodesRef, nextKey), newNode);
            return newNode;
        }
    }

    async deleteNode(entityId) {
        // Deletes by semantic node.id (not firebase key)
        const nodes = await this.getAllNodes();
        for (const [key, node] of Object.entries(nodes)) {
            if (node.id === entityId) {
                await remove(child(this.nodesRef, key));
                return { deleted: true, key, node };
            }
        }
        return { deleted: false, reason: `No node found with id '${entityId}'` };
    }

    async filterNodesByGroup(groupType) {
        const allNodes = await this.getAllNodes();
        return Object.fromEntries(
            Object.entries(allNodes).filter(([_, node]) => node.group === groupType)
        );
    }

    async resolveNodeByName(name) {
        const allNodes = await this.getAllNodes();
        const lowerName = name.toLowerCase().trim();

        // First pass: exact match on label or alias
        for (const [key, node] of Object.entries(allNodes)) {
            if (!node) continue;

            if (node.label?.toLowerCase() === lowerName) return node;

            // support aliases stored as array OR comma-string for backward compatibility
            const aliasesRaw = node.aliases;
            if (aliasesRaw) {
                let aliasList = [];
                if (Array.isArray(aliasesRaw)) {
                    aliasList = aliasesRaw.map(a => String(a).toLowerCase().trim());
                } else if (typeof aliasesRaw === "string") {
                    aliasList = aliasesRaw.split(",").map(a => a.trim().toLowerCase());
                }
                if (aliasList.includes(lowerName)) return node;
            }
        }

        // Second pass: fuzzy / substring match
        const candidates = [];
        for (const [key, node] of Object.entries(allNodes)) {
            if (!node) continue;

            if (node.label?.toLowerCase().includes(lowerName)) candidates.push(node);

            const aliasesRaw = node.aliases;
            if (aliasesRaw) {
                let aliasList = [];
                if (Array.isArray(aliasesRaw)) {
                    aliasList = aliasesRaw.map(a => String(a).toLowerCase().trim());
                } else if (typeof aliasesRaw === "string") {
                    aliasList = aliasesRaw.split(",").map(a => a.trim().toLowerCase());
                }
                for (const alias of aliasList) {
                    if (alias.includes(lowerName)) {
                        candidates.push(node);
                        break;
                    }
                }
            }
        }

        if (candidates.length === 1) return candidates[0];
        if (candidates.length > 1) return candidates[0]; // keep old behaviour (pick first) — optionally prompt later

        return null;
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

        const normalizedAlias = alias.trim();

        let aliases = targetNode.aliases || "None";
        if (aliases === "None") {
            aliases = normalizedAlias;
        } else {
            const aliasList = aliases.split(",").map(a => a.trim());
            if (!aliasList.includes(normalizedAlias)) {
                aliasList.push(normalizedAlias);
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

        // find existing link key (if any) regardless of type
        let existingKey = null;
        for (const [key, link] of Object.entries(links)) {
            const a = link.source;
            const b = link.target;
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
            // ✅ overwrite everything with new payload
            await set(child(this.linksRef, existingKey), payload);
            return { action: "updated", key: existingKey, data: payload };
        } else {
            const links = await this.getAllLinks();
            const nextKey = Object.keys(links).length.toString();
            await set(child(this.linksRef, nextKey), payload);
            return { action: "created", key: nextKey, data: payload };

        }
    }


    // Upsert by user-provided node names (resolves label/aliases to IDs)
    async upsertLinkByNames(name1, name2, type, context = "", allowOverwrite = false) {
        const nodeA = await this.resolveNodeByName(name1);
        const nodeB = await this.resolveNodeByName(name2);

        // Handle fuzzy suggestions
        if (!nodeA) throw new Error(`Node not found for name/alias: '${name1}'`);
        if (!nodeB) throw new Error(`Node not found for name/alias: '${name2}'`);

        // Prevent linking a node to itself if fuzzy matched the wrong one
        if (nodeA.id === nodeB.id) {
            throw new Error(`Cannot create link: '${name1}' and '${name2}' resolved to the same node '${nodeA.label}'`);
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
            return { deleted: true, keys: deletedKeys, source: n1, target: n2 };
        } else {
            return { deleted: false, reason: `No link found between '${n1}' and '${n2}'` };
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
    async filterLinksByNode(identifier) {
        // Try to resolve identifier as ID first
        const node = await this.getNode(identifier) || await this.resolveNodeByName(identifier);
        if (!node) {
            throw new Error(`Node not found: ${identifier}`);
        }

        const links = await this.getAllLinks();
        const filtered = {};

        for (const [linkId, link] of Object.entries(links)) {
            if (link.source === node.id || link.target === node.id) {
                filtered[linkId] = link;
            }
        }

        return filtered;
    }

    /* =========================
   EVENTS (timeline events)
========================= */

    async getAllEvents() {
        const snapshot = await get(this.eventsRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getEvent(firebaseKey) {
        const snapshot = await get(child(this.eventsRef, firebaseKey));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async resolveEventById(firebaseKey) {
        return this.getEvent(firebaseKey);
    }

    async resolveEventByName(title) {
        const all = await this.getAllEvents();
        for (const [key, event] of Object.entries(all)) {
            if (event?.title?.toLowerCase() === title.toLowerCase()) {
                return { firebaseKey: key, ...event };
            }
        }
        return null;
    }

    async upsertEvent(firebaseKey, data) {
        // ✅ Clean the data - remove any id/eventId fields
        const { id, eventId, firebaseKey: _, ...cleanData } = data;

        // ✅ Just save the clean data directly to the Firebase key
        await set(child(this.eventsRef, firebaseKey), cleanData);

        return { firebaseKey, ...cleanData };
    }

    async filterEventsByField(field, value) {
        const allEvents = await this.getAllEvents();
        return Object.fromEntries(
            Object.entries(allEvents).filter(([_, event]) => event[field] === value)
        );
    }

    async deleteEventById(firebaseKey) {
        const event = await this.getEvent(firebaseKey);
        if (!event) {
            return { deleted: false, reason: `No event found with key '${firebaseKey}'` };
        }

        await remove(child(this.eventsRef, firebaseKey));
        return { deleted: true, firebaseKey, event };
    }

    async deleteEventByTitle(title) {
        const allEvents = await this.getAllEvents();
        for (const [key, event] of Object.entries(allEvents)) {
            if (event?.title?.toLowerCase() === title.toLowerCase()) {
                await remove(child(this.eventsRef, key));
                return { deleted: true, firebaseKey: key, event };
            }
        }
        return { deleted: false, reason: `No event found with title '${title}'` };
    }
    /* =========================
       WORLD-BUILDING (hierarchical data)
    ========================= */

    async getAllWorldBuilding() {
        const snapshot = await get(this.worldBuildingRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getWorldBuildingCategory(category) {
        const snapshot = await get(child(this.worldBuildingRef, category));
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getWorldBuildingItem(category, itemId) {
        const items = await this.getWorldBuildingCategory(category);
        for (const [key, item] of Object.entries(items)) {
            if (item?.id === itemId) {
                return { key, ...item };
            }
        }
        return null;
    }

    async resolveWorldBuildingItemByName(category, name) {
        const items = await this.getWorldBuildingCategory(category);
        const lowerName = name.toLowerCase().trim();

        for (const [key, item] of Object.entries(items)) {
            if (item?.name?.toLowerCase() === lowerName) {
                return { key, ...item };
            }
        }

        return null;
    }

    async upsertWorldBuildingItem(category, itemId, data) {
        const items = await this.getWorldBuildingCategory(category);
        let targetKey = null;

        for (const [key, item] of Object.entries(items)) {
            if (item?.id === itemId) {
                targetKey = key;
                break;
            }
        }

        const payload = { id: itemId, ...data };

        if (targetKey) {
            const existing = items[targetKey] || {};
            const merged = { ...existing, ...payload };
            await set(child(this.worldBuildingRef, `${category}/${targetKey}`), merged);
            return merged;
        } else {
            const nextKey = Object.keys(items).length.toString();
            await set(child(this.worldBuildingRef, `${category}/${nextKey}`), payload);
            return payload;
        }
    }

    async deleteWorldBuildingItem(category, itemId) {
        const items = await this.getWorldBuildingCategory(category);
        for (const [key, item] of Object.entries(items)) {
            if (item?.id === itemId) {
                await remove(child(this.worldBuildingRef, `${category}/${key}`));
                return { deleted: true, key, item };
            }
        }
        return { deleted: false, reason: `No item found with id '${itemId}' in category '${category}'` };
    }

    async filterWorldBuildingByParent(category, parentId) {
        const items = await this.getWorldBuildingCategory(category);
        return Object.fromEntries(
            Object.entries(items).filter(([_, item]) => item?.parentId === parentId)
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

    async diffWorldBuildingItem(category, itemId, newData) {
        const oldData = await this.getWorldBuildingItem(category, itemId);
        return this._diffObjects(oldData?.key ? { ...oldData, key: undefined } : null, newData);
    }

    async cleanupEventFields() {
        const events = await this.getAllEvents();
        const cleaned = [];
        const skipped = [];

        for (const [firebaseKey, event] of Object.entries(events)) {
            if (!event) continue;

            const hasRedundantFields = event.id !== undefined || event.eventId !== undefined;

            if (hasRedundantFields) {
                // Remove id and eventId fields
                const { id, eventId, ...cleanEvent } = event;

                // Save cleaned version
                await set(child(this.eventsRef, firebaseKey), cleanEvent);

                cleaned.push({
                    firebaseKey,
                    removed: { id, eventId },
                    kept: Object.keys(cleanEvent)
                });

                console.log(`Cleaned event ${firebaseKey}: removed id="${id}", eventId="${eventId}"`);
            } else {
                skipped.push(firebaseKey);
            }
        }

        return {
            totalEvents: Object.keys(events).length,
            cleanedCount: cleaned.length,
            skippedCount: skipped.length,
            cleaned,
            skipped
        };
    }
}

export default StoryProfileManager;

// module.exports = StoryProfileManager;
