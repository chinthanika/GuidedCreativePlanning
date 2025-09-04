// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmationPipeline from "../services/ConfirmationPipeline.js";

const app = express();
app.use(bodyParser.json());


/**
 * Get all nodes (with optional group filter)
 */
app.get("/api/nodes", async (req, res) => {
  try {
    const { userId, group } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let nodes = await pipeline.manager.getAllNodes();

    // Optional filter by group
    if (group) {
      const allowedGroups = ["Person", "Organization", "Location", "Uncategorized"];
      if (!allowedGroups.includes(group)) {
        return res.status(400).json({ error: `Invalid group. Must be one of: ${allowedGroups.join(", ")}` });
      }
      nodes = Object.fromEntries(
        Object.entries(nodes).filter(([_, node]) => node.group === group)
      );
    }

    res.status(200).json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get node by ID or name
 */
app.get("/api/nodes/:identifier", async (req, res) => {
  try {
    const { userId } = req.query;
    const { identifier } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let node = await pipeline.manager.getNode(identifier);
    if (!node) node = await pipeline.manager.resolveNodeByName(identifier);

    if (!node) return res.status(404).json({ error: "Node not found" });
    res.status(200).json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get all links
 */
app.get("/api/links", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const links = await pipeline.manager.getAllLinks();
    res.status(200).json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get links for a specific node (by ID or name)
 */
app.get("/api/links/:identifier", async (req, res) => {
  try {
    const { userId } = req.query;
    const { identifier } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const links = await pipeline.manager.filterLinksByNode(identifier);

    res.status(200).json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get all events
 */
app.get("/api/events", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const events = await pipeline.manager.getAllEvents();
    res.status(200).json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get event by ID or title
 */
app.get("/api/events/:identifier", async (req, res) => {
  try {
    const { userId } = req.query;
    const { identifier } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let event = await pipeline.manager.resolveEventById(identifier);
    if (!event) event = await pipeline.manager.resolveEventByName(identifier);

    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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
