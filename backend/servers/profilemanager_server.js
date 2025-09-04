// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmationPipeline from "../services/ConfirmationPipeline.js";

const app = express();
app.use(bodyParser.json());

/**
 * Stage a change
 */
app.post("/api/stage-change", async (req, res) => {
  try {
    const { userId, entityType, entityId, newData } = req.body;
    if (!userId || !entityType || !newData) {
      return res.status(400).json({ error: "userId, entityType, and newData are required" });
    }

    // For links, require source, target, and type
    if (entityType === "link") {
      if (!newData.node1 || !newData.node2 || !newData.type) {
        return res.status(400).json({
          error: "Links must include node1, node2, and type"
        });
      }
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const staged = await pipeline.stageChange(entityType, entityId, newData);
    res.status(200).json(staged);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


/**
 * Confirm a change
 */
app.post("/api/confirm-change", async (req, res) => {
  try {
    const { userId, changeKey } = req.body;
    if (!userId || !changeKey) {
      return res.status(400).json({ error: "userId and changeKey are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Fetch pending change first
    const pending = await pipeline.listPending();
    const change = pending?.[changeKey];
    if (!change) {
      return res.status(404).json({ error: "Pending change not found" });
    }

    // 🚨 Special handling for links
    if (change.entityType === "link") {
      const allLinks = await pipeline.manager.getAllLinks();
      const dup = Object.values(allLinks).find(
        l =>
          ((l.source === change.newData.source && l.target === change.newData.target) ||
           (l.source === change.newData.target && l.target === change.newData.source)) &&
          l.type === change.newData.type
      );

      if (dup) {
        return res.status(409).json({
          error: "Link already exists between these nodes",
          duplicate: dup
        });
      }
    }

    // Otherwise confirm normally
    const confirmed = await pipeline.confirm(changeKey);
    res.status(200).json(confirmed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


/**
 * Deny a change
 */
app.post("/api/deny-change", async (req, res) => {
  try {
    const { userId, changeKey } = req.body;
    if (!userId || !changeKey) {
      return res.status(400).json({ error: "userId and changeKey are required" });
    }


    const pipeline = new ConfirmationPipeline({ uid: userId });
    const denied = await pipeline.deny(changeKey);
    res.status(200).json(denied);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Optional: List pending changes
 */
app.get("/api/pending-changes", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const pending = await pipeline.listPending();
    res.status(200).json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Profile Manager running on port ${PORT}`);
});
