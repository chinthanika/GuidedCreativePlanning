// servers/profilemanager_server.js
import express from "express";
import bodyParser from "body-parser";
import ConfirmationPipeline from "../services/ConfirmationPipeline.js";
import cors from "cors";

import { child, push, remove, set } from "firebase/database";

import logger from "./logger.js";
import { requestLogger } from "./loggerMiddleware.js";

import pmCache from "../servers/utils/ProfileManagerCache.js";

const app = express();

app.use(cors({ origin: "http://localhost:3000" })); // allow React dev server
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

/**
 * Get all world-building data
 */
app.get("/api/worldbuilding", async (req, res) => {
  const endLog = logTimingStart("/api/worldbuilding");

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });
    const worldBuilding = await pipeline.manager.getAllWorldBuilding();

    logger.info(`[DATA] World-building data fetched: ${Object.keys(worldBuilding).length} categories`);

    res.status(200).json(worldBuilding);
    endLog();
  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding: ${err}`);
    res.status(500).json({ error: err.message });
    endLog();
  }
});

/**
 * Get all items in a specific world-building category
 * Example: GET /api/worldbuilding/magicSystems?userId=abc123
 */
app.get("/api/worldbuilding/:category", async (req, res) => {
  const endLog = logTimingStart(`/api/worldbuilding/:category`);
  logger.info(`[REQUEST] /api/worldbuilding/:category request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);

  try {
    const { userId } = req.query;
    const { category } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Must be one of: ${validCategories.join(", ")}`
      });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });
    let items = await pipeline.manager.getWorldBuildingCategory(category);

    logger.info(`[DATA] Items fetched in category '${category}': ${Object.keys(items).length}`);

    // Optional filtering by parentId
    if (req.query.parentId !== undefined) {
      // Handle both "null" string and actual null
      const parentId = req.query.parentId === "null" || req.query.parentId === "" ? null : req.query.parentId;
      items = Object.fromEntries(
        Object.entries(items).filter(([_, item]) => {
          // Explicit null check - treat undefined, null, and "null" string as null
          const itemParentId = item?.parentId === "null" || item?.parentId === undefined ? null : item?.parentId;
          return itemParentId === parentId;
        })
      );
      logger.info(`[DATA] Filtered by parentId '${parentId}': ${Object.keys(items).length} items`);
    }

    // Optional filtering by name (fuzzy search)
    if (req.query.name) {
      const searchName = req.query.name.toLowerCase();
      items = Object.fromEntries(
        Object.entries(items).filter(([_, item]) =>
          item?.name?.toLowerCase().includes(searchName)
        )
      );
      logger.info(`[DATA] Filtered by name '${req.query.name}': ${Object.keys(items).length} items`);
    }

    logger.info(`[DATA] Returning world-building items: ${Object.keys(items)}`);
    res.status(200).json(items);
    endLog();
  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding/:category: ${err}`);
    res.status(500).json({ error: err.message });
    endLog();
  }
});

/**
 * Get a specific world-building item by ID or name
 * Example: GET /api/worldbuilding/magicSystems/magic_001?userId=abc123
 */
app.get("/api/worldbuilding/:category/:identifier", async (req, res) => {
  logger.info(`[REQUEST] /api/worldbuilding/:category/:identifier request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);

  try {
    const { userId } = req.query;
    const { category, identifier } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Must be one of: ${validCategories.join(", ")}`
      });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Try by ID first, then by name
    let item = await pipeline.manager.getWorldBuildingItem(category, identifier);
    if (!item) {
      item = await pipeline.manager.resolveWorldBuildingItemByName(category, identifier);
    }

    if (!item) {
      return res.status(404).json({
        error: `Item not found in category '${category}' with identifier: ${identifier}`
      });
    }

    res.status(200).json(item);
  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding/:category/:identifier: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get children of a specific world-building item
 * Example: GET /api/worldbuilding/magicSystems/magic_001/children?userId=abc123
 */
app.get("/api/worldbuilding/:category/:identifier/children", async (req, res) => {
  logger.info(`[REQUEST] /api/worldbuilding/:category/:identifier/children request with params: ${JSON.stringify(req.params)}, query: ${JSON.stringify(req.query)}`);

  try {
    const { userId } = req.query;
    const { category, identifier } = req.params;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Get parent item to verify it exists
    let parent = await pipeline.manager.getWorldBuildingItem(category, identifier);
    if (!parent) {
      parent = await pipeline.manager.resolveWorldBuildingItemByName(category, identifier);
    }

    if (!parent) {
      return res.status(404).json({
        error: `Parent item not found in category '${category}' with identifier: ${identifier}`
      });
    }

    // Get all children
    const children = await pipeline.manager.filterWorldBuildingByParent(category, parent.id);

    logger.info(`[DATA] Children found for '${identifier}': ${Object.keys(children).length}`);
    res.status(200).json(children);
  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding/:category/:identifier/children: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

// In profilemanager_server.js
app.get("/api/world-metadata", async (req, res) => {
  const { userId } = req.query;
  const pipeline = new ConfirmationPipeline({ uid: userId });
  const worldName = await pipeline.manager.getWorldName() || "My World";
  res.json({ name: worldName });
});

app.post("/api/world-metadata", async (req, res) => {
  const { userId, name } = req.body;
  const pipeline = new ConfirmationPipeline({ uid: userId });
  await pipeline.manager.setWorldName(name);
  res.json({ success: true });
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
    res.status(400).json({ error: err.message });
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
 * Direct world-building item creation/update (no staging required)
 * POST /api/worldbuilding/update
 * Body: {
 *   userId: string,
 *   category: string,
 *   firebaseKey?: string, // Optional - only for updates
 *   data: { name, type, description, parentKey, ... }
 * }
 */
app.post("/api/worldbuilding/update", async (req, res) => {
  logger.info(`[REQUEST] /api/worldbuilding/update with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, category, firebaseKey, data } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!category) return res.status(400).json({ error: "category is required" });
    if (!data) return res.status(400).json({ error: "data object is required" });

    const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Must be one of: ${validCategories.join(", ")}`
      });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Validate parentKey if provided
    if (data.parentKey) {
      const allItems = await pipeline.manager.getWorldBuildingCategory(category);
      const parent = allItems[data.parentKey]; // Direct lookup by Firebase key
      if (!parent) {
        return res.status(400).json({
          error: `Parent item with firebaseKey '${data.parentKey}' not found in category '${category}'`
        });
      }
    }

    // Remove any old parentId field if it exists
    const cleanData = { ...data };
    delete cleanData.parentId;

    if (firebaseKey) {
      // Update existing item
      const currentItem = await pipeline.manager.getEvent(firebaseKey); // Using same pattern as events
      const categoryRef = child(pipeline.manager.worldBuildingRef, `${category}/${firebaseKey}`);
      await set(categoryRef, cleanData);
      
      logger.info(`[DATA] World-building item '${firebaseKey}' in '${category}' updated`);
      res.status(200).json({
        success: true,
        category,
        firebaseKey,
        data: cleanData
      });
    } else {
      // Create new item - let Firebase generate the key
      const categoryRef = child(pipeline.manager.worldBuildingRef, category);
      const newItemRef = push(categoryRef); // This generates a unique Firebase key
      const newFirebaseKey = newItemRef.key;
      
      await set(newItemRef, cleanData);
      
      logger.info(`[DATA] World-building item '${newFirebaseKey}' in '${category}' created`);
      res.status(200).json({
        success: true,
        created: true,
        category,
        firebaseKey: newFirebaseKey,
        data: cleanData
      });
    }

    // Invalidate cache
    pmCache.invalidate(userId, `worldbuilding_${category}`);
    pmCache.invalidateAll(userId);

  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding/update: ${err}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Direct world-building item deletion (no staging required)
 */
app.post("/api/worldbuilding/delete", async (req, res) => {
  logger.info(`[REQUEST] /api/worldbuilding/delete with body: ${JSON.stringify(req.body)}`);

  try {
    const { userId, category, firebaseKey } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!category) return res.status(400).json({ error: "category is required" });
    if (!firebaseKey) return res.status(400).json({ error: "firebaseKey is required" });

    const validCategories = ["magicSystems", "cultures", "locations", "technology", "history", "organizations"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Must be one of: ${validCategories.join(", ")}`
      });
    }

    const pipeline = new ConfirmationPipeline({ uid: userId });

    // Get all items to find children
    const allItems = await pipeline.manager.getWorldBuildingCategory(category);
    const item = allItems[firebaseKey];
    
    if (!item) {
      return res.status(404).json({
        error: `Item not found with firebaseKey: ${firebaseKey} in category '${category}'`
      });
    }

    // Delete the item
    const itemRef = child(pipeline.manager.worldBuildingRef, `${category}/${firebaseKey}`);
    await remove(itemRef);

    // Delete all children recursively (using parentKey now)
    const childrenToDelete = Object.entries(allItems).filter(
      ([_, i]) => i?.parentKey === firebaseKey
    );
    
    for (const [childKey, child] of childrenToDelete) {
      const childRef = child(pipeline.manager.worldBuildingRef, `${category}/${childKey}`);
      await remove(childRef);
      
      // Recursively delete grandchildren
      const grandchildren = Object.entries(allItems).filter(
        ([_, gc]) => gc?.parentKey === childKey
      );
      for (const [gcKey, _] of grandchildren) {
        const gcRef = child(pipeline.manager.worldBuildingRef, `${category}/${gcKey}`);
        await remove(gcRef);
      }
    }

    // Invalidate cache
    pmCache.invalidate(userId, `worldbuilding_${category}`);
    pmCache.invalidateAll(userId);

    logger.info(`[DATA] World-building item '${firebaseKey}' in '${category}' deleted with ${childrenToDelete.length} children`);
    res.status(200).json({
      success: true,
      category,
      firebaseKey,
      deleted: true,
      childrenDeleted: childrenToDelete.length
    });

  } catch (err) {
    logger.error(`[ERROR] /api/worldbuilding/delete: ${err}`);
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

          // Apply parentId filter if provided
          if (filters.parentId !== undefined) {
            const parentId = filters.parentId === "null" ? null : filters.parentId;
            items = Object.fromEntries(
              Object.entries(items).filter(([_, item]) => item?.parentId === parentId)
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

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Profile Manager running on port ${PORT}`);
});
