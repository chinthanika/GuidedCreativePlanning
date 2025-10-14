// servers/utils/ProfileManagerCache.js

class ProfileManagerCache {
  constructor() {
    this.cache = new Map(); // userId -> { nodes, links, events, worldbuilding_* }
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  _getUserCache(userId) {
    if (!this.cache.has(userId)) {
      this.cache.set(userId, {
        nodes: null,
        links: null,
        events: null,
        worldbuilding: {
          magicSystems: null,
          cultures: null,
          locations: null,
          technology: null,
          history: null,
          organizations: null
        },
        timestamps: {
          nodes: null,
          links: null,
          events: null,
          worldbuilding: {
            magicSystems: null,
            cultures: null,
            locations: null,
            technology: null,
            history: null,
            organizations: null
          }
        }
      });
    }
    return this.cache.get(userId);
  }

  _isExpired(timestamp) {
    if (!timestamp) return true;
    return Date.now() - timestamp > this.ttl;
  }

  // ========== NODES ==========
  getNodes(userId) {
    const cache = this._getUserCache(userId);
    if (this._isExpired(cache.timestamps.nodes)) {
      cache.nodes = null;
      cache.timestamps.nodes = null;
      return null;
    }
    return cache.nodes;
  }

  setNodes(userId, data) {
    const cache = this._getUserCache(userId);
    cache.nodes = data;
    cache.timestamps.nodes = Date.now();
  }

  // ========== LINKS ==========
  getLinks(userId) {
    const cache = this._getUserCache(userId);
    if (this._isExpired(cache.timestamps.links)) {
      cache.links = null;
      cache.timestamps.links = null;
      return null;
    }
    return cache.links;
  }

  setLinks(userId, data) {
    const cache = this._getUserCache(userId);
    cache.links = data;
    cache.timestamps.links = Date.now();
  }

  // ========== EVENTS ==========
  getEvents(userId) {
    const cache = this._getUserCache(userId);
    if (this._isExpired(cache.timestamps.events)) {
      cache.events = null;
      cache.timestamps.events = null;
      return null;
    }
    return cache.events;
  }

  setEvents(userId, data) {
    const cache = this._getUserCache(userId);
    cache.events = data;
    cache.timestamps.events = Date.now();
  }

  // ========== WORLD-BUILDING ==========
  getWorldBuilding(userId, category) {
    const cache = this._getUserCache(userId);
    if (!cache.worldbuilding[category]) return null;

    if (this._isExpired(cache.timestamps.worldbuilding[category])) {
      cache.worldbuilding[category] = null;
      cache.timestamps.worldbuilding[category] = null;
      return null;
    }
    return cache.worldbuilding[category];
  }

  setWorldBuilding(userId, category, data) {
    const cache = this._getUserCache(userId);
    cache.worldbuilding[category] = data;
    cache.timestamps.worldbuilding[category] = Date.now();
  }

  invalidateWorldBuilding(userId, category) {
    const cache = this._getUserCache(userId);
    cache.worldbuilding[category] = null;
    cache.timestamps.worldbuilding[category] = null;
  }

  invalidateAllWorldBuilding(userId) {
    const cache = this._getUserCache(userId);
    const categories = ['magicSystems', 'cultures', 'locations', 'technology', 'history', 'organizations'];
    for (const category of categories) {
      cache.worldbuilding[category] = null;
      cache.timestamps.worldbuilding[category] = null;
    }
  }

  async getWorldName() {
    const snapshot = await get(child(this.baseRef, "worldName"));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async setWorldName(name) {
    return set(child(this.baseRef, "worldName"), name);
  }

  // ========== GENERIC GET/SET ==========
  get(userId, key) {
    if (key.startsWith('worldbuilding_')) {
      const category = key.replace('worldbuilding_', '');
      return this.getWorldBuilding(userId, category);
    }

    const cache = this._getUserCache(userId);
    if (this._isExpired(cache.timestamps[key])) {
      cache[key] = null;
      cache.timestamps[key] = null;
      return null;
    }
    return cache[key];
  }

  set(userId, key, data) {
    if (key.startsWith('worldbuilding_')) {
      const category = key.replace('worldbuilding_', '');
      return this.setWorldBuilding(userId, category, data);
    }

    const cache = this._getUserCache(userId);
    cache[key] = data;
    cache.timestamps[key] = Date.now();
  }

  invalidate(userId, key) {
    if (key.startsWith('worldbuilding_')) {
      const category = key.replace('worldbuilding_', '');
      return this.invalidateWorldBuilding(userId, category);
    }

    const cache = this._getUserCache(userId);
    cache[key] = null;
    cache.timestamps[key] = null;
  }

  invalidateAll(userId) {
    const cache = this._getUserCache(userId);
    cache.nodes = null;
    cache.links = null;
    cache.events = null;
    cache.timestamps.nodes = null;
    cache.timestamps.links = null;
    cache.timestamps.events = null;
    this.invalidateAllWorldBuilding(userId);
  }

  // ========== STATS ==========
  getStats() {
    const stats = {
      totalUsers: this.cache.size,
      users: {}
    };

    for (const [userId, cache] of this.cache.entries()) {
      const userStats = {
        nodes: cache.nodes ? 'cached' : 'empty',
        links: cache.links ? 'cached' : 'empty',
        events: cache.events ? 'cached' : 'empty',
        worldbuilding: {}
      };

      const categories = ['magicSystems', 'cultures', 'locations', 'technology', 'history', 'organizations'];
      for (const category of categories) {
        userStats.worldbuilding[category] = cache.worldbuilding[category] ? 'cached' : 'empty';
      }

      stats.users[userId] = userStats;
    }

    return stats;
  }

  // ========== CLEANUP ==========
  cleanup() {
    const now = Date.now();
    for (const [userId, cache] of this.cache.entries()) {
      // Clean nodes
      if (cache.timestamps.nodes && this._isExpired(cache.timestamps.nodes)) {
        cache.nodes = null;
        cache.timestamps.nodes = null;
      }

      // Clean links
      if (cache.timestamps.links && this._isExpired(cache.timestamps.links)) {
        cache.links = null;
        cache.timestamps.links = null;
      }

      // Clean events
      if (cache.timestamps.events && this._isExpired(cache.timestamps.events)) {
        cache.events = null;
        cache.timestamps.events = null;
      }

      // Clean world-building
      const categories = ['magicSystems', 'cultures', 'locations', 'technology', 'history', 'organizations'];
      for (const category of categories) {
        if (cache.timestamps.worldbuilding[category] && this._isExpired(cache.timestamps.worldbuilding[category])) {
          cache.worldbuilding[category] = null;
          cache.timestamps.worldbuilding[category] = null;
        }
      }

      // Remove user cache if everything is empty
      const allEmpty = !cache.nodes && !cache.links && !cache.events &&
        categories.every(cat => !cache.worldbuilding[cat]);

      if (allEmpty) {
        this.cache.delete(userId);
      }
    }
  }
}

// Auto-cleanup every 10 minutes
const pmCache = new ProfileManagerCache();
setInterval(() => {
  pmCache.cleanup();
  console.log('[CACHE] Cleanup completed');
}, 10 * 60 * 1000);

export default pmCache;