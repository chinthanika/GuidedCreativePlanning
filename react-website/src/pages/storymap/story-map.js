import { useState, useEffect, useCallback } from 'react';
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

import './story-map.css';

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

  const graphRef = ref(database, `stories/${userId}/graph/`);

  useEffect(() => {
    if (selectedNode) {
      setTextInput(selectedNode.text);
    }
  }, [selectedNode]);

  const showNotification = () => {
    setNotification(true);
    setTimeout(() => setNotification(false), 2000);
  };

  // Opens the modal for a selected node
  const openModal = (node) => {
    setSelectedNode(node);
    setIsModalOpen(true);
  };

  // Closes the modal
  const closeModal = () => {
    setSelectedNode(null);
    setIsModalOpen(false);
  };

  const getNodeSize = (level) => {
    return 10 / level;
  };

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

  // Opens the modal for editing a node
  const handleNodeClick = (node) => {
    console.log("Clicked node: ", node);
    setSelectedNode(node);
    setIsModalOpen(true);
  };

  const handleLinkClick = (link) => {
    setSelectedLink(link);
    setIsEditLinkModalOpen(true);
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
      console.log("Updated Node: ", updatedNode)
      if (nodeIndex !== -1) {
        set(ref(database, `stories/${currentUser.uid}/graph/nodes/${nodeIndex}`), updatedNode)
          .then(() => console.log("Node successfully updated in Firebase"))
          .catch((error) => console.error("Error updating node: ", error));
      } else {
        console.error("Error: Node with ID not found in dataset");
      }
    } else {
      console.error("Error: updatedNode.id is undefined");
    }
  };

  const deleteNode = (nodeId) => {
    const nodeIndex = data.nodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex === -1) return;

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

    closeNewLinkModal();
  };

  const saveEditedLink = (linkDetails) => {
    const { context, source, target, type } = linkDetails;
    console.log(source, target, type, context)

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
        link.source === selectedLink.source && link.target === selectedLink.target ? { ...link, source, target, type } : link
      );

      return { ...prev, links: updatedLinks };
    });

    const linkIndex = data.links.findIndex((link) => link.source === selectedLink.source && link.target === selectedLink.target);
    if (linkIndex !== -1) {
      set(ref(database, `stories/${userId}/graph/links/${linkIndex}`), { context, source, target, type })
        .then(showNotification)
        .catch((error) => console.error("Error updating link:", error));
    }

    closeEditLinkModal();
  };

  const assignLevels = (snapshotData) => {
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();
    console.log("Data links: ", snapshotData.links, "\nData Nodes:", snapshotData.nodes)

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
    console.log("After creating rootNodeNames, Snapshot: ", snapshotData.nodes)
    console.log("At line 193: ", snapshotData.links)
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
    console.log("At line 206: ", snapshotData.links)
    
    const queue = Array.from(rootNodeNames, rootNodeName => ({ id: rootNodeName, level: 1 }));
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      visited.add(id);

      const children = getLinks(id);
      console.log(children)
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
        console.log("Adding Links as children: ", links)
      });
    }

    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));
    console.log("Flattened: ", flattenedLinks)
    
    const nodeLevels = {};
    nodes.forEach((level, id) => {
      nodeLevels[id] = level;
    });

    console.log("Before filtering: ", nodes)

    console.log("Filtering Nodes: ", snapshotData.nodes.filter((node) => nodes.has(node.id)))
    
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
    console.log("Final nodes and links: ", finalNodes, flattenedLinks)
    
    return { nodes: finalNodes, links: flattenedLinks };
  };

  function onGraphData(snapshot) {
    console.log("Getting snapshot...")
    if (snapshot.exists()) {
      const snapshotData = snapshot.val();
      console.log("Got snapshot: ", snapshotData)

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
    } else {
      console.log("No data available.")
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
      primaryNode = nodesToMerge[0];
      primaryNode.label = primaryName;
    }

    const allAliases = nodesToMerge
      .flatMap(n => n.aliases?.split(',').map(a => a.trim()).filter(Boolean) || [])
      .filter(a => a !== primaryName);
    primaryNode.aliases = [...new Set(allAliases)].join(', ');

    const allNotes = nodesToMerge
      .map(n => n.note)
      .filter(Boolean);
    if (allNotes.length > 0) {
      primaryNode.note = allNotes.join('\n---\n');
    }

    const updatedLinks = data.links.map(link => ({
      ...link,
      source: nodeIds.includes(link.source) ? primaryNode.id : link.source,
      target: nodeIds.includes(link.target) ? primaryNode.id : link.target
    }));

    const uniqueLinks = [];
    const seen = new Set();
    for (const link of updatedLinks) {
      const key = `${link.source}|${link.target}|${link.type}`;
      if (!seen.has(key) && link.source !== link.target) {
        seen.add(key);
        uniqueLinks.push(link);
      }
    }

    const updatedNodes = data.nodes.filter(n =>
      n.id === primaryNode.id || !nodeIds.includes(n.id)
    );

    setData({ nodes: updatedNodes, links: uniqueLinks });

    const graphRef = ref(database, `stories/${currentUser.uid}/graph/`);
    set(graphRef, { nodes: updatedNodes, links: uniqueLinks })
      .then(() => {
        showNotification();
        alert(`Successfully merged ${nodesToMerge.length} nodes into "${primaryName}"`);
      })
      .catch(error => console.error("Error saving merge:", error));
  };

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
          onClick={() => setShowAnalysis(!showAnalysis)} 
          className="story-map-btn analyze-btn"
          style={{ marginLeft: 'auto' }}
        >
          {showAnalysis ? '📊 Hide Analysis' : '🔍 Analyze Structure'}
        </button>
      </div>

      {/* Graph Display */}
      <div className="graph-container">
        <Graph
          data={data}
          getNodeSize={getNodeSize}
          handleNodeClick={handleNodeClick}
          handleLinkClick={handleLinkClick}
          nodeAutoColorBy="id"
        />
      </div>

      {/* Analysis Panel with AI-powered Analysis */}
      <AnalysisPanel
        isOpen={showAnalysis}
        onClose={() => setShowAnalysis(false)}
      >
        <StoryMapAnalysis 
          data={data} 
          onMergeNodes={handleMergeNodes}
        />
      </AnalysisPanel>

      {/* Modals */}
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