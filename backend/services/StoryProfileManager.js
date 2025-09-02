import { database } from '../Firebase/firebase.js';
import { get, set, update, ref, onValue, push, child, remove } from '../Firebase/firebase.js';
import { useAuthValue } from '../Firebase/firebaseAdmin.js';


// const { database } = require("../../react-website/src/Firebase/firebase");
// const { get, set, update, ref, child, remove } = require("../../react-website/src/Firebase/firebase");
// const { useAuthValue } = require("../../react-website/src/Firebase/AuthContext");

class StoryProfileManager {
    constructor() {
        this.user = useAuthValue();
        if (!this.user) {
            throw new Error("User not authenticated");
        }

        // Base references
        this.baseRef = ref(database, `stories/${this.user.uid}/`);
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

    async getNode(nodeId) {
        const snapshot = await get(child(this.nodesRef, nodeId));
        return snapshot.exists() ? snapshot.val() : null;
    }

    async setNode(nodeId, data) {
        return set(child(this.nodesRef, nodeId), data);
    }

    async updateNode(nodeId, updates) {
        return update(child(this.nodesRef, nodeId), updates);
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

    /* =========================
       LINKS (connections between nodes)
    ========================= */

    async getAllLinks() {
        const snapshot = await get(this.linksRef);
        return snapshot.exists() ? snapshot.val() : {};
    }

    async getLink(linkId) {
        const snapshot = await get(child(this.linksRef, linkId));
        if (!snapshot.exists()) return null;

        const link = snapshot.val();
        const sourceNode = await this.getNode(link.source);
        const targetNode = await this.getNode(link.target);

        return { ...link, sourceNode, targetNode };
    }

    async setLink(linkId, data) {
        return set(child(this.linksRef, linkId), data);
    }

    async updateLink(linkId, updates) {
        return update(child(this.linksRef, linkId), updates);
    }

    async deleteLink(linkId) {
        return remove(child(this.linksRef, linkId));
    }

    async filterLinksByNode(nodeId) {
        const allLinks = await this.getAllLinks();
        return Object.fromEntries(
            Object.entries(allLinks).filter(([_, link]) =>
                link.source === nodeId || link.target === nodeId
            )
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
