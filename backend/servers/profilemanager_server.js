// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmationPipeline from "../services/ConfirmationPipeline.js";
import cors from "cors";

const app = express();

app.use(cors({ origin: "http://localhost:3000" })); // allow React dev server
app.use(bodyParser.json());
/**
 * Get all nodes (with optional group filter)
 */
app.get("/api/nodes", async (req, res) => {
  console.log("Received /api/nodes request with query:", req.query);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let nodes = await pipeline.manager.getAllNodes();
    console.log("Initial nodes count:", Object.keys(nodes).length);

    // Build filters from query
    let parsedFilters = {};
    if (req.query.filters) {
      try {
        parsedFilters = JSON.parse(req.query.filters);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in filters" });
      }
    } else {
      // fallback: treat any extra query params (like label) as filters
      parsedFilters = { ...req.query };
      delete parsedFilters.userId;
    }
    console.log("Using parsed filters:", parsedFilters);

    // Filter by label if provided
    if (parsedFilters.label) {
      const wanted = parsedFilters.label;
      // support querying with array or single string
      const wantedList = Array.isArray(wanted) ? wanted.map(String) : [String(wanted)];
      nodes = Object.fromEntries(
        Object.entries(nodes).filter(([_, node]) => {
          if (!node) return false;
          for (const w of wantedList) {
            const lowerW = w.toLowerCase().trim();
            if (node.label?.toLowerCase() === lowerW) return true;
            // support aliases as array or comma string
            const aliases = node.aliases;
            if (aliases) {
              if (Array.isArray(aliases)) {
                if (aliases.map(a => String(a).toLowerCase()).includes(lowerW)) return true;
              } else if (typeof aliases === "string") {
                if (aliases.toLowerCase().split(",").map(a => a.trim()).includes(lowerW)) return true;
              }
            }
          }
          return false;
        })
      );
      console.log("Filtered nodes count:", Object.keys(nodes).length);
    }

    console.log("Returning nodes:", Object.keys(nodes));
    res.status(200).json(nodes);
  } catch (err) {
    console.error("Error in /api/nodes:", err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * Get node by ID or name
 */
app.get("/api/nodes/:identifier", async (req, res) => {
  console.log("Received /api/nodes/:identifier request with params:", req.params, "and query:", req.query);
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
  console.log("Received /api/links request with query:", req.query);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let links = await pipeline.manager.getAllLinks();
    console.log("Initial links count:", Object.keys(links).length);

    // Build filters from query
    let parsedFilters = {};
    if (req.query.filters) {
      const validFilters = ["participants", "node1", "node2", "nodes"];
      for (const key of req.query.filters) {
        if (!validFilters.includes(key)) {
          return res.status(400).json({
            error: `Invalid filter: "${key}". Use one of: participants, node1, node2.`
          });
        }
        else {
          if (key === "nodes") {
            req.query.participants = req.query.nodes;
            delete req.query.nodes;
          }
        }
      }

      try {
        parsedFilters = JSON.parse(req.query.filters);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in filters" });
      }
    } else {
      parsedFilters = { ...req.query };
      delete parsedFilters.userId;
    }
    console.log("Using parsed filters:", parsedFilters);

    if (parsedFilters.node1 && parsedFilters.node2 && parsedFilters.node1 === parsedFilters.node2) {
      // collapse to just one
      parsedFilters = { node1: parsedFilters.node1 };
    }

    // Prefer using 'participants' param for user-friendly filtering (accepts name or id, single or array)
    if (parsedFilters.participants) {
      const parts = Array.isArray(parsedFilters.participants) ? parsedFilters.participants : [parsedFilters.participants];

      // For first participant, get its links set; for subsequent participants, intersect
      let resultSet = null;
      for (const p of parts) {
        // use manager.filterLinksByNode which resolves name->id and checks structured source/target
        try {
          const pLinks = await pipeline.manager.filterLinksByNode(p);
          if (resultSet === null) {
            resultSet = { ...pLinks };
          } else {
            // intersect keys
            const intersect = {};
            for (const key of Object.keys(resultSet)) {
              if (key in pLinks) intersect[key] = resultSet[key];
            }
            resultSet = intersect;
          }
        } catch (e) {
          // if node not found, treat as empty set
          resultSet = {};
        }
      }
      links = resultSet || {};
      console.log("Filtered links count (participants):", Object.keys(links).length);
    } else {
      // fallback to node1/node2 by id (still supported)
      if (parsedFilters.node1) {
        const n1 = await pipeline.manager.getNode(parsedFilters.node1)
          || await pipeline.manager.resolveNodeByName(parsedFilters.node1);
        if (!n1) return res.status(400).json({ error: `Node not found: ${parsedFilters.node1}` });

        links = Object.fromEntries(
          Object.entries(links).filter(([_, link]) => link.source === n1.id || link.target === n1.id)
        );
        console.log("Filtered links count (node1):", Object.keys(links).length);
      }

      if (parsedFilters.node2) {
        const n2 = await pipeline.manager.getNode(parsedFilters.node2)
          || await pipeline.manager.resolveNodeByName(parsedFilters.node2);
        if (!n2) return res.status(400).json({ error: `Node not found: ${parsedFilters.node2}` });

        links = Object.fromEntries(
          Object.entries(links).filter(([_, link]) => link.source === n2.id || link.target === n2.id)
        );
        console.log("Filtered links count (node2):", Object.keys(links).length);
      }
    }

    // Replace IDs with resolved node objects
    const nodes = await pipeline.manager.getAllNodes();
    const enrichedLinks = {};

    for (const [linkId, link] of Object.entries(links)) {
      const sourceNode = nodes[link.source] || await pipeline.manager.getNode(link.source);
      const targetNode = nodes[link.target] || await pipeline.manager.getNode(link.target);
      console.log(`Enriching link ${linkId}: source ${link.source} -> ${sourceNode ? sourceNode.label : "NOT FOUND"}, target ${link.target} -> ${targetNode ? targetNode.label : "NOT FOUND"}`);
      console.log(`Source node details:`, sourceNode);
      console.log(`Target node details:`, targetNode);
      enrichedLinks[linkId] = {
        ...link,
        source: sourceNode ? { id: sourceNode.id, label: sourceNode.label, group: sourceNode.group, attributes: sourceNode.attributes, aliases: sourceNode.aliases } : link.source,
        target: targetNode ? { id: targetNode.id, label: targetNode.label, group: targetNode.group, attributes: targetNode.attributes, aliases: targetNode.aliases } : link.target,
      };
    }

    console.log("Returning links:", Object.keys(enrichedLinks));
    res.status(200).json(enrichedLinks);
  } catch (err) {
    console.error("Error in /api/links:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get links for a specific node (by ID or name)
 */
app.get("/api/links/:identifier", async (req, res) => {
  console.log("Received /api/links/:identifier request with params:", req.params, "and query:", req.query);
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
  console.log("Received /api/events request with query:", req.query);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let events = await pipeline.manager.getAllEvents();
    console.log("Initial events count:", Object.keys(events).length);

    // Build filters from query
    let parsedFilters = {};
    if (req.query.filters) {
      try {
        parsedFilters = JSON.parse(req.query.filters);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in filters" });
      }
    } else {
      parsedFilters = { ...req.query };
      delete parsedFilters.userId;
    }
    console.log("Using parsed filters:", parsedFilters);

    if (parsedFilters.description) {
      events = Object.fromEntries(
        Object.entries(events).filter(([_, e]) => e.description?.includes(parsedFilters.description))
      );
      console.log("Filtered events count:", Object.keys(events).length);
    }

    console.log("Returning events:", Object.keys(events));
    res.status(200).json(events);
  } catch (err) {
    console.error("Error in /api/events:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get event by ID or title
 */
app.get("/api/events/:identifier", async (req, res) => {
  console.log("Received /api/events/:identifier request with params:", req.params, "and query:", req.query);
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
  console.log("Received /api/stage-change request with body:", req.body);
  try {
    const { userId, entityType, entityId, newData } = req.body;
    if (!userId || !entityType || !newData) {
      return res.status(400).json({ error: "userId, entityType, and newData are required" });
    }

    if (entityType === "link") {
      if (!newData.node1 || !newData.node2 || !newData.type) {
        return res.status(400).json({
          error: "Links must include node1, node2, and type"
        });
      }
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const staged = await pipeline.stageChange(entityType, entityId, newData);

    res.status(200).json(staged); // ✅ already includes status, editable, nextStep
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



/**
 * Confirm a change
 */
app.post("/api/confirm-change", async (req, res) => {
  console.log("Received /api/confirm-change request with body:", req.body);
  try {
    const { userId, changeKey, overwrite } = req.body;
    console.log("Request body:", userId, changeKey);
    if (!userId || !changeKey) {
      return res.status(400).json({ error: "userId and changeKey are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    try {
      const confirmed = await pipeline.confirm(changeKey, { overwrite: !!overwrite });
      console.log("Change confirmed:", confirmed);
      res.status(200).json(confirmed);
    } catch (err) {
      if (err.code === "LINK_EXISTS") {
        console.warn("Conflict error during confirm:", err);
        // indicate to frontend that overwrite is needed
        return res.status(409).json({
          error: err.message,
          duplicate: err.duplicate,
          requiresOverwrite: true
        });
      }
      console.error("Error during confirm:", err);
      res.status(400).json({ error: err.message });
      // re-
      throw err;
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


/**
 * Deny a change
 */
app.post("/api/deny-change", async (req, res) => {
  console.log("Received /api/deny-change request with body:", req.body);
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
  console.log("Received /api/pending-changes request with query:", req.query);
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

// --- SSE Support ---
const clients = [];

app.get("/api/pending-changes/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    const i = clients.indexOf(res);
    if (i !== -1) clients.splice(i, 1);
  });
});

function broadcastPendingUpdate(userId) {
  // Each connected client gets notified
  for (const client of clients) {
    client.write(`event: pendingUpdate\n`);
    client.write(`data: ${JSON.stringify({ userId })}\n\n`);
  }
}


const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Profile Manager running on port ${PORT}`);
});
