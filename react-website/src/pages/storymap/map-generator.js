import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../../Firebase/AuthContext'
import { database } from '../../Firebase/firebase'
import { ref, set, get } from "firebase/database"

import './map-generator.css'

// Normalize entity field names to standardized format
function normalizeEntity(entity) {
  if (!entity || typeof entity !== 'object') {
    console.warn('Invalid entity:', entity);
    return null;
  }

  // Possible field names DeepSeek might use
  const nameFields = ['label', 'name', 'entity_name', 'entityName', 'character', 'character_name', 'characterName', 'title'];
  const idFields = ['id', 'entity_id', 'entityId', 'character_id', 'characterId'];
  const typeFields = ['type', 'entity_type', 'entityType', 'category', 'group', 'kind'];
  const aliasFields = ['aliases', 'alias', 'alternate_names', 'alternateNames', 'other_names', 'otherNames'];
  const attributeFields = ['attributes', 'properties', 'characteristics', 'traits', 'details', 'metadata'];

  // Extract name/label (REQUIRED)
  let label = null;
  for (const field of nameFields) {
    if (entity[field] && typeof entity[field] === 'string' && entity[field].trim()) {
      label = entity[field].trim();
      break;
    }
  }

  if (!label) {
    console.warn('Entity missing name/label:', entity);
    return null;
  }

  // Extract ID (or generate from label)
  let id = null;
  for (const field of idFields) {
    if (entity[field] && typeof entity[field] === 'string' && entity[field].trim()) {
      id = entity[field].trim();
      break;
    }
  }
  if (!id) {
    id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  // Extract type/group
  let group = 'unknown';
  for (const field of typeFields) {
    if (entity[field] && typeof entity[field] === 'string' && entity[field].trim()) {
      group = entity[field].trim();
      break;
    }
  }

  // Extract aliases
  let aliases = 'None';
  for (const field of aliasFields) {
    if (entity[field]) {
      if (typeof entity[field] === 'string' && entity[field].trim()) {
        aliases = entity[field].trim();
        break;
      } else if (Array.isArray(entity[field]) && entity[field].length > 0) {
        aliases = entity[field].filter(a => a && typeof a === 'string').join(', ');
        break;
      }
    }
  }

  // Extract attributes
  let attributes = {};
  for (const field of attributeFields) {
    if (entity[field] && typeof entity[field] === 'object' && !Array.isArray(entity[field])) {
      attributes = entity[field];
      break;
    }
  }

  return {
    id,
    label,
    group,
    aliases,
    attributes
  };
}

// Normalize relationship field names
function normalizeRelationship(relationship) {
  if (!relationship || typeof relationship !== 'object') {
    console.warn('Invalid relationship:', relationship);
    return null;
  }

  // Possible field names for source entity
  const sourceFields = ['source', 'entity1_id', 'entity1', 'from', 'from_id', 'subject', 'subject_id'];
  // Possible field names for target entity
  const targetFields = ['target', 'entity2_id', 'entity2', 'to', 'to_id', 'object', 'object_id'];
  // Possible field names for relationship type
  const typeFields = ['type', 'relationship', 'relation', 'relationship_type', 'relationType', 'label'];
  // Possible field names for context
  const contextFields = ['context', 'description', 'details', 'note', 'explanation'];

  // Extract source
  let source = null;
  for (const field of sourceFields) {
    if (relationship[field] && typeof relationship[field] === 'string' && relationship[field].trim()) {
      source = relationship[field].trim();
      break;
    }
  }

  // Extract target
  let target = null;
  for (const field of targetFields) {
    if (relationship[field] && typeof relationship[field] === 'string' && relationship[field].trim()) {
      target = relationship[field].trim();
      break;
    }
  }

  // Extract type
  let type = 'related_to';
  for (const field of typeFields) {
    if (relationship[field] && typeof relationship[field] === 'string' && relationship[field].trim()) {
      type = relationship[field].trim();
      break;
    }
  }

  // Extract context
  let context = '';
  for (const field of contextFields) {
    if (relationship[field] && typeof relationship[field] === 'string' && relationship[field].trim()) {
      context = relationship[field].trim();
      break;
    }
  }

  if (!source || !target) {
    console.warn('Relationship missing source or target:', relationship);
    return null;
  }

  return {
    source,
    target,
    type,
    context
  };
}

// Function to remove duplicate entities and reassign their links
function deduplicateEntities(newEntities, existingEntities) {
  console.log('--- deduplicateEntities START ---');
  console.log('Input: newEntities length:', newEntities?.length);
  console.log('Input: existingEntities length:', existingEntities?.length);

  if (!Array.isArray(newEntities)) {
    console.error('newEntities is not an array:', newEntities);
    return { nodes: [], idMapping: {} };
  }

  const nodes = [];
  const seenNames = new Set();
  const idMapping = {}; // Maps duplicate IDs to the canonical ID we keep

  // Track existing entity names and IDs to avoid duplicates
  if (existingEntities && Array.isArray(existingEntities)) {
    existingEntities.forEach(node => {
      if (node && node.label) {
        seenNames.add(node.label.toLowerCase());
        // Map existing node ID to itself (canonical)
        idMapping[node.id] = node.id;
      }
    });
  }

  // Normalize and process new entities
  newEntities.forEach((entity, index) => {
    const normalized = normalizeEntity(entity);

    if (!normalized) {
      console.warn(`Entity ${index} failed normalization:`, entity);
      return;
    }

    const labelLower = normalized.label.toLowerCase();

    // Check if we've already seen this entity name
    const existingNode = existingEntities?.find(node =>
      node && node.label && node.label.toLowerCase() === labelLower
    );

    if (existingNode) {
      // This is a duplicate - map the new ID to the existing ID
      console.log(`Duplicate found: "${normalized.label}" (new ID: ${normalized.id}) maps to existing (ID: ${existingNode.id})`);
      idMapping[normalized.id] = existingNode.id;
      return;
    }

    if (seenNames.has(labelLower)) {
      // Duplicate within the new batch - find the canonical node
      const canonicalNode = nodes.find(n => n.label.toLowerCase() === labelLower);
      if (canonicalNode) {
        console.log(`Duplicate in batch: "${normalized.label}" (new ID: ${normalized.id}) maps to canonical (ID: ${canonicalNode.id})`);
        idMapping[normalized.id] = canonicalNode.id;
        return;
      }
    }

    // This is a new unique node
    seenNames.add(labelLower);
    idMapping[normalized.id] = normalized.id; // Maps to itself
    nodes.push(normalized);
    console.log(`Added entity ${nodes.length}: ${normalized.label} (ID: ${normalized.id})`);
  });

  console.log(`--- deduplicateEntities END: ${newEntities.length} -> ${nodes.length} ---`);
  console.log('ID Mappings created:', Object.keys(idMapping).length);

  return { nodes, idMapping };
}

// Function to remove duplicate links using ID mapping
function deduplicateLinks(newLinks, existingLinks, idMapping) {
  console.log('--- deduplicateLinks START ---');
  console.log('Input: newLinks length:', newLinks?.length);
  console.log('Input: existingLinks length:', existingLinks?.length);
  console.log('Input: idMapping entries:', Object.keys(idMapping || {}).length);

  if (!Array.isArray(newLinks)) {
    console.error('newLinks is not an array:', newLinks);
    return [];
  }

  const links = [];
  const seenKeys = new Set();

  // Track existing links with their canonical IDs
  if (existingLinks && Array.isArray(existingLinks)) {
    existingLinks.forEach(link => {
      if (link && link.source && link.target && link.type) {
        // Remap existing links in case they reference old IDs
        const canonicalSource = idMapping[link.source] || link.source;
        const canonicalTarget = idMapping[link.target] || link.target;
        const key = `${canonicalSource}|${canonicalTarget}|${link.type}`;
        seenKeys.add(key);
      }
    });
  }

  // Process new links
  newLinks.forEach((link, index) => {
    const normalized = normalizeRelationship(link);

    if (!normalized) {
      console.warn(`Link ${index} failed normalization:`, link);
      return;
    }

    // CRITICAL: Remap source and target to canonical IDs
    const canonicalSource = idMapping[normalized.source] || normalized.source;
    const canonicalTarget = idMapping[normalized.target] || normalized.target;

    // Log remapping if IDs changed
    if (canonicalSource !== normalized.source || canonicalTarget !== normalized.target) {
      console.log(`Remapping link: ${normalized.source} -> ${canonicalSource}, ${normalized.target} -> ${canonicalTarget}`);
    }

    // Skip self-links (node linking to itself)
    if (canonicalSource === canonicalTarget) {
      console.warn(`Skipping self-link: ${canonicalSource} -> ${canonicalTarget}`);
      return;
    }

    const key = `${canonicalSource}|${canonicalTarget}|${normalized.type}`;

    if (seenKeys.has(key)) {
      console.log(`Skipping duplicate link: ${key}`);
      return;
    }

    seenKeys.add(key);
    links.push({
      source: canonicalSource,
      target: canonicalTarget,
      type: normalized.type,
      context: normalized.context
    });
    console.log(`Added link ${links.length}: ${canonicalSource} -> ${canonicalTarget} (${normalized.type})`);
  });

  console.log(`--- deduplicateLinks END: ${newLinks.length} -> ${links.length} ---`);
  return links;
}

function MapGenerator() {
  const url = 'http://10.163.7.106:5000/characters/extract';

  const { currentUser } = useAuthValue()
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');
  const [isCleanupMode, setIsCleanupMode] = useState(false);
  const navigate = useNavigate()

  const cleanupDatabase = async () => {
    if (!window.confirm('This will clean up invalid nodes and links. Continue?')) {
      return;
    }

    setIsLoading(true);
    setExtractionProgress('Reading database...');

    try {
      const graphRef = ref(database, `stories/${currentUser.uid}/graph`);
      const graphSnapshot = await get(graphRef);

      if (!graphSnapshot.exists()) {
        alert('No graph data found.');
        setIsLoading(false);
        return;
      }

      const existingGraph = graphSnapshot.val();
      const rawNodes = Array.isArray(existingGraph.nodes) ? existingGraph.nodes : [];
      const rawLinks = Array.isArray(existingGraph.links) ? existingGraph.links : [];

      console.log('=== CLEANUP: BEFORE ===');
      console.log('Raw nodes:', rawNodes.length);
      console.log('Raw links:', rawLinks.length);

      setExtractionProgress('Cleaning nodes...');

      // Clean nodes: remove null/undefined and duplicates
      const cleanedNodes = [];
      const seenIds = new Set();
      const seenNames = new Set();

      rawNodes.forEach((node, index) => {
        // Skip invalid nodes
        if (!node || !node.id || !node.label) {
          console.warn(`Removing invalid node at index ${index}:`, node);
          return;
        }

        const labelLower = node.label.toLowerCase();

        // Skip duplicate IDs
        if (seenIds.has(node.id)) {
          console.warn(`Removing duplicate ID: ${node.id} (${node.label})`);
          return;
        }

        // Skip duplicate names
        if (seenNames.has(labelLower)) {
          console.warn(`Removing duplicate name: ${node.label} (ID: ${node.id})`);
          return;
        }

        seenIds.add(node.id);
        seenNames.add(labelLower);
        cleanedNodes.push(node);
      });

      setExtractionProgress('Cleaning links...');

      // Build valid node ID set
      const validNodeIds = new Set(cleanedNodes.map(n => n.id));

      // Clean links: remove invalid and duplicates
      const cleanedLinks = [];
      const seenLinkKeys = new Set();

      rawLinks.forEach((link, index) => {
        // Skip invalid links
        if (!link || !link.source || !link.target || !link.type) {
          console.warn(`Removing invalid link at index ${index}:`, link);
          return;
        }

        // Skip links with non-existent nodes
        if (!validNodeIds.has(link.source)) {
          console.warn(`Removing link with invalid source: ${link.source} -> ${link.target}`);
          return;
        }

        if (!validNodeIds.has(link.target)) {
          console.warn(`Removing link with invalid target: ${link.source} -> ${link.target}`);
          return;
        }

        // Skip self-links
        if (link.source === link.target) {
          console.warn(`Removing self-link: ${link.source} -> ${link.target}`);
          return;
        }

        // Skip duplicate links
        const linkKey = `${link.source}|${link.target}|${link.type}`;
        if (seenLinkKeys.has(linkKey)) {
          console.warn(`Removing duplicate link: ${linkKey}`);
          return;
        }

        seenLinkKeys.add(linkKey);
        cleanedLinks.push(link);
      });

      console.log('=== CLEANUP: AFTER ===');
      console.log('Cleaned nodes:', cleanedNodes.length);
      console.log('Cleaned links:', cleanedLinks.length);
      console.log('Nodes removed:', rawNodes.length - cleanedNodes.length);
      console.log('Links removed:', rawLinks.length - cleanedLinks.length);

      setExtractionProgress('Saving cleaned data...');

      // Save cleaned data back to Firebase
      await set(graphRef, {
        nodes: cleanedNodes,
        links: cleanedLinks
      });

      setExtractionProgress('Complete!');
      alert(`Cleanup complete!\n\nNodes: ${rawNodes.length} → ${cleanedNodes.length}\nLinks: ${rawLinks.length} → ${cleanedLinks.length}`);

      setIsLoading(false);
      setExtractionProgress('');

    } catch (error) {
      console.error('Cleanup failed:', error);
      alert(`Cleanup failed: ${error.message}`);
      setIsLoading(false);
      setExtractionProgress('');
    }
  };


  const handleSubmit = async () => {
    setIsLoading(true);
    setExtractionProgress('Saving text...');

    const summaryRef = ref(database, `stories/${currentUser.uid}/summary`);
    const graphRef = ref(database, `stories/${currentUser.uid}/graph`);

    const summarySnapshot = await get(summaryRef);
    const graphSnapshot = await get(graphRef);

    if (summarySnapshot.exists()) {
      const existingSummary = summarySnapshot.val();
      const updatedSummary = `${existingSummary}\n-----------\n${text}`;
      await set(summaryRef, updatedSummary);
    } else {
      await set(summaryRef, text);
    }

    setExtractionProgress('Extracting characters (this may take up to 5 minutes for long texts)...');

    try {
      const response = await axios.post(url,
        { text: text },
        {
          timeout: 360000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      setExtractionProgress('Processing results...');

      if (!response.data) {
        throw new Error('No data received from server');
      }

      const entities = response.data.entities || [];
      const relationships = response.data.relationships || [];

      console.log('=== SERVER RESPONSE ===');
      console.log('Received entities:', entities.length);
      console.log('Received relationships:', relationships.length);

      if (!Array.isArray(entities)) {
        throw new Error('Invalid entities format received');
      }

      if (!Array.isArray(relationships)) {
        throw new Error('Invalid relationships format received');
      }

      const existingGraph = graphSnapshot.exists() ? graphSnapshot.val() : {};
      const rawExistingNodes = Array.isArray(existingGraph.nodes) ? existingGraph.nodes : [];
      const rawExistingLinks = Array.isArray(existingGraph.links) ? existingGraph.links : [];

      console.log('=== EXISTING DATA (RAW) ===');
      console.log('Raw existing nodes:', rawExistingNodes.length);
      console.log('Raw existing links:', rawExistingLinks.length);

      // Clean existing data
      const existingNodes = rawExistingNodes.filter((node, index) => {
        if (!node) {
          console.warn(`Filtering out null/undefined existing node at index ${index}`);
          return false;
        }
        if (!node.id || !node.label) {
          console.warn(`Filtering out invalid existing node at index ${index}:`, node);
          return false;
        }
        return true;
      });

      const existingLinks = rawExistingLinks.filter((link, index) => {
        if (!link) {
          console.warn(`Filtering out null/undefined existing link at index ${index}`);
          return false;
        }
        if (!link.source || !link.target || !link.type) {
          console.warn(`Filtering out invalid existing link at index ${index}:`, link);
          return false;
        }
        return true;
      });

      console.log('=== EXISTING DATA (CLEANED) ===');
      console.log('Clean existing nodes:', existingNodes.length);
      console.log('Clean existing links:', existingLinks.length);

      // Deduplicate entities and get ID mapping
      const { nodes: deduplicatedNodes, idMapping } = deduplicateEntities(entities, existingNodes);

      console.log('=== AFTER ENTITY DEDUPLICATION ===');
      console.log('Unique new nodes:', deduplicatedNodes.length);
      console.log('ID mappings:', Object.keys(idMapping).length);

      // Deduplicate links using the ID mapping
      const deduplicatedLinks = deduplicateLinks(relationships, existingLinks, idMapping);

      console.log('=== AFTER LINK DEDUPLICATION ===');
      console.log('Unique new links:', deduplicatedLinks.length);

      // Validate new data
      const validNewNodes = deduplicatedNodes.filter(node => {
        if (!node) {
          console.warn('Filtering out null/undefined new node');
          return false;
        }
        if (!node.id || !node.label) {
          console.warn('Filtering out new node with missing required fields:', node);
          return false;
        }
        return true;
      });

      const validNewLinks = deduplicatedLinks.filter(link => {
        if (!link) {
          console.warn('Filtering out null/undefined new link');
          return false;
        }
        if (!link.source || !link.target || !link.type) {
          console.warn('Filtering out new link with missing required fields:', link);
          return false;
        }
        return true;
      });

      console.log('=== AFTER VALIDATION ===');
      console.log('Valid new nodes:', validNewNodes.length);
      console.log('Valid new links:', validNewLinks.length);

      // Combine arrays
      const finalNodes = [...existingNodes, ...validNewNodes];

      // Build a Set of all valid node IDs
      const validNodeIds = new Set(finalNodes.map(node => node.id));

      console.log('=== VALIDATING FINAL LINKS ===');
      console.log('Valid node IDs:', validNodeIds.size);

      // Validate that all links reference existing nodes
      const validatedLinks = [...existingLinks, ...validNewLinks].filter(link => {
        const sourceExists = validNodeIds.has(link.source);
        const targetExists = validNodeIds.has(link.target);

        if (!sourceExists || !targetExists) {
          console.warn(`Filtering out link with invalid node references:`, {
            source: link.source,
            sourceExists,
            target: link.target,
            targetExists,
            type: link.type
          });
          return false;
        }

        return true;
      });

      console.log('=== FINAL DATA TO SAVE ===');
      console.log('Total nodes:', finalNodes.length);
      console.log('Total links (before final validation):', existingLinks.length + validNewLinks.length);
      console.log('Total links (after final validation):', validatedLinks.length);

      // Final sanity check
      const nodesHaveUndefined = finalNodes.some(n => n === null || n === undefined);
      const linksHaveUndefined = validatedLinks.some(l => l === null || l === undefined);

      if (nodesHaveUndefined) {
        console.error('❌ CRITICAL: finalNodes contains undefined/null values!');
        throw new Error('Cannot save: nodes array contains invalid values');
      }

      if (linksHaveUndefined) {
        console.error('❌ CRITICAL: validatedLinks contains undefined/null values!');
        throw new Error('Cannot save: links array contains invalid values');
      }

      // Save to Firebase
      await set(graphRef, {
        nodes: finalNodes,
        links: validatedLinks
      });

      console.log('✅ Successfully saved to Firebase');

      setExtractionProgress('Complete!');
      setText('');
      setIsLoading(false);

      setTimeout(() => {
        navigate('/story-map');
      }, 500);

    } catch (error) {
      console.error('❌ Extraction failed:', error);
      console.error('Error details:', error.response?.data || error.message);
      setIsLoading(false);
      setExtractionProgress('');

      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        alert('The text is too long to process. Please split it into smaller sections (about 1000 words each).');
      } else {
        alert(`Extraction failed: ${error.message || 'Unknown error'}\n\nCheck the console (F12) for details.`);
      }
    }
  };

  return (
    <div className="map-generator-container">
      {/* Toggle Cleanup Mode */}
      <div className="mode-toggle" style={{ marginBottom: '10px' }}>
        <label>
          <input
            type="checkbox"
            checked={isCleanupMode}
            onChange={(e) => setIsCleanupMode(e.target.checked)}
          />
          <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>
            Show Cleanup Tools
          </span>
        </label>
      </div>

      {/* Cleanup Button (only shows when cleanup mode enabled) */}
      {isCleanupMode && (
        <div className="cleanup-section" style={{ 
          padding: '15px', 
          marginBottom: '15px', 
          backgroundColor: '#fff3cd', 
          border: '2px solid #ffc107',
          borderRadius: '8px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
            🧹 Database Cleanup
          </h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#856404' }}>
            This will remove:
            <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
              <li>Null/undefined nodes and links</li>
              <li>Duplicate nodes (by ID or name)</li>
              <li>Links referencing non-existent nodes</li>
              <li>Self-links (node linking to itself)</li>
              <li>Duplicate links</li>
            </ul>
          </p>
          <button
            onClick={cleanupDatabase}
            disabled={isLoading}
            className="map-generator-btn"
            style={{ 
              backgroundColor: '#ffc107', 
              color: '#000',
              fontWeight: 'bold'
            }}
          >
            {isLoading ? "Cleaning..." : "🧹 Clean Database"}
          </button>
        </div>
      )}

      <textarea
        rows="20"
        cols="100"
        className="map-generator-textarea"
        type="text"
        value={text}
        required
        placeholder="Enter your plot in as much detail as possible."
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading}
      />

      <div className="map-generator-buttons">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="map-generator-btn save-btn"
        >
          {isLoading ? "Processing..." : "Save"}
        </button>
      </div>

      {isLoading && extractionProgress && (
        <div className="progress-message">
          {extractionProgress}
        </div>
      )}
    </div>
  );
}

export default MapGenerator;