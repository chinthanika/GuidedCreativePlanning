// utils/ProfileManagerCache.js
import NodeCache from "node-cache";

/**
 * Cache layer for Profile Manager to reduce Firebase reads
 * - Short TTL (30s) for frequently accessed data
 * - Separate caches for nodes, links, events
 * - User-scoped cache keys
 */
class ProfileManagerCache {
  constructor() {
    // Separate caches with different characteristics
    this.nodesCache = new NodeCache({ 
      stdTTL: 30,      // 30 second TTL
      checkperiod: 60,  // Check for expired keys every 60s
      useClones: false  // Don't clone (we're not mutating)
    });
    
    this.linksCache = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: false });
    this.eventsCache = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: false });
    
    // Track statistics
    this.stats = {
      nodes: { hits: 0, misses: 0, writes: 0 },
      links: { hits: 0, misses: 0, writes: 0 },
      events: { hits: 0, misses: 0, writes: 0 }
    };
  }

  // ============ NODES ============
  
  getNodes(userId) {
    const key = `nodes:${userId}`;
    const cached = this.nodesCache.get(key);
    
    if (cached !== undefined) {
      this.stats.nodes.hits++;
      console.log(`[CACHE HIT] Nodes for user ${userId}`);
      return cached;
    }
    
    this.stats.nodes.misses++;
    console.log(`[CACHE MISS] Nodes for user ${userId}`);
    return null;
  }

  setNodes(userId, data) {
    const key = `nodes:${userId}`;
    this.nodesCache.set(key, data);
    this.stats.nodes.writes++;
    console.log(`[CACHE WRITE] Nodes for user ${userId}, count: ${Object.keys(data || {}).length}`);
  }

  invalidateNodes(userId) {
    const key = `nodes:${userId}`;
    this.nodesCache.del(key);
    console.log(`[CACHE INVALIDATE] Nodes for user ${userId}`);
  }

  // ============ LINKS ============
  
  getLinks(userId) {
    const key = `links:${userId}`;
    const cached = this.linksCache.get(key);
    
    if (cached !== undefined) {
      this.stats.links.hits++;
      console.log(`[CACHE HIT] Links for user ${userId}`);
      return cached;
    }
    
    this.stats.links.misses++;
    console.log(`[CACHE MISS] Links for user ${userId}`);
    return null;
  }

  setLinks(userId, data) {
    const key = `links:${userId}`;
    this.linksCache.set(key, data);
    this.stats.links.writes++;
    console.log(`[CACHE WRITE] Links for user ${userId}, count: ${Object.keys(data || {}).length}`);
  }

  invalidateLinks(userId) {
    const key = `links:${userId}`;
    this.linksCache.del(key);
    console.log(`[CACHE INVALIDATE] Links for user ${userId}`);
  }

  // ============ EVENTS ============
  
  getEvents(userId) {
    const key = `events:${userId}`;
    const cached = this.eventsCache.get(key);
    
    if (cached !== undefined) {
      this.stats.events.hits++;
      console.log(`[CACHE HIT] Events for user ${userId}`);
      return cached;
    }
    
    this.stats.events.misses++;
    console.log(`[CACHE MISS] Events for user ${userId}`);
    return null;
  }

  setEvents(userId, data) {
    const key = `events:${userId}`;
    this.eventsCache.set(key, data);
    this.stats.events.writes++;
    console.log(`[CACHE WRITE] Events for user ${userId}, count: ${Object.keys(data || {}).length}`);
  }

  invalidateEvents(userId) {
    const key = `events:${userId}`;
    this.eventsCache.del(key);
    console.log(`[CACHE INVALIDATE] Events for user ${userId}`);
  }

  // ============ UTILITIES ============

  invalidateAll(userId) {
    this.invalidateNodes(userId);
    this.invalidateLinks(userId);
    this.invalidateEvents(userId);
    console.log(`[CACHE INVALIDATE ALL] All caches for user ${userId}`);
  }

  getStats() {
    const calculateRate = (hits, misses) => {
      const total = hits + misses;
      if (total === 0) return "0.00%";
      return `${((hits / total) * 100).toFixed(2)}%`;
    };

    return {
      nodes: {
        ...this.stats.nodes,
        hitRate: calculateRate(this.stats.nodes.hits, this.stats.nodes.misses),
        size: this.nodesCache.keys().length
      },
      links: {
        ...this.stats.links,
        hitRate: calculateRate(this.stats.links.hits, this.stats.links.misses),
        size: this.linksCache.keys().length
      },
      events: {
        ...this.stats.events,
        hitRate: calculateRate(this.stats.events.hits, this.stats.events.misses),
        size: this.eventsCache.keys().length
      }
    };
  }

  clearStats() {
    this.stats = {
      nodes: { hits: 0, misses: 0, writes: 0 },
      links: { hits: 0, misses: 0, writes: 0 },
      events: { hits: 0, misses: 0, writes: 0 }
    };
  }
}

// Singleton instance
const pmCache = new ProfileManagerCache();

export default pmCache;