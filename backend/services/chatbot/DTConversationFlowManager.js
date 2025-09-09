import { database } from "../Firebase/firebaseAdmin.js";
import { get, set, update, child, ref, push } from "../Firebase/firebase.js";

import { primary, follow_up, meta_transitions } from "question-banks/question_bank.json" assert { type: "json" };


export default class DTConversationFlowManager {
    constructor({ uId, sessionID }) {
        if (!userId || !sessionID) throw new Error("userId and sessionID are required");
        this.userId = userId;
        this.sessionID = sessionID;
        this.sessionRef = ref(database, `chatSessions/${uid}/${sessionID}`);
        this.metadataRef = ref(database, `chatSessions/${uid}/${sessionID}/metadata`);
        this.messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`)
    }

    // Static helper to create a new session
    static async createSession(uid) {
        const sessionRef = ref(database, `chatSessions/${uid}`);
        const newSessionRef = push(sessionRef);
        const sessionId = newSessionRef.key;

        const initialMetadata = {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            title: "New Chat",
            currentCategory: null,
            currentAngle: null,
            asked: [],
            depth: 0
        };

        await set(newSessionRef, {
            metadata: initialMetadata,
            messages: {}
        });

        return new DTConversationFlowManager({ uid, sessionID });
    }

    // Get session metadata
    async getMetadata() {
        const snapshot = await get(this.metadataRef);
        return snapshot.exists() ? snapshot.val() : null;
    }

    // Update session metadata
    async updateMetadata(updates) {
        updates.updatedAt = Date.now();
        await update(this.metadataRef, updates);
    }

    // Save a message (bot or user)
    async saveMessage(role, content) {
        const newMessageRef = push(this.messagesRef);
        await set(newMessageRef, {
            role,
            content,
            timestamp: Date.now()
        });
    }

    // Pick the next question
    async nextQuestion({ action, category, angle }) {
        const metadata = await this.getMetadata();

        let nextQ = null;

        switch (action) {
            case "new_category":
                if (!category) throw Error("category required for new_category");
                nextQ = this.pickFromCategory(category, "primary");
                await this.updateMetadata({ currentCategory: category, currentAngle: null })
                break;

            case "new_angle":
                if (!angle) throw new Error("angle required for new_angle");
                if (!metadata.currentCategory) throw new Error("no category in context");
                nextQ = this._pickFromCategory(metadata.currentCategory, angle);
                await this.updateMetadata({ currentAngle: angle });
                break;

            case "meta_transition":
                if (!angle) throw new Error("angle required for meta_transition");
                nextQ = this._pickMetaTransition(angle);
                await this.updateMetadata({ currentAngle: angle });
                break;

            case "follow_up":
                if (!metadata.currentCategory || !metadata.currentAngle) throw new Error("context missing");
                nextQ = this._pickFollowUp(metadata.currentCategory, metadata.currentAngle);
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        // Track asked questions
        const asked = metadata.asked || [];
        asked.push({ action, category, angle, q: nextQ.text });
        await this.updateMetadata({ asked, depth: (metadata.depth || 0) + 1 });

        return nextQ
    }

    /* =========================
        SELECTION HELPERS
    ========================= */
    _pickFromCategory(category, angle) {
        const questions = primary[category]?.questions?.[angle] || [];
        if (questions.length === 0) throw new Error(`No questions for ${category}:${angle}`);
        return questions[Math.floor(Math.random() * questions.length)];
    }

    _pickFollowUp(category, angle) {
        const questions = follow_up[category]?.[angle] || [];
        if (questions.length === 0) throw new Error(`No follow-ups for ${category}:${angle}`);
        return questions[Math.floor(Math.random() * questions.length)];
    }

    _pickMetaTransition(angle) {
        const transitions = meta_transitions[angle] || [];
        if (transitions.length === 0) throw new Error(`No meta transitions for ${angle}`);
        return transitions[Math.floor(Math.random() * transitions.length)];
    }
}