import { useState, useEffect, useCallback } from 'react'; // Import React hooks for managing state and lifecycle events

import 'firebase/database'; // Import the Firebase Realtime Database
import { set, ref, onValue, orderByChild, equalTo, query, update } from "firebase/database"; // Import database functions from Firebase
import { useAuthValue } from '../Firebase/AuthContext'; // Import a custom hook for accessing Firebase authentication
import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app

import Graph from '../components/Graph';

function StoryMap() {
  const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication

  const userId = currentUser ? currentUser.uid : null;
  const graphRef = ref(database, `stories/${userId}/graph/`);

  // Initialize empty nodes and links arrays
  var nodes = [
    {
      id: "Unknown1",
      level: 1,
      text: ""
    },
    {
      id: "Unknown2",
      level: 1,
      text: ""
    }
  ];
  var links = [
    {
      link: "Unknown",
      source: "Unknown1",
      target: "Unknown2"
    }
  ];

  // Store graph data in state using useState hook
  const [data, setData] = useState({ nodes, links });

  // Keep track of the selected node and its text input using useState hook
  const [selectedNode, setSelectedNode] = useState({});
  const [textInput, setTextInput] = useState(selectedNode ? selectedNode.text : "None.");

  useEffect(() => {
    // Update text input when selected node changes
    if (selectedNode && selectedNode.text) {
      setTextInput(selectedNode.text);
    }
  }, [textInput, selectedNode]);

  // Determine node size based on level
  const getNodeSize = (level) => {
    return 10 / level;
  };

  // Handle save button click
  const handleSaveClick = useCallback(() => {
    // Update the text attribute of the selected node in state
    const updatedData = {
      nodes: data.nodes.map((node) => {
        if (node.id === selectedNode.id) {
          return { ...node, text: textInput };
        }
        return node;
      }),
      links: data.links,
    };

    // Update the text attribute of the selected node in the database
    const nodeRef = ref(database, `stories/${userId}/graph/nodes`);
    const q = query(nodeRef, orderByChild("id"), equalTo(selectedNode.id));
    onValue(q, (snapshot) => {
      snapshot.forEach((childSnapshot) => {
        const nodeKey = childSnapshot.key;
        update(ref(database, `stories/${userId}/graph/nodes/${nodeKey}`), { text: textInput });
      });
    });

    setData(updatedData);
  }, [data, selectedNode, textInput, userId]);

  // Handle node click
  const handleNodeClick = useCallback((node) => {
    if (!node) {
      return;
    }

    // Update selected node, text input, and connected nodes in state
    setSelectedNode(node);

    const connectedNodes = new Set([node.id]);
    data.links.forEach((link) => {
      if (link.source.id === node.id || link.source === node.id) {
        connectedNodes.add(link.target?.id || link.target);
      } else if (link.target.id === node.id || link.target === node.id) {
        connectedNodes.add(link.source?.id || link.source);
      }
    });

    const finalNodes = data.nodes
      .filter(node => connectedNodes.has(node.id) || node.id === selectedNode.id)
      .map(node => ({ ...node }));

    const finalLinks = data.links
      .filter(
        (link) =>
          connectedNodes.has(link.source?.id || link.source) &&
          connectedNodes.has(link.target?.id || link.target)
      )
      .map((link) => ({
        link: link.link,
        source: link.source?.id || link.source,
        target: link.target?.id || link.target,
      }));

    setData({ nodes: finalNodes, links: finalLinks });
    setTextInput(node.text || "");

  }, [data, selectedNode]);

  // Assign levels to nodes
  const assignLevels = (data) => {
    // Initialize nodes, links and visited sets
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();
  
    // Get links for a given node
    const getLinks = (nodeId) => {
      return data.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };
  
    // Check if two links are bidirectional
    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };
  
    // Remove a link from the data
    const removeLink = (linkToRemove) => {
      data.links.splice(data.links.findIndex((link) => link === linkToRemove), 1);
    };
  
    // Find root nodes
    const rootNodeNames = new Set(data.nodes.map(node => node.id));
    data.links.forEach(link => {
      if (!data.nodes.some(node => node.id === link.source) || !data.nodes.some(node => node.id === link.target)) {
        // Remove link if source or target node doesn't exist
        removeLink(link);
      } else {
        rootNodeNames.delete(link.target);
        if (data.links.some((l) => isTwoWayLinked(link, l))) {
          // Check for bidirectional links
          rootNodeNames.add(link.source);
          removeLink(data.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
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
          links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
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
  
    // Build the final list of nodes with text attribute added
    const finalNodes = data.nodes.filter((node) => nodes.has(node.id)).map((node) => ({ id: node.id, level: nodes.get(node.id), text: node.text || "" }));
  
    // Return the final nodes and links
    return { nodes: finalNodes, links: flattenedLinks };
  };
  function onGraphData(snapshot) {
    // Check if the data exists
    if (snapshot.exists()) {
      // Get the graph data from the snapshot
      const data = snapshot.val();
  
      // Assign levels to the nodes and links
      const nodes_links = assignLevels(data);
  
      // Filter out hidden nodes
      const hiddenNodes = data.nodes.filter((node) => !nodes_links.nodes.some((n) => n.id === node.id));
  
      // Update the final list of nodes with hidden attribute added
      const finalNodes = nodes_links.nodes.map((node) => ({
        ...node,
        hidden: false, // add hidden property to nodes
      }));
  
      // Update the final list of links
      const finalLinks = nodes_links.links.map((link) => ({
        link: link.link,
        source: link.source,
        target: link.target,
      }));
  
      // Set the graph data, clear the text input and selected node
      setData({ nodes: finalNodes, links: finalLinks });
      setTextInput('');
      setSelectedNode({});
  
      // Update the hidden property of nodes in the database
      hiddenNodes.forEach((node) => {
        const nodeRef = ref(database, `stories/${userId}/graph/nodes/${node.id}`);
        set(nodeRef, { ...node, hidden: true });
      });
  
      // Update the graph data in the database
      const graphRef = ref(database, `stories/${userId}/graph`);
      set(graphRef, { nodes: finalNodes, links: finalLinks });
    } else {
      // If no data is available, show a message
      return (
        <h4>
          No Data Available.
        </h4>
      );
    }
  }
  
  function fetchData() {
    // Fetch the graph data from the database
    onValue(graphRef, onGraphData);
  }
  
  return (
    <div>
      <button onClick={() => {
        fetchData();
      }}>
        RenderGraph
      </button>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Graph
            data={data}
            getNodeSize={getNodeSize}
            handleNodeClick={handleNodeClick}
          />
          {/* Show the selected node details */}
          {selectedNode && selectedNode.id !== undefined && (
            <div
              style={{
                position: 'absolute',
                left: '70%',
                top: '50%',
                height: '500%',
                marginLeft: '10px',
              }}
            >
              <textarea
                type="text"
                value={textInput}
                placeholder={`This is where you can enter the details about ${selectedNode?.id}.`}
                onChange={(e) => {
                  setTextInput((prevTextInput) => e.target.value);
                }}
              />
              <br />
              {/* Save the updated node details */}
              {<button onClick={handleSaveClick}>Save</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default StoryMap;