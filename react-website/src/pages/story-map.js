import { useState, useEffect, useCallback } from 'react';
import 'firebase/database';
import { set, ref, get, onValue, orderByChild, equalTo, query, update, remove } from "firebase/database";
import { useAuthValue } from '../Firebase/AuthContext';
import { database } from '../Firebase/firebase';
import Graph from '../components/Graph';
import GraphModal from '../components/graph-modal';
import { Input, Button, Modal, Box } from '@material-ui/core';
import { v4 as uuidv4 } from "uuid";

function StoryMap() {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;
  const [data, setData] = useState({ nodes: [], links: []  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNodeText, setNewNodeText] = useState("");
  const [newLinkSource, setNewLinkSource] = useState("");
  const [newLinkTarget, setNewLinkTarget] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [notification, setNotification] = useState(false);
  
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

    setData(updatedData);  // Be careful: this might still cause unnecessary re-renders
    setIsModalOpen(false);
}, [data, selectedNode, textInput, userId]);


  // Opens the modal for editing a node
  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setIsModalOpen(true);
  };

  const updateNode = (updatedNode) => {
    console.log("Updating: ", updatedNode);
  
    setData((prevData) => {
      const updatedNodes = prevData.nodes.map((node) =>
        node.id === updatedNode.id ? { ...node, ...updatedNode } : node
      );
  
      return { ...prevData, nodes: updatedNodes };
    });
  
    // Use setTimeout to ensure the state update is reflected in logs
    setTimeout(() => {
      console.log("Updated Nodes: ", data.nodes);
    }, 100);
  
    // Ensure the correct node is updated in Firebase
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
    setData((prevData) => ({
      ...prevData,
      nodes: prevData.nodes.filter((node) => node.id !== nodeId),
      links: prevData.links.filter((link) => link.source !== nodeId && link.target !== nodeId)
  }));
  remove(ref(database, `stories/${currentUser.uid}/graph/nodes/${nodeId}`));
  };

  const addNode = () => {
    const newNode = { id: data.nodes.length, text: "New Node" };
    setData((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    console.log("Adding Nodes: ", data)
    set(ref(database, `stories/${userId}/graph/nodes/${newNode.id}`), newNode).then(showNotification);
  };

  // // Adds a new link between nodes
  // const addLink = (sourceId, targetId, linkLabel) => {
  //   if (sourceId === targetId) {
  //     alert("A node cannot link to itself.");
  //     return;
  //   }

  //   const existingLink = links.find(
  //     (link) =>
  //       (link.source === sourceId && link.target === targetId) ||
  //       (link.source === targetId && link.target === sourceId)
  //   );

  //   if (existingLink) {
  //     const newLabel = prompt(`Edit existing link (${existingLink.link}):`, existingLink.link);
  //     if (newLabel !== null) {
  //       setLinks(data.links.map((link) =>
  //         link === existingLink ? { ...link, link: newLabel } : link
  //       ));
  //     }
  //   } else {
  //     if (linkLabel) {
  //       setLinks([...links, { link: linkLabel, source: sourceId, target: targetId }]);
  //     }
  //   }
  // };

  // Assign levels to nodes
  const assignLevels = (snapshotData) => {
    // Initialize nodes, links and visited sets
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();
    console.log("Data links: ", snapshotData.links, "\nData Nodes:", snapshotData.nodes)

    // Get links for a given node
    const getLinks = (nodeId) => {
      return snapshotData.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };

    // Check if two links are bidirectional
    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };

    // Remove a link from the data
    const removeLink = (linkToRemove) => {
      snapshotData.links.splice(snapshotData.links.findIndex((link) => link === linkToRemove), 1);
    };

    // Find root nodes
    const rootNodeNames = new Set(snapshotData.nodes.map(node => node.id));
    console.log("After creating rootNodeNames, Snapshot: ", snapshotData.nodes)
    snapshotData.links.forEach(link => {
      if (!snapshotData.nodes.some(node => node.id === link.source) || !snapshotData.nodes.some(node => node.id === link.target)) {
        // Remove link if source or target node doesn't exist
        removeLink(link);
      } else {
        rootNodeNames.delete(link.target);
        if (snapshotData.links.some((l) => isTwoWayLinked(link, l))) {
          // Check for bidirectional links
          rootNodeNames.add(link.source);
          removeLink(snapshotData.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
        }
      }
    });

    // Create a queue of root nodes
    const queue = Array.from(rootNodeNames, rootNodeName => ({ id: rootNodeName, level: 1 }));
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      visited.add(id);

      // Get links and child nodes for the current node
      const children = getLinks(id);
      console.log(children)
      const childNodes = children.map((link) => ({ id: link.target, level: level + 1 }));
      queue.push(...childNodes);

      // Assign level to the node
      if (!nodes.has(id)) {
        nodes.set(id, level);
      } else if (nodes.get(id) > level) {
        nodes.set(id, level);
      }

      // Add links to the set
      children.forEach((link) => {
        if (visited.has(link.target)) {
          // Add link as a stringified JSON object if the target has already been visited
          links.add(JSON.stringify({
            type: link.type,
            source: link.source,
            target: link.target,
            context: link.context || ""
          }));
        } else {
          // Add link as a stringified JSON object
          links.add(JSON.stringify(link));
        }
      });
    }

    // Convert the set of links back to an array
    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

    // Build a mapping of node IDs to their assigned levels
    const nodeLevels = {};
    nodes.forEach((level, id) => {
      nodeLevels[id] = level;
    });

    console.log("Before filtering: ", nodes)

    console.log("Filtering Nodes: ", snapshotData.nodes.filter((node)=> nodes.has(node.id)))
    // Build the final list of nodes with text attribute added
    const finalNodes = snapshotData.nodes.filter((node) => nodes.has(node.id)).map((node) => ({
      ...node,
      id: node.id,
      label: node.label,
      level: nodes.get(node.id),
      note: node.note || "",
      group: node.group,
      aliases: node.aliases,
      attributes: node.attributes || {attribute : "None"},
      hidden: false
    }));
    console.log("Final nodes and links: ", finalNodes, flattenedLinks)
    // Return the final nodes and links
    return { nodes: finalNodes, links: flattenedLinks };
  };

  function onGraphData(snapshot) {
    console.log("Getting snapshot...")
    // Check if the data exists
    if (snapshot.exists()) {
      // Get the graph data from the snapshot
      const snapshotData = snapshot.val();
      console.log("Got snapshot: ", snapshotData)
      console.log(snapshotData.nodes, snapshotData.links)

      // Assign levels to the nodes and links
      const nodes_links = assignLevels(snapshotData);
      console.log("Assigned levels: ", nodes_links)
      // Filter out hidden nodes
      const hiddenNodes = data.nodes.filter((node) => !nodes_links.nodes.some((n) => n.id === node.id));

      // Update the final list of nodes with hidden attribute added
      const finalNodes = nodes_links.nodes.map((node) => ({
        ...node,
        hidden: false, // add hidden property to nodes
      }));
      console.log("Final Nodes: ", finalNodes)

      // Update the final list of links
      const finalLinks = nodes_links.links.map((link) => ({
        type: link.type,
        source: link.source,
        target: link.target,
        context: link.context || "None"
      }));
      if (finalNodes.length > 0 && finalLinks.length > 0){
              // Set the graph data, clear the text input and selected node
        setData({ nodes: finalNodes, links: finalLinks });
        console.log(data)
      }
      else {
        console.log ("Data gone: ", finalNodes, finalLinks)
      }

      setTextInput("");
      setSelectedNode({});

      // Update the hidden property of nodes in the database
      hiddenNodes.forEach((node) => {
        const nodeRef = ref(database, `stories/${userId}/graph/nodes/${node.id}`);
        set(nodeRef, { ...node, hidden: true });
      });

      // Update the graph data in the database
      const graphRef = ref(database, `stories/${userId}/graph`);
      console.log("Updating at onGraphData: ", finalNodes, finalLinks)
      set(graphRef, { nodes: finalNodes, links: finalLinks });
    } else {
      // If no data is available, show a message
      console.log("No data available.")
      return;
    }
  }

  return (
    <div>
      {/* Button to trigger graph rendering */}
      <button onClick={() => onValue(graphRef, onGraphData)}>RenderGraph</button>

      {/* Graph Display */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Graph
            data={data}
            getNodeSize={getNodeSize}
            handleNodeClick={handleNodeClick}
            nodeAutoColorBy="id"
          />
        </div>
      </div>

      {/* Graph Modal for Node Editing */}
      {selectedNode && (
        <GraphModal
          isModalOpen={isModalOpen}
          handleCloseModal={closeModal}
          selectedNode={selectedNode ?? ""}
          updateNode={updateNode}
          deleteNode={deleteNode}
          // addLink={addLink}
          nodes={data.nodes}
          links={data.links}
        />
      )}

      {/* Button to Add New Nodes */}
      <Button
        variant="contained"
        onClick={() =>
          addNode({ id: `${data.nodes.length + 1}`, name: "New Node", links: [] })
        }
        sx={{ mt: 2 }}
      >
        + Add Node
      </Button>
    </div>
  );

}

export default StoryMap;