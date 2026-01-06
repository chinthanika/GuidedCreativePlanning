// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmationPipeline from "../services/ConfirmationPipeline.js";
import cors from "cors";

import { child, push, remove, set, get, update } from "firebase/database";

import logger from "./logger.js";
import { requestLogger } from "./loggerMiddleware.js";

import pmCache from "../servers/utils/ProfileManagerCache.js";

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://https://guided-creative-planning-v11b.vercel.app",
  "https://https://guided-creative-planning-v11b.vercel.app/",
  "https://guided-creative-planning-v11b-git-main-chinthanikas-projects.vercel.app",
  "https://guided-creative-planning-v11b-git-main-chinthanikas-projects.vercel.app/"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(express.json());
app.use(requestLogger);

function logTimingStart(route) {
  const start = Date.now();
  const startTime = new Date().toISOString();
  logger.info(`[START] ${route} at ${startTime}`);
  return () => {
    const end = Date.now();
    const endTime = new Date().toISOString();
    logger.info(`[END] ${route} at ${endTime} (duration: ${end - start}ms)`);
  };
}

/**
 * Get all nodes (with optional group filter)
 */
app.get("/api/nodes", async (req, res) => {
  const endLog = logTimingStart("/api/nodes");

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let nodes = await pipeline.manager.getAllNodes();
    logger.info(`[DATA] Nodes fetched: ${Object.keys(nodes).length}`);

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
    logger.info(`[DATA] Using parsed filters: ${JSON.stringify(parsedFilters)}`);

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
      logger.info(`[DATA] Filtered nodes count (label): ${Object.keys(nodes).length}`);
    }

    logger.info(`[DATA] Returning nodes: ${Object.keys(nodes)}`);
    res.status(200).json(nodes);
  } catch (err) {
    logger.error(`[ERROR] /api/nodes: ${err}`);

    res.status(500).json({ error: err.message });
  }
});


/**
 * Get node by ID or name
 */
app.get("/api/nodes/:identifier", async (req, res) => {
  logger.info(`[REQUEST] /api/nodes/:identifier request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);
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
  logger.info(`[REQUEST] /api/links request with query: ${JSON.stringify(req.query)}`);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let links = await pipeline.manager.getAllLinks();
    logger.info(`[DATA] Initial links count: ${Object.keys(links).length}`);

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
    logger.info(`[DATA] Using parsed filters: ${JSON.stringify(parsedFilters)}`);

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
      logger.info(`[DATA] Filtered links count (participants): ${Object.keys(links).length}`);
    }
    else {
      // fallback to node1/node2 by id (still supported)
      if (parsedFilters.node1) {
        const n1 = await pipeline.manager.getNode(parsedFilters.node1)
          || await pipeline.manager.resolveNodeByName(parsedFilters.node1);
        if (!n1) return res.status(400).json({ error: `Node not found: ${parsedFilters.node1}` });

        links = Object.fromEntries(
          Object.entries(links).filter(([_, link]) => link.source === n1.id || link.target === n1.id)
        );
        logger.info(`[DATA] Filtered links count (node1): ${Object.keys(links).length}`);

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
      logger.info(`[DATA] Enriching link ${linkId}: source ${link.source} -> ${sourceNode ? sourceNode.label : "NOT FOUND"}, target ${link.target} -> ${targetNode ? targetNode.label : "NOT FOUND"}`);
      logger.debug(`[DATA] Source node details: ${JSON.stringify(sourceNode)}`);
      logger.debug(`[DATA] Target node details: ${JSON.stringify(targetNode)}`);
      enrichedLinks[linkId] = {
        ...link,
        source: sourceNode ? { id: sourceNode.id, label: sourceNode.label, group: sourceNode.group, attributes: sourceNode.attributes, aliases: sourceNode.aliases } : link.source,
        target: targetNode ? { id: targetNode.id, label: targetNode.label, group: targetNode.group, attributes: targetNode.attributes, aliases: targetNode.aliases } : link.target,
      };
    }

    logger.info(`[DATA] Returning links: ${Object.keys(enrichedLinks)}`);
    res.status(200).json(enrichedLinks);
  } catch (err) {
    logger.error(`[ERROR] Error in /api/links: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get links for a specific node (by ID or name)
 */
app.get("/api/links/:identifier", async (req, res) => {
  logger.info(`[REQUEST] /api/links/:identifier request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);
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
  logger.info
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let events = await pipeline.manager.getAllEvents();
    logger.info(`[DATA] Events fetched: ${Object.keys(events).length}`);
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
    logger.info(`[DATA] Using parsed filters: ${JSON.stringify(parsedFilters)}`);

    if (parsedFilters.description) {
      events = Object.fromEntries(
        Object.entries(events).filter(([_, e]) => e.description?.includes(parsedFilters.description))
      );
      logger.info(`[DATA] Filtered events count (description): ${Object.keys(events).length}`);
    }

    logger.info(`[DATA] Returning events: ${Object.keys(events)}`);
    res.status(200).json(events);
  } catch (err) {
    logger.error(`[ERROR] /api/events: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get event by ID or title
 */
app.get("/api/events/:identifier", async (req, res) => {
  logger.info(`[REQUEST] /api/events/:identifier request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);
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

app.get("/api/world/metadata", async (req, res) => {
  const endLog = logTimingStart("/api/world/metadata");

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let metadata = await getCachedWorldMetadata(userId, pipeline);

    if (!metadata) {
      // Initialize if doesn't exist
      const worldItemsRef = child(pipeline.manager.baseRef, "world/items");
      const rootRef = push(worldItemsRef);

      await set(rootRef, {
        name: "My World",
        type: "World",
        description: "The root of your fictional world",
        parentId: null,
        templateId: null,
        customFields: {}
      });

      metadata = {
        name: "My World",
        description: "The root of your fictional world",
        rootId: rootRef.key
      };

      const metadataRef = child(pipeline.manager.baseRef, "world/metadata");
      await set(metadataRef, metadata);

      // Cache the new metadata
      pmCache.set(userId, 'world_metadata', metadata);
    }

    logger.info(`[DATA] World metadata: ${metadata.name}`);
    res.status(200).json(metadata);
    endLog();
  } catch (err) {
    logger.error(`[ERROR] /api/world/metadata: ${err}`);
    res.status(500).json({ error: err.message });
    endLog();
  }
});

// 2. NEW: Update world metadata
app.post("/api/world/metadata", async (req, res) => {
  logger.info(`[REQUEST] POST /api/world/metadata with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, name, description } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!name) return res.status(400).json({ error: "name is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const metadataRef = child(pipeline.manager.baseRef, "world/metadata");

    const updates = { name };
    if (description !== undefined) updates.description = description;

    await update(metadataRef, updates);

    // Also update root item if it exists
    const snapshot = await get(metadataRef);
    if (snapshot.exists()) {
      const metadata = snapshot.val();
      if (metadata.rootId) {
        const rootRef = child(pipeline.manager.baseRef, `world/items/${metadata.rootId}`);
        await update(rootRef, updates);
      }
    }
    pmCache.invalidate(userId, 'world_metadata');
    pmCache.invalidate(userId, 'world_items');
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] Updated world metadata: ${name}`);
    res.status(200).json({ success: true, ...updates });
  } catch (err) {
    logger.error(`[ERROR] POST /api/world/metadata: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/world/items", async (req, res) => {
  const endLog = logTimingStart("/api/world/items");

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const items = await getCachedWorldItems(userId, pipeline);

    logger.info(`[DATA] Fetched ${Object.keys(items).length} world items`);
    res.status(200).json(items);
    endLog();
  } catch (err) {
    logger.error(`[ERROR] /api/world/items: ${err}`);
    res.status(500).json({ error: err.message });
    endLog();
  }
});

app.get("/api/world/items/:itemId", async (req, res) => {
  logger.info(`[REQUEST] /api/world/items/:itemId with params: ${JSON.stringify(req.params)}`);

  try {
    const { userId } = req.query;
    const { itemId } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const itemRef = child(pipeline.manager.baseRef, `world/items/${itemId}`);
    const snapshot = await get(itemRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ firebaseKey: itemId, ...snapshot.val() });
  } catch (err) {
    logger.error(`[ERROR] /api/world/items/:itemId: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

// 5. NEW: Create item
app.post("/api/world/items", async (req, res) => {
  logger.info(`[REQUEST] POST /api/world/items with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, data } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!data) return res.status(400).json({ error: "data is required" });
    if (!data.name || !data.type || !data.description) {
      return res.status(400).json({ error: "name, type, and description are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Validate parentId exists if provided
    if (data.parentId) {
      const parentRef = child(pipeline.manager.baseRef, `world/items/${data.parentId}`);
      const parentSnapshot = await get(parentRef);
      if (!parentSnapshot.exists()) {
        return res.status(400).json({ error: `Parent item not found: ${data.parentId}` });
      }
    }

    const itemsRef = child(pipeline.manager.baseRef, "world/items");
    const newItemRef = push(itemsRef);

    await set(newItemRef, data);

    pmCache.invalidate(userId, 'world_items');
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] Created world item ${newItemRef.key}`);
    res.status(200).json({
      success: true,
      firebaseKey: newItemRef.key,
      data
    });
  } catch (err) {
    logger.error(`[ERROR] POST /api/world/items: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

// 6. NEW: Update item
app.put("/api/world/items/:itemId", async (req, res) => {
  logger.info(`[REQUEST] PUT /api/world/items/:itemId with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, data } = req.body;
    const { itemId } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!data) return res.status(400).json({ error: "data is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const itemRef = child(pipeline.manager.baseRef, `world/items/${itemId}`);

    // Check item exists
    const snapshot = await get(itemRef);
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Validate parentId if being updated
    if (data.parentId && data.parentId !== itemId) {
      const parentRef = child(pipeline.manager.baseRef, `world/items/${data.parentId}`);
      const parentSnapshot = await get(parentRef);
      if (!parentSnapshot.exists()) {
        return res.status(400).json({ error: `Parent item not found: ${data.parentId}` });
      }
    }

    await set(itemRef, data);

    pmCache.invalidate(userId, 'world_items');
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] Updated world item ${itemId}`);
    res.status(200).json({ success: true, firebaseKey: itemId, data });
  } catch (err) {
    logger.error(`[ERROR] PUT /api/world/items/:itemId: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

// 7. NEW: Delete item (cascade to children)
app.delete("/api/world/items/:itemId", async (req, res) => {
  logger.info(`[REQUEST] DELETE /api/world/items/:itemId`);

  try {
    const { userId } = req.query;
    const { itemId } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Get all items to find children
    const itemsRef = child(pipeline.manager.baseRef, "world/items");
    const snapshot = await get(itemsRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "No items found" });
    }

    const allItems = snapshot.val();

    if (!allItems[itemId]) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Recursive delete function
    const deleteRecursive = async (currentId) => {
      // Find and delete all children
      for (const [key, item] of Object.entries(allItems)) {
        if (item?.parentId === currentId) {
          await deleteRecursive(key);
        }
      }

      // Delete current item
      const itemRef = child(pipeline.manager.baseRef, `world/items/${currentId}`);
      await remove(itemRef);
      logger.info(`[DATA] Deleted world item ${currentId}`);
    };

    await deleteRecursive(itemId);

    pmCache.invalidate(userId, 'world_items');
    pmCache.invalidateAll(userId);

    res.status(200).json({ success: true, deleted: itemId });
  } catch (err) {
    logger.error(`[ERROR] DELETE /api/world/items/:itemId: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/world/templates", async (req, res) => {
  const endLog = logTimingStart("/api/world/templates");

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const templates = await getCachedWorldTemplates(userId, pipeline);

    logger.info(`[DATA] Fetched ${Object.keys(templates).length} templates`);
    res.status(200).json(templates);
    endLog();
  } catch (err) {
    logger.error(`[ERROR] /api/world/templates: ${err}`);
    res.status(500).json({ error: err.message });
    endLog();
  }
});


// Create template
app.post("/api/world/templates", async (req, res) => {
  logger.info(`[REQUEST] POST /api/world/templates with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, data } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!data) return res.status(400).json({ error: "data is required" });
    if (!data.name || !data.fields) {
      return res.status(400).json({ error: "name and fields are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const templatesRef = child(pipeline.manager.baseRef, "world/templates");
    const newTemplateRef = push(templatesRef);

    await set(newTemplateRef, data);

    pmCache.invalidate(userId, 'world_templates');

    logger.info(`[DATA] Created template ${newTemplateRef.key}`);
    res.status(200).json({
      success: true,
      firebaseKey: newTemplateRef.key,
      data
    });
  } catch (err) {
    logger.error(`[ERROR] POST /api/world/templates: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Direct event update (no staging/confirmation required)
 * Used for user-driven changes like reordering
 * 
 * POST /api/events/update
 * Body: {
 *   userId: string,
 *   eventId: string,
 *   updates: { order, title, description, stage, ... }
 * }
 */
app.post("/api/events/update", async (req, res) => {
  logger.info(`[REQUEST] /api/events/update with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, eventId, updates } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!eventId) {
      return res.status(400).json({ error: "eventId (Firebase key) is required" });
    }
    if (!updates) {
      return res.status(400).json({ error: "updates object is required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Get the current event
    const currentEvent = await pipeline.manager.getEvent(eventId);

    if (!currentEvent) {
      // Creating new event
      const newEvent = { ...updates };
      const result = await pipeline.manager.upsertEvent(eventId, newEvent);
      pmCache.invalidateAll(userId);
      return res.status(200).json({
        success: true,
        created: true,
        firebaseKey: eventId,
        saved: result
      });
    }

    // Validate updates (same as before)
    if (updates.order !== undefined) {
      const allEvents = await pipeline.manager.getAllEvents();
      const eventCount = Object.keys(allEvents).length;
      if (!Number.isInteger(updates.order) || updates.order < 0 || updates.order >= eventCount) {
        return res.status(400).json({
          error: `Invalid order: ${updates.order}. Must be between 0 and ${eventCount - 1}`
        });
      }
    }

    if (updates.stage !== undefined) {
      const validStages = ["introduction", "rising action", "climax", "falling action", "resolution"];
      if (!validStages.includes(updates.stage)) {
        return res.status(400).json({
          error: `Invalid stage: ${updates.stage}. Must be one of: ${validStages.join(", ")}`
        });
      }
    }

    if (updates.date !== undefined && updates.date !== null) {
      const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
      if (!dateRegex.test(updates.date)) {
        return res.status(400).json({
          error: "Event 'date' must be in MM/DD/YYYY format if provided"
        });
      }
    }

    // Merge and save
    const updatedEvent = {
      ...currentEvent,
      ...updates,
    };

    const result = await pipeline.manager.upsertEvent(eventId, updatedEvent);
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] Event ${eventId} updated successfully`);
    res.status(200).json({
      success: true,
      firebaseKey: eventId,
      updated: result
    });

  } catch (err) {
    console.error("[ERROR /api/events/update]", err);
    logger.error(`[ERROR] /api/events/update: ${err}`);
    res.status(500).json({ error: err.message });
  }
});


/**
 * Direct event deletion (no staging/confirmation required)
 * Used for user-driven deletions from timeline
 * 
 * POST /api/events/delete
 * Body: {
 *   userId: string,
 *   eventId: string
 * }
 */
app.post("/api/events/delete", async (req, res) => {
  logger.info(`[REQUEST] /api/events/delete with body: ${JSON.stringify(req.body)}`);
  console.log("[DEBUG /api/events/delete] Full request body:", req.body);

  try {
    const { userId, eventId } = req.body;

    console.log("[DEBUG] Extracted params - userId:", userId, "eventId:", eventId);

    if (!userId) {
      console.log("[DEBUG] Missing userId");
      return res.status(400).json({ error: "userId is required" });
    }
    if (!eventId) {
      console.log("[DEBUG] Missing eventId");
      return res.status(400).json({ error: "eventId is required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Get the current event first
    console.log("[DEBUG] Fetching event with id:", eventId);
    const currentEvent = await pipeline.manager.getEvent(eventId);
    console.log("[DEBUG] Event found:", currentEvent);

    if (!currentEvent) {
      console.log("[DEBUG] Event not found");
      return res.status(404).json({ error: `Event not found with id '${eventId}'` });
    }

    // Delete the event
    console.log("[DEBUG] Deleting event");
    const result = await pipeline.manager.deleteEventById(eventId);
    console.log("[DEBUG] Delete result:", result);

    if (!result.deleted) {
      console.log("[DEBUG] Failed to delete event");
      return res.status(400).json({ error: `Failed to delete event: ${result.reason}` });
    }

    // Invalidate cache
    pmCache.invalidateAll(userId);
    console.log("[DEBUG] Cache invalidated");

    logger.info(`[DATA] Event ${eventId} deleted successfully`);
    res.status(200).json({
      success: true,
      eventId,
      deleted: result
    });

  } catch (err) {
    console.error("[ERROR /api/events/delete]", err);
    logger.error(`[ERROR] /api/events/delete: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Direct event deletion (no staging/confirmation required)
 * Used for user-driven deletions from timeline
 * 
 * POST /api/events/delete
 * Body: {
 *   userId: string,
 *   eventId: string
 */

app.post("/api/events/batch-update", async (req, res) => {
  logger.info(`[REQUEST] /api/events/batch-update with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, updates } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!Array.isArray(updates)) return res.status(400).json({ error: "updates must be an array" });
    if (updates.length === 0) return res.status(400).json({ error: "updates array cannot be empty" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const allEvents = await pipeline.manager.getAllEvents();
    const eventCount = Object.keys(allEvents).length;

    // Validate all updates first
    for (const update of updates) {
      if (!update.eventId) {
        return res.status(400).json({ error: "Each update must have an eventId (Firebase key)" });
      }

      const event = await pipeline.manager.getEvent(update.eventId);
      if (!event) {
        return res.status(404).json({ error: `Event not found: ${update.eventId}` });
      }

      if (update.order !== undefined) {
        if (!Number.isInteger(update.order) || update.order < 0 || update.order >= eventCount) {
          return res.status(400).json({
            error: `Invalid order for event ${update.eventId}: ${update.order}`
          });
        }
      }

      if (update.stage !== undefined) {
        const validStages = ["introduction", "rising action", "climax", "falling action", "resolution"];
        if (!validStages.includes(update.stage)) {
          return res.status(400).json({
            error: `Invalid stage for event ${update.eventId}: ${update.stage}`
          });
        }
      }
    }

    // Perform updates
    const results = [];
    for (const update of updates) {
      const event = await pipeline.manager.getEvent(update.eventId);
      const updatedEvent = { ...event, ...update };
      // Remove eventId from the update object since it's the key
      const { eventId, ...cleanUpdate } = updatedEvent;
      const result = await pipeline.manager.upsertEvent(update.eventId, cleanUpdate);
      results.push(result);
      logger.info(`[DATA] Event ${update.eventId} batch updated`);
    }

    pmCache.invalidateAll(userId);

    res.status(200).json({
      success: true,
      count: results.length,
      updated: results
    });

  } catch (err) {
    logger.error(`[ERROR] /api/events/batch-update: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Confirm a change
 */
app.post("/api/confirm-change", async (req, res) => {
  logger.info(`[REQUEST] /api/confirm-change request with body: ${JSON.stringify(req.body)}`);
  try {
    const { userId, changeKey, overwrite } = req.body;
    console.log("Request body:", userId, changeKey);
    if (!userId || !changeKey) {
      return res.status(400).json({ error: "userId and changeKey are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    try {
      const confirmed = await pipeline.confirm(changeKey, { overwrite: !!overwrite });

      pmCache.invalidateAll(userId);

      if (entityType && entityType.startsWith("worldBuilding-")) {
        const category = entityType.replace("worldBuilding-", "");
        pmCache.invalidate(userId, `worldbuilding_${category}`);
      }

      // Broadcast to all connected clients
      broadcastPendingUpdate(userId);

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

      // Broadcast to all connected clients
      broadcastPendingUpdate(userId);

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

    pmCache.invalidateAll(userId);

    // Broadcast to all connected clients
    broadcastPendingUpdate(userId);

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

/**
 * Stage a change
 */
app.post("/api/stage-change", async (req, res) => {
  logger.info(`[REQUEST] /api/stage-change request with body: ${JSON.stringify(req.body)}`);
  console.log("Received /api/stage-change request with body:", req.body);
  try {
    const { userId, entityType, entityId, newData } = req.body;
    if (!userId || !entityType || !newData) {
      return res.status(400).json({ error: "userId, entityType, and newData are required" });
    }
    if (entityType.startsWith("worldBuilding-")) {
      const category = entityType.replace("worldBuilding-", "");
      const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];

      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: `Invalid world-building category: ${category}. Must be one of: ${validCategories.join(", ")}`
        });
      }

      // Validate required fields based on category
      if (!newData.name || !newData.type || !newData.description) {
        return res.status(400).json({
          error: `World-building items in '${category}' must have name, type, and description`
        });
      }

      // Validate parentKey if provided (must be a Firebase key or null)
      if (newData.parentKey !== undefined && newData.parentKey !== null) {
        const pipeline = new ConfirmationPipeline({ uid: userId });
        const allItems = await pipeline.manager.getWorldBuildingCategory(category);

        if (!allItems[newData.parentKey]) {
          return res.status(400).json({
            error: `Parent item with Firebase key '${newData.parentKey}' not found in category '${category}'`
          });
        }
      }
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

    pmCache.invalidateAll(userId);

    if (entityType.startsWith("worldBuilding-")) {
      const category = entityType.replace("worldBuilding-", "");
      pmCache.invalidate(userId, `worldbuilding_${category}`);
    }


    // Broadcast to all connected clients
    broadcastPendingUpdate(userId);

    res.status(200).json(staged); // ✅ already includes status, editable, nextStep
  } catch (err) {
    logger.error(`[ERROR] /api/stage-change: ${err}`);
    res.status(400).json({ error: err.message });
  }
});

// ============ BATCH ENDPOINT ============
/**
 * POST /api/batch
 * Body: {
 *   userId: string,
 *   requests: [
 *     { target: "nodes", filters: { label: "Akio" } },
 *     { target: "links", filters: { participants: ["Akio", "Phagousa"] } },
 *     { target: "events" }
 *   ]
 * }
 * 
 * Returns: { results: [{data: ...}, {data: ...}, ...] }
 */
app.post("/api/batch", async (req, res) => {
  const batchStart = Date.now();
  console.log("=== BATCH REQUEST START ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const { userId, requests } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!Array.isArray(requests)) {
      return res.status(400).json({ error: "requests must be an array" });
    }

    if (requests.length === 0) {
      return res.status(400).json({ error: "requests array cannot be empty" });
    }

    if (requests.length > 10) {
      return res.status(400).json({ error: "Maximum 10 requests per batch" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const results = [];

    // Process each request
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      const reqStart = Date.now();

      console.log(`[BATCH ${i + 1}/${requests.length}] Processing:`, r);

      try {
        const target = r.target;
        const filters = r.filters || {};

        // ============ NODES ============
        if (target === "nodes") {
          let nodes = await getCachedNodes(userId, pipeline);

          // Apply filters
          if (filters.label) {
            const wanted = Array.isArray(filters.label) ? filters.label : [filters.label];
            nodes = Object.fromEntries(
              Object.entries(nodes).filter(([_, node]) => {
                if (!node) return false;
                for (const w of wanted) {
                  const lowerW = String(w).toLowerCase().trim();
                  if (node.label?.toLowerCase() === lowerW) return true;

                  // Check aliases
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
          }

          const reqTime = Date.now() - reqStart;
          console.log(`[BATCH ${i + 1}] Nodes returned: ${Object.keys(nodes).length} in ${reqTime}ms`);
          results.push({ data: nodes });
        }

        // ============ LINKS ============
        else if (target === "links") {
          let links = await getCachedLinks(userId, pipeline);
          let nodes = null; // Only fetch if needed

          // Apply filters
          if (filters.participants) {
            const parts = Array.isArray(filters.participants) ? filters.participants : [filters.participants];

            let resultSet = null;
            for (const p of parts) {
              try {
                const pLinks = await pipeline.manager.filterLinksByNode(p);
                if (resultSet === null) {
                  resultSet = { ...pLinks };
                } else {
                  // Intersect
                  const intersect = {};
                  for (const key of Object.keys(resultSet)) {
                    if (key in pLinks) intersect[key] = resultSet[key];
                  }
                  resultSet = intersect;
                }
              } catch (e) {
                resultSet = {};
              }
            }
            links = resultSet || {};
          }

          // Enrich links with node data
          if (!nodes) nodes = await getCachedNodes(userId, pipeline);

          const enrichedLinks = {};
          for (const [linkId, link] of Object.entries(links)) {
            const sourceNode = nodes[link.source];
            const targetNode = nodes[link.target];

            enrichedLinks[linkId] = {
              ...link,
              source: sourceNode ? {
                id: sourceNode.id,
                label: sourceNode.label,
                group: sourceNode.group,
                attributes: sourceNode.attributes,
                aliases: sourceNode.aliases
              } : link.source,
              target: targetNode ? {
                id: targetNode.id,
                label: targetNode.label,
                group: targetNode.group,
                attributes: targetNode.attributes,
                aliases: targetNode.aliases
              } : link.target
            };
          }

          const reqTime = Date.now() - reqStart;
          console.log(`[BATCH ${i + 1}] Links returned: ${Object.keys(enrichedLinks).length} in ${reqTime}ms`);
          results.push({ data: enrichedLinks });
        }
        else if (target === "worldbuilding") {
          const category = filters.category;

          if (!category) {
            results.push({ error: "worldbuilding requests require 'category' filter" });
            continue;
          }

          const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];
          if (!validCategories.includes(category)) {
            results.push({ error: `Invalid category: ${category}` });
            continue;
          }

          let items = await getCachedWorldBuilding(userId, pipeline, category);

          // Apply parentKey filter if provided
          if (filters.parentKey !== undefined) {
            const parentKey = filters.parentKey === "null" ? null : filters.parentKey;
            items = Object.fromEntries(
              Object.entries(items).filter(([_, item]) => {
                const itemParentKey = item?.parentKey === "null" || item?.parentKey === undefined ? null : item?.parentKey;
                return itemParentKey === parentKey;
              })
            );
          }

          // Apply name filter if provided
          if (filters.name) {
            const searchName = filters.name.toLowerCase();
            items = Object.fromEntries(
              Object.entries(items).filter(([_, item]) =>
                item?.name?.toLowerCase().includes(searchName)
              )
            );
          }

          const reqTime = Date.now() - reqStart;
          console.log(`[BATCH ${i + 1}] World-building '${category}' returned: ${Object.keys(items).length} in ${reqTime}ms`);
          results.push({ data: items });
        }
        else if (target === "world_items") {
          const items = await getCachedWorldItems(userId, pipeline);

          // Optional: filter by parentId
          if (filters.parentId !== undefined) {
            const filtered = Object.fromEntries(
              Object.entries(items).filter(([_, item]) => item?.parentId === filters.parentId)
            );
            results.push({ data: filtered });
          } else {
            results.push({ data: items });
          }
        }
        else if (target === "world_templates") {
          const templates = await getCachedWorldTemplates(userId, pipeline);
          results.push({ data: templates });
        }
        else if (target === "world_metadata") {
          const metadata = await getCachedWorldMetadata(userId, pipeline);
          results.push({ data: metadata });
        }

        // ============ EVENTS ============
        else if (target === "events") {
          let events = await getCachedEvents(userId, pipeline);

          // Apply filters
          if (filters.description) {
            events = Object.fromEntries(
              Object.entries(events).filter(([_, e]) =>
                e.description?.includes(filters.description)
              )
            );
          }

          const reqTime = Date.now() - reqStart;
          console.log(`[BATCH ${i + 1}] Events returned: ${Object.keys(events).length} in ${reqTime}ms`);
          results.push({ data: events });
        }

        // ============ PENDING CHANGES ============
        else if (target === "pending_changes") {
          const pending = await pipeline.listPending();
          const reqTime = Date.now() - reqStart;
          console.log(`[BATCH ${i + 1}] Pending changes returned: ${Object.keys(pending).length} in ${reqTime}ms`);
          results.push({ data: pending });
        }

        // ============ UNKNOWN TARGET ============
        else {
          results.push({ error: `Unknown target: ${target}` });
        }

      } catch (err) {
        console.error(`[BATCH ${i + 1}] Error:`, err);
        results.push({ error: err.message });
      }
    }

    const batchTime = Date.now() - batchStart;
    console.log(`=== BATCH REQUEST COMPLETE in ${batchTime}ms ===`);

    res.status(200).json({ results, batchTime });

  } catch (err) {
    const batchTime = Date.now() - batchStart;
    console.error(`=== BATCH REQUEST FAILED after ${batchTime}ms ===`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events/cleanup-fields", async (req, res) => {
  logger.info(`[REQUEST] /api/events/cleanup-fields`);

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const result = await pipeline.manager.cleanupEventFields();

    // Invalidate cache after cleanup
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] Cleaned ${result.cleanedCount} events, skipped ${result.skippedCount}`);

    res.status(200).json({
      success: true,
      ...result
    });

  } catch (err) {
    logger.error(`[ERROR] /api/events/cleanup-fields: ${err}`);
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

// ============ CACHE STATS ENDPOINT ============
app.get("/api/cache-stats", (req, res) => {
  const stats = pmCache.getStats();
  res.status(200).json(stats);
});

function broadcastPendingUpdate(userId) {
  // Each connected client gets notified
  for (const client of clients) {
    client.write(`event: pendingUpdate\n`);
    client.write(`data: ${JSON.stringify({ userId })}\n\n`);
  }
}

// ============ HELPER: Get cached or fetch nodes ============
async function getCachedNodes(userId, pipeline) {
  let nodes = pmCache.getNodes(userId);

  if (!nodes) {
    const fetchStart = Date.now();
    nodes = await pipeline.manager.getAllNodes();
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase nodes fetch took ${fetchTime}ms`);
    pmCache.setNodes(userId, nodes);
  }

  return nodes;
}

// ============ HELPER: Get cached or fetch links ============
async function getCachedLinks(userId, pipeline) {
  let links = pmCache.getLinks(userId);

  if (!links) {
    const fetchStart = Date.now();
    links = await pipeline.manager.getAllLinks();
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase links fetch took ${fetchTime}ms`);
    pmCache.setLinks(userId, links);
  }

  return links;
}

// ============ HELPER: Get cached or fetch events ============
async function getCachedEvents(userId, pipeline) {
  let events = pmCache.getEvents(userId);

  if (!events) {
    const fetchStart = Date.now();
    events = await pipeline.manager.getAllEvents();
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase events fetch took ${fetchTime}ms`);
    pmCache.setEvents(userId, events);
  }

  return events;
}

async function getCachedWorldItems(userId, pipeline) {
  const cacheKey = 'world_items';
  let items = pmCache.get(userId, cacheKey);

  if (!items) {
    const fetchStart = Date.now();
    const itemsRef = child(pipeline.manager.baseRef, "world/items");
    const snapshot = await get(itemsRef);
    items = snapshot.exists() ? snapshot.val() : {};
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase world items fetch took ${fetchTime}ms`);
    pmCache.set(userId, cacheKey, items);
  }

  return items;
}

// Helper: Get cached or fetch world templates
async function getCachedWorldTemplates(userId, pipeline) {
  const cacheKey = 'world_templates';
  let templates = pmCache.get(userId, cacheKey);

  if (!templates) {
    const fetchStart = Date.now();
    const templatesRef = child(pipeline.manager.baseRef, "world/templates");
    const snapshot = await get(templatesRef);
    templates = snapshot.exists() ? snapshot.val() : {};
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase world templates fetch took ${fetchTime}ms`);
    pmCache.set(userId, cacheKey, templates);
  }

  return templates;
}

async function getCachedWorldBuilding(userId, pipeline, category) {
    const cacheKey = `worldbuilding_${category}`;
    let items = pmCache.get(userId, cacheKey);

    if (!items) {
        const fetchStart = Date.now();
        items = await pipeline.manager.getWorldBuildingCategory(category);
        const fetchTime = Date.now() - fetchStart;
        console.log(`[TIMING] Firebase world-building '${category}' fetch took ${fetchTime}ms`);
        pmCache.set(userId, cacheKey, items);
    }

    return items;
}

// Helper: Get cached or fetch world metadata
async function getCachedWorldMetadata(userId, pipeline) {
  const cacheKey = 'world_metadata';
  let metadata = pmCache.get(userId, cacheKey);

  if (!metadata) {
    const fetchStart = Date.now();
    const metadataRef = child(pipeline.manager.baseRef, "world/metadata");
    const snapshot = await get(metadataRef);
    metadata = snapshot.val();
    const fetchTime = Date.now() - fetchStart;
    console.log(`[TIMING] Firebase world metadata fetch took ${fetchTime}ms`);
    pmCache.set(userId, cacheKey, metadata);
  }

  return metadata;
}

// ========== STORY STRUCTURE ENDPOINTS ==========

app.get("/api/stories", async (req, res) => {
  logger.info(`[REQUEST] GET /api/stories`);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const storiesRef = child(pipeline.manager.baseRef, "stories");
    const snapshot = await get(storiesRef);

    const stories = snapshot.exists() ? snapshot.val() : {};
    logger.info(`[DATA] Fetched ${Object.keys(stories).length} stories`);
    res.status(200).json(stories);
  } catch (err) {
    logger.error(`[ERROR] /api/stories: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stories", async (req, res) => {
  logger.info(`[REQUEST] POST /api/stories`);
  try {
    const { userId, title } = req.body;
    if (!userId || !title) {
      return res.status(400).json({ error: "userId and title are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const storiesRef = child(pipeline.manager.baseRef, "stories");
    const newStoryRef = push(storiesRef);

    const storyData = {
      title,
      createdAt: Date.now(),
      parts: {}
    };

    await set(newStoryRef, storyData);

    logger.info(`[DATA] Created story ${newStoryRef.key}`);
    res.status(200).json({
      success: true,
      storyId: newStoryRef.key,
      ...storyData
    });
  } catch (err) {
    logger.error(`[ERROR] POST /api/stories: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stories/:storyId/parts", async (req, res) => {
  logger.info(`[REQUEST] POST /api/stories/:storyId/parts`);
  try {
    const { userId, title } = req.body;
    const { storyId } = req.params;

    if (!userId || !title) {
      return res.status(400).json({ error: "userId and title are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const partsRef = child(pipeline.manager.baseRef, `stories/${storyId}/parts`);
    const newPartRef = push(partsRef);

    const partsSnapshot = await get(partsRef);
    const existingParts = partsSnapshot.exists() ? partsSnapshot.val() : {};
    const order = Object.keys(existingParts).length;

    const partData = {
      title,
      order,
      createdAt: Date.now(),
      drafts: {}
    };

    await set(newPartRef, partData);

    logger.info(`[DATA] Created part ${newPartRef.key} in story ${storyId}`);
    res.status(200).json({
      success: true,
      partId: newPartRef.key,
      ...partData
    });
  } catch (err) {
    logger.error(`[ERROR] POST /api/stories/:storyId/parts: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stories/:storyId/parts/:partId/drafts", async (req, res) => {
  logger.info(`[REQUEST] POST /api/stories/:storyId/parts/:partId/drafts`);
  try {
    const { userId } = req.body;
    const { storyId, partId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const draftsRef = child(pipeline.manager.baseRef, `stories/${storyId}/parts/${partId}/drafts`);
    const newDraftRef = push(draftsRef);

    const draftsSnapshot = await get(draftsRef);
    const existingDrafts = draftsSnapshot.exists() ? draftsSnapshot.val() : {};
    const version = Object.keys(existingDrafts).length + 1;

    const draftData = {
      content: JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]),
      createdAt: Date.now(),
      wordCount: 0,
      version
    };

    await set(newDraftRef, draftData);

    logger.info(`[DATA] Created draft ${newDraftRef.key} in part ${partId}`);
    res.status(200).json({
      success: true,
      draftId: newDraftRef.key,
      ...draftData
    });
  } catch (err) {
    logger.error(`[ERROR] POST /api/stories/:storyId/parts/:partId/drafts: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stories/:storyId/parts/:partId/drafts/:draftId", async (req, res) => {
  logger.info(`[REQUEST] GET draft`);
  try {
    const { userId } = req.query;
    const { storyId, partId, draftId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const draftRef = child(pipeline.manager.baseRef, `stories/${storyId}/parts/${partId}/drafts/${draftId}`);
    const snapshot = await get(draftRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.status(200).json(snapshot.val());
  } catch (err) {
    logger.error(`[ERROR] GET draft: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/stories/:storyId/parts/:partId/drafts/:draftId", async (req, res) => {
  logger.info(`[REQUEST] PUT draft`);
  try {
    const { userId, content, wordCount } = req.body;
    const { storyId, partId, draftId } = req.params;

    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content are required" });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const draftRef = child(pipeline.manager.baseRef, `stories/${storyId}/parts/${partId}/drafts/${draftId}`);

    await update(draftRef, {
      content: JSON.stringify(content),
      wordCount: wordCount || 0,
      updatedAt: Date.now()
    });

    logger.info(`[DATA] Saved draft ${draftId}`);
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error(`[ERROR] PUT draft: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
