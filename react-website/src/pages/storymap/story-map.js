import { useState, useEffect, useCallback, useRef } from 'react';
import 'firebase/database';
import { set, ref, get, onValue, orderByChild, equalTo, query, update, remove } from "firebase/database";
import { useAuthValue } from '../../Firebase/AuthContext';
import { database } from '../../Firebase/firebase';
import Graph from '../../components/storymap/Graph';
import GraphModal from '../../components/storymap/graph-modal';
import { Input, Button, Modal, Box } from '@mui/material';
import { v4 as uuidv4 } from "uuid";
import { sha256 } from 'js-sha256';
import NewNodeModal from '../../components/storymap/NewNodeModal';
import NewLinkModal from '../../components/storymap/NewLinkModal';
import EditLinkModal from '../../components/storymap/EditLinkModal';
import StoryMapAnalysis from '../../components/storymap/StoryMapAnalysis';
import AnalysisPanel from '../../components/storymap/AnalysisPanel';

import {
  logStoryMapRender,
  logNodeAction,
  logLinkAction,
  logNodeMerge,
  logAnalysisPanelInteraction,
  logViewToggle,
  logMergeModeAction,
  trackAnalysisPanelTime
} from '../../utils/analytics';

// page-level and UI interaction tracking
import { logPageView, logPageExit, logUIInteraction } from '../../utils/analytics';

import './story-map.css';

// How long (ms) after a generation or analysis event to watch for manual edits.
// If the user edits within this window we fire the editedAfter* flag.
const EDIT_WATCH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function StoryMap() {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;
  const [data, setData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewNodeModalOpen, setIsNewNodeModalOpen] = useState(false);
  const [isNewLinkModalOpen, setIsNewLinkModalOpen] = useState(false);
  const [isEditLinkModalOpen, setIsEditLinkModalOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState(null);
  const [newLinkSource, setNewLinkSource] = useState("");
  const [newLinkTarget, setNewLinkTarget] = useState("");
  const [notification, setNotification] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [cachedAnalysis, setCachedAnalysis] = useState(null);
  const [shouldRegenerate, setShouldRegenerate] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [panelTimeTracker, setPanelTimeTracker] = useState(null);
  const [sessionStartTime] = useState(Date.now());
  const [actionCount, setActionCount] = useState(0);

  // track when the last AI generation and last AI analysis happened
  // so we can detect whether subsequent manual edits fall within the watch window
  const lastGenerationTimeRef = useRef(null);
  const lastAnalysisTimeRef = useRef(null);

  // flags to avoid firing the same editedAfter event more than once per generation/analysis
  const editedAfterGenerationFiredRef = useRef(false);
  const editedAfterAnalysisFiredRef = useRef(false);

  const graphRef = ref(database, `stories/${userId}/graph/`);

  // page view on mount, page exit on unmount
  useEffect(() => {
    if (!userId) return;

    const entryTime = Date.now();
    logPageView(userId, 'storyMap', 'modelling');

    return () => {
      const duration = Date.now() - entryTime;
      logPageExit(userId, 'storyMap', duration);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const generatedAt = sessionStorage.getItem('storyMapGeneratedAt');
    if (generatedAt) {
      lastGenerationTimeRef.current = parseInt(generatedAt);
      editedAfterGenerationFiredRef.current = false;
      sessionStorage.removeItem('storyMapGeneratedAt');
    }
  }, [userId]);

  useEffect(() => {
    if (userId && data.nodes.length > 0) {
      logStoryMapRender(userId, data.nodes, data.links);
    }
  }, [userId]);

  useEffect(() => {
    if (selectedNode) {
      setTextInput(selectedNode.text);
    }
  }, [selectedNode]);

  const showNotification = () => {
    setNotification(true);
    setTimeout(() => setNotification(false), 2000);
  };

  const openModal = (node) => {
    setSelectedNode(node);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedNode(null);
    setIsModalOpen(false);
  };

  const getNodeSize = (level) => {
    return 10 / level;
  };

  const checkEditedAfterGeneration = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    if (
      lastGenerationTimeRef.current &&
      !editedAfterGenerationFiredRef.current &&
      now - lastGenerationTimeRef.current <= EDIT_WATCH_WINDOW_MS
    ) {
      editedAfterGenerationFiredRef.current = true;
      logUIInteraction(userId, 'storyMap', 'edited_after_generation', {
        msAfterGeneration: now - lastGenerationTimeRef.current
      });
    }
  }, [userId]);

  const checkEditedAfterAnalysis = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    if (
      lastAnalysisTimeRef.current &&
      !editedAfterAnalysisFiredRef.current &&
      now - lastAnalysisTimeRef.current <= EDIT_WATCH_WINDOW_MS
    ) {
      editedAfterAnalysisFiredRef.current = true;
      logUIInteraction(userId, 'storyMap', 'edited_after_analysis', {
        msAfterAnalysis: now - lastAnalysisTimeRef.current
      });
    }
  }, [userId]);

  const handleSaveClick = useCallback(async () => {
    if (!selectedNode) return;

    const updatedData = {
      nodes: data.nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, text: textInput } : node
      ),
      links: data.links,
    };

    const nodeRef = ref(database, `stories/${userId}/graph/nodes`);
    const q = query(nodeRef, orderByChild("id"), equalTo(selectedNode.id));

    try {
      const snapshot = await get(q);
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const nodeKey = childSnapshot.key;
          update(ref(database, `stories/${userId}/graph/nodes/${nodeKey}`), { text: textInput });
        });
      }
    } catch (error) {
      console.error("Error updating node:", error);
    }

    setData(updatedData);
    setIsModalOpen(false);
  }, [data, selectedNode, textInput, userId]);

  const handleNodeClick = (node) => {
    if (mergeMode) {
      if (selectedForMerge.length === 0) {
        logMergeModeAction(userId, 'select_first', [node.id]);
        setSelectedForMerge([node]);
      } else if (selectedForMerge.length === 1) {
        if (selectedForMerge[0].id === node.id) {
          alert('Please select a different node');
          return;
        }

        logMergeModeAction(userId, 'select_second', [selectedForMerge[0].id, node.id]);

        const confirmMerge = window.confirm(
          `Merge "${selectedForMerge[0].label}" into "${node.label}"?\n\n` +
          `This will:\n` +
          `• Keep "${node.label}" as the primary node\n` +
          `• Combine all relationships and aliases\n` +
          `• Delete "${selectedForMerge[0].label}"\n\n` +
          `This cannot be undone.`
        );

        if (confirmMerge) {
          const mergeStartTime = Date.now();
          handleMergeNodes([selectedForMerge[0].id, node.id], node.label);

          const mergeTime = Date.now() - mergeStartTime;
          logNodeMerge(userId, 2, node.label, mergeTime);
          logMergeModeAction(userId, 'complete', [selectedForMerge[0].id, node.id]);
        }

        setMergeMode(false);
        setSelectedForMerge([]);
        logMergeModeAction(userId, 'exit');
      }
    } else {
      console.log("Clicked node: ", node);
      setSelectedNode(node);
      setIsModalOpen(true);
      logNodeAction(userId, 'view', node);
    }
  };

  const handleLinkClick = (link) => {
    setSelectedLink(link);
    setIsEditLinkModalOpen(true);
    logLinkAction(userId, 'view', link);
  };

  const updateNode = (updatedNode) => {
    console.log("Updating: ", updatedNode);

    setData((prevData) => {
      const updatedNodes = prevData.nodes.map((node) =>
        node.id === updatedNode.id ? { ...node, ...updatedNode } : node
      );
      return { ...prevData, nodes: updatedNodes };
    });

    setTimeout(() => {
      console.log("Updated Nodes: ", data.nodes);
    }, 100);

    if (updatedNode.id) {
      const nodeIndex = data.nodes.findIndex((node) => node.id === updatedNode.id);
      console.log("Updated Node: ", updatedNode);
      if (nodeIndex !== -1) {
        set(ref(database, `stories/${currentUser.uid}/graph/nodes/${nodeIndex}`), updatedNode)
          .then(() => console.log("Node successfully updated in Firebase"))
          .catch((error) => console.error("Error updating node: ", error));
      } else {
        console.error("Error: Node with ID not found in dataset");
      }

      logNodeAction(userId, 'edit', updatedNode);
      setActionCount(prev => prev + 1);

      // check if this edit falls within a post-generation or post-analysis window
      checkEditedAfterGeneration();
      checkEditedAfterAnalysis();

    } else {
      console.error("Error: updatedNode.id is undefined");
    }
  };

  const deleteNode = (nodeId) => {
    const nodeIndex = data.nodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex === -1) return;

    const nodeData = data.nodes[nodeIndex];

    const linkIndices = data.links
      .map((link, linkIndex) => (link.source === nodeId || link.target === nodeId ? linkIndex : -1))
      .filter((linkIndex) => linkIndex !== -1);

    setData((prevData) => {
      const updatedNodes = prevData.nodes.filter((node) => node.id !== nodeId);
      const updatedLinks = prevData.links.filter((link) => link.source !== nodeId && link.target !== nodeId);

      remove(ref(database, `stories/${currentUser.uid}/graph/nodes/${nodeIndex}`));

      linkIndices.forEach((linkIndex) => {
        remove(ref(database, `stories/${currentUser.uid}/graph/links/${linkIndex}`));
      });

      logNodeAction(userId, 'delete', nodeData);
      setActionCount(prev => prev + 1);

      // deletion is also a manual edit
      checkEditedAfterGeneration();
      checkEditedAfterAnalysis();

      return { ...prevData, nodes: updatedNodes, links: updatedLinks };
    });
  };

  const addNode = () => {
    setIsNewNodeModalOpen(true);
  };

  const closeNewNodeModal = () => {
    setIsNewNodeModalOpen(false);
  };

  const saveNewNode = async (nodeDetails) => {
    const startTime = Date.now();
    const { label, aliases } = nodeDetails;

    const existingNode = data.nodes.find(node =>
      node.label.toLowerCase() === label.toLowerCase() ||
      node.aliases.split(",").map(a => a.trim().toLowerCase()).includes(label.toLowerCase())
    );

    if (existingNode) {
      const confirmAdd = window.confirm(`A node with this name or alias already exists: ${existingNode.label}. Do you still want to proceed?`);
      if (!confirmAdd) return;
    }

    const id = sha256(label);
    const newNode = {
      id: id,
      label: label,
      aliases: aliases || "",
      group: "Uncategorized",
      hidden: false,
      level: 1,
      note: ""
    };

    setData((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));

    set(ref(database, `stories/${userId}/graph/nodes/${data.nodes.length}`), newNode)
      .then(showNotification)
      .catch((error) => console.error("Error adding node:", error));

    const processingTime = Date.now() - startTime;
    await logNodeAction(userId, 'create', newNode, processingTime);

    setActionCount(prev => prev + 1);

    // adding a node is a manual edit
    checkEditedAfterGeneration();
    checkEditedAfterAnalysis();

    closeNewNodeModal();
  };

  const openNewLinkModal = () => {
    setIsNewLinkModalOpen(true);
  };

  const closeNewLinkModal = () => {
    setIsNewLinkModalOpen(false);
  };

  const openEditLinkModal = (link) => {
    setSelectedLink(link);
    setIsEditLinkModalOpen(true);
  };

  const closeEditLinkModal = () => {
    setSelectedLink(null);
    setIsEditLinkModalOpen(false);
  };

  const saveNewLink = (linkDetails) => {
    const { context, source, target, type } = linkDetails;

    if (source === target) {
      console.log("Source: ", source, " Target: ", target);
      alert("Source and target must be different.");
      return;
    }

    if (!source || !target) {
      alert("Source and target must not be empty.");
      return;
    }

    const existingLink = data.links.find(
      (link) => link.source === source && link.target === target
    );

    if (existingLink) {
      alert("A link with the same source and target already exists.");
      return;
    }

    const newLink = {
      context: context || "",
      source,
      target,
      type: type || "Unspecified"
    };

    setData((prev) => ({ ...prev, links: [...prev.links, newLink] }));

    set(ref(database, `stories/${userId}/graph/links/${data.links.length}`), newLink)
      .then(showNotification)
      .catch((error) => console.error("Error adding link:", error));

    logLinkAction(userId, 'create', newLink);
    setActionCount(prev => prev + 1);

    // adding a link is a manual edit
    checkEditedAfterGeneration();
    checkEditedAfterAnalysis();

    closeNewLinkModal();
  };

  const saveEditedLink = (linkDetails) => {
    const { context, source, target, type } = linkDetails;
    console.log(source, target, type, context);

    if (source === target) {
      console.log("Source: ", source, " Target: ", target);
      alert("Source and target must be different.");
      return;
    }

    if (!source || !target) {
      alert("Source and target must not be empty.");
      return;
    }

    const existingLink = data.links.find(
      (link) => link.source === source && link.target === target && link !== selectedLink
    );

    if (existingLink) {
      alert("A link with the same source and target already exists.");
      return;
    }

    setData((prev) => {
      const updatedLinks = prev.links.map((link) =>
        link.source === selectedLink.source && link.target === selectedLink.target
          ? { ...link, source, target, type }
          : link
      );
      return { ...prev, links: updatedLinks };
    });

    const linkIndex = data.links.findIndex(
      (link) => link.source === selectedLink.source && link.target === selectedLink.target
    );
    if (linkIndex !== -1) {
      set(ref(database, `stories/${userId}/graph/links/${linkIndex}`), { context, source, target, type })
        .then(showNotification)
        .catch((error) => console.error("Error updating link:", error));
    }

    logLinkAction(userId, 'edit', { ...linkDetails, source, target, type });
    setActionCount(prev => prev + 1);

    // editing a link is a manual edit
    checkEditedAfterGeneration();
    checkEditedAfterAnalysis();

    closeEditLinkModal();
  };

  const assignLevels = (snapshotData) => {
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();

    const getLinks = (nodeId) => {
      return snapshotData.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };

    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };

    const removeLink = (linkToRemove) => {
      snapshotData.links.splice(snapshotData.links.findIndex((link) => link === linkToRemove), 1);
    };

    const rootNodeNames = new Set(snapshotData.nodes.map(node => node.id));

    snapshotData.links.forEach(link => {
      if (!snapshotData.nodes.some(node => node.id === link.source) || !snapshotData.nodes.some(node => node.id === link.target)) {
        removeLink(link);
      } else {
        rootNodeNames.delete(link.target);
        if (snapshotData.links.some((l) => isTwoWayLinked(link, l))) {
          rootNodeNames.add(link.source);
          removeLink(snapshotData.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
        }
      }
    });

    const queue = Array.from(rootNodeNames, rootNodeName => ({ id: rootNodeName, level: 1 }));
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      visited.add(id);

      const children = getLinks(id);
      const childNodes = children.map((link) => ({ id: link.target, level: level + 1 }));
      queue.push(...childNodes);

      if (!nodes.has(id)) {
        nodes.set(id, level);
      } else if (nodes.get(id) > level) {
        nodes.set(id, level);
      }

      children.forEach((link) => {
        if (visited.has(link.target)) {
          links.add(JSON.stringify({
            type: link.type,
            source: link.source,
            target: link.target,
            context: link.context || ""
          }));
        } else {
          links.add(JSON.stringify(link));
        }
      });
    }

    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

    const finalNodes = snapshotData.nodes.filter((node) => nodes.has(node.id)).map((node) => ({
      ...node,
      id: node.id,
      label: node.label,
      level: nodes.get(node.id),
      note: node.note || "",
      group: node.group,
      aliases: node.aliases,
      hidden: false
    }));

    return { nodes: finalNodes, links: flattenedLinks };
  };

  function onGraphData(snapshot) {
    if (snapshot.exists()) {
      const snapshotData = snapshot.val();
      const nodes_links = assignLevels(snapshotData);

      const finalNodes = nodes_links.nodes.map((node) => ({ ...node, hidden: false }));
      const finalLinks = nodes_links.links.map((link) => ({
        type: link.type,
        source: link.source,
        target: link.target,
        context: link.context || "None"
      }));

      setData({ nodes: finalNodes, links: finalLinks });

      setTextInput("");
      setSelectedNode({});
      setSelectedLink({});
    }
  }

  const handleMergeNodes = (nodeIds, primaryName) => {
    if (nodeIds.length < 2) return;

    const confirmMerge = window.confirm(
      `Merge ${nodeIds.length} nodes into "${primaryName}"?\n\n` +
      `This will:\n` +
      `• Keep "${primaryName}" as the primary node\n` +
      `• Combine all relationships\n` +
      `• Delete duplicate nodes\n\n` +
      `This cannot be undone.`
    );

    if (!confirmMerge) return;

    const nodesToMerge = nodeIds
      .map(id => data.nodes.find(n => n.id === id))
      .filter(Boolean);

    if (nodesToMerge.length < 2) {
      alert('Could not find all nodes to merge');
      return;
    }

    let primaryNode = nodesToMerge.find(n => n.label === primaryName);
    if (!primaryNode) {
      primaryNode = { ...nodesToMerge[0] };
      primaryNode.label = primaryName;
    } else {
      primaryNode = { ...primaryNode };
    }

    const allAliases = nodesToMerge
      .flatMap(n => {
        if (!n.aliases) return [];
        if (typeof n.aliases === 'string') {
          return n.aliases.split(',').map(a => a.trim()).filter(Boolean);
        }
        if (Array.isArray(n.aliases)) {
          return n.aliases.map(a => String(a).trim()).filter(Boolean);
        }
        return [];
      })
      .filter(a => a !== primaryName);
    primaryNode.aliases = allAliases.length > 0 ? [...new Set(allAliases)].join(', ') : '';

    const allNotes = nodesToMerge.map(n => n.note).filter(Boolean);
    primaryNode.note = allNotes.length > 0 ? allNotes.join('\n---\n') : '';

    const updatedLinks = data.links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return {
        type: link.type || 'Unspecified',
        source: nodeIds.includes(sourceId) ? primaryNode.id : sourceId,
        target: nodeIds.includes(targetId) ? primaryNode.id : targetId,
        context: link.context || ''
      };
    });

    const uniqueLinks = [];
    const seen = new Set();
    for (const link of updatedLinks) {
      const key = `${link.source}|${link.target}|${link.type}`;
      if (!seen.has(key) && link.source !== link.target) {
        seen.add(key);
        uniqueLinks.push(link);
      }
    }

    const updatedNodes = data.nodes
      .filter(n => n.id === primaryNode.id || !nodeIds.includes(n.id))
      .map(n => {
        if (n.id === primaryNode.id) {
          return {
            id: primaryNode.id,
            label: primaryNode.label || '',
            aliases: primaryNode.aliases || '',
            note: primaryNode.note || '',
            group: primaryNode.group || 'Uncategorized',
            level: primaryNode.level || 1,
            hidden: false
          };
        }
        return {
          id: n.id,
          label: n.label || '',
          aliases: n.aliases || '',
          note: n.note || '',
          group: n.group || 'Uncategorized',
          level: n.level || 1,
          hidden: false
        };
      });

    const cleanedLinks = uniqueLinks.map(link => ({
      type: String(link.type || 'Unspecified'),
      source: String(link.source),
      target: String(link.target),
      context: String(link.context || '')
    }));

    setData({ nodes: updatedNodes, links: cleanedLinks });

    const graphRefLocal = ref(database, `stories/${currentUser.uid}/graph/`);
    set(graphRefLocal, { nodes: updatedNodes, links: cleanedLinks })
      .then(() => {
        showNotification();
        alert(`Successfully merged ${nodesToMerge.length} nodes into "${primaryName}"`);
      })
      .catch(error => {
        console.error("Error saving merge:", error);
        alert('Failed to save merge: ' + error.message);
      });
  };

  // ✅ UPDATED: record analysis time so subsequent edits can be flagged
  const handleRegenerateAnalysis = () => {
    setShouldRegenerate(true);
    setShowAnalysis(true);

    const tracker = trackAnalysisPanelTime(userId);
    setPanelTimeTracker(() => tracker);
    logAnalysisPanelInteraction(userId, 'open');
  };

  const handleViewFeedback = () => {
    setShouldRegenerate(false);
    setShowAnalysis(true);

    const tracker = trackAnalysisPanelTime(userId);
    setPanelTimeTracker(() => tracker);
    logAnalysisPanelInteraction(userId, 'open');
  };

  const toggleMergeMode = () => {
    const newMergeMode = !mergeMode;
    setMergeMode(!mergeMode);
    setSelectedForMerge([]);

    if (newMergeMode) {
      logMergeModeAction(userId, 'enter');
    } else {
      logMergeModeAction(userId, 'exit');
    }
  };

  // ✅ UPDATED: record that analysis just completed so we can watch for subsequent edits
  const handleAnalysisComplete = (analysisResult) => {
    setCachedAnalysis(analysisResult);
    setShouldRegenerate(false);

    // Record analysis time and reset the editedAfterAnalysis flag
    lastAnalysisTimeRef.current = Date.now();
    editedAfterAnalysisFiredRef.current = false;
  };

  useEffect(() => {
    return () => {
      const sessionDuration = Date.now() - sessionStartTime;
      console.log('[StoryMap Analytics] Session ended', {
        duration: sessionDuration,
        actionCount,
        userId
      });

      if (panelTimeTracker) {
        panelTimeTracker();
      }
    };
  }, [sessionStartTime, actionCount, panelTimeTracker, userId]);

  return (
    <div>
      <div className="story-map-buttons">
        <button
          onClick={() => onValue(graphRef, onGraphData)}
          className="story-map-btn render-btn"
        >
          Render Graph
        </button>

        <button
          onClick={addNode}
          className="story-map-btn add-node-btn"
        >
          + Add Node
        </button>

        <button
          onClick={openNewLinkModal}
          className="story-map-btn add-link-btn"
        >
          + Add Link
        </button>

        <button
          onClick={toggleMergeMode}
          className={`story-map-btn ${mergeMode ? 'merge-btn-active' : 'merge-btn'}`}
          title="Click to enter merge mode, then click two nodes to merge them"
        >
          {mergeMode ? '✓ Merge Mode Active' : '🔀 Merge Nodes'}
        </button>

        {cachedAnalysis ? (
          <>
            <button onClick={handleViewFeedback} className="story-map-btn view-feedback-btn">
              📊 View Feedback
            </button>
            <button onClick={handleRegenerateAnalysis} className="story-map-btn analyze-btn">
              🔄 Regenerate Analysis
            </button>
          </>
        ) : (
          <button onClick={handleRegenerateAnalysis} className="story-map-btn analyze-btn">
            🔍 Analyze Structure
          </button>
        )}
      </div>

      {mergeMode && (
        <div style={{
          padding: '12px 16px',
          background: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: '8px',
          margin: '12px 0',
          color: '#92400E',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '18px' }}>ℹ️</span>
          <div>
            <strong>Merge Mode Active:</strong>
            {selectedForMerge.length === 0 ? (
              <> Click the first node (this will be deleted)</>
            ) : (
              <> Click the second node (this will be kept). Selected: <strong>{selectedForMerge[0].label}</strong></>
            )}
          </div>
        </div>
      )}

      <div className="graph-container">
        <Graph
          data={data}
          getNodeSize={getNodeSize}
          handleNodeClick={handleNodeClick}
          handleLinkClick={handleLinkClick}
          nodeAutoColorBy="id"
        />
      </div>

      {showAnalysis && (
        <AnalysisPanel
          isOpen={showAnalysis}
          onClose={() => setShowAnalysis(false)}
        >
          <StoryMapAnalysis
            data={data}
            onMergeNodes={handleMergeNodes}
            autoAnalyze={shouldRegenerate}
            cachedAnalysis={shouldRegenerate ? null : cachedAnalysis}
            onAnalysisComplete={handleAnalysisComplete}
          />
        </AnalysisPanel>
      )}

      {selectedNode && (
        <GraphModal
          isModalOpen={isModalOpen}
          handleCloseModal={closeModal}
          selectedNode={selectedNode}
          updateNode={updateNode}
          deleteNode={deleteNode}
        />
      )}
      <NewNodeModal
        isOpen={isNewNodeModalOpen}
        closeModal={closeNewNodeModal}
        onSave={saveNewNode}
      />
      <NewLinkModal
        isOpen={isNewLinkModalOpen}
        closeModal={closeNewLinkModal}
        onSave={saveNewLink}
        nodes={data.nodes}
      />
      {selectedLink && (
        <EditLinkModal
          isOpen={isEditLinkModalOpen}
          closeModal={closeEditLinkModal}
          onSave={saveEditedLink}
          link={selectedLink}
          nodes={data.nodes}
        />
      )}
    </div>
  );
}

export default StoryMap;