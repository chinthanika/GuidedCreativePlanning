import { useState, useEffect, useRef, useCallback, useMemo } from 'react'; // Import React hooks for managing state and lifecycle events
import ForceGraph2D from 'react-force-graph-2d'; // Import a third-party library for rendering 3D force-directed graphs in React
import axios from 'axios'; // Import a third-party library for making HTTP requests

import 'firebase/database'; // Import the Firebase Realtime Database
import { set, ref, onValue, get, child } from "firebase/database"; // Import database functions from Firebase
import { DatabaseReference } from 'firebase/database';

import { useAuthValue } from '../Firebase/AuthContext'; // Import a custom hook for accessing Firebase authentication
import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app

import SpriteText from 'three-spritetext'

import Graph from '../components/Graph'
import { updatePassword } from 'firebase/auth';

function CharacterMap() {
  const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication

  const userId = currentUser ? currentUser.uid : null;
  const graphRef = ref(database, 'stories/' + userId + '/' + 'graph/');

  //  const [data, setData] = useState({});

  // Empty arrays for nodes and links
  var nodes = [
    {
      id: "Unknown",
      level: 1,
      text: ""
    }
  ];
  var links = [
    {
      link: "Unknown",
      source: "Unknown",
      target: "Unknown"
    }
  ];

  var nodes_links = {};

  const [graph, setGraph] = useState(<div></div>); // Store the graph data
  const [data, setData] = useState({ nodes, links }); // Store the graph data

  const [selectedNode, setSelectedNode] = useState({}); // Keep track of the selected node ID
  const [textInput, setTextInput] = useState(selectedNode ? selectedNode.text : "None.");

  useEffect(() => {
    console.log("textInput updated: ", textInput);
    if (selectedNode && selectedNode.text) {
      console.log("Here.")
      setTextInput(selectedNode.text);

  }
}, [textInput]);

  // Determine node size based on level
  const getNodeSize = (level) => {
    return 10 / level;
  };

  const textInputRef = useRef(selectedNode ? selectedNode.text : "");
  const [updateTextInput, setUpdateTextInput] = useState(false);

  const handleSaveClick = useCallback(() => {
    const updatedData = {
      nodes: data.nodes.map((node) => {
        if (node.id === selectedNode.id) {
          return { ...node, text: textInput };
        }
        return node;
      }),
      links: data.links,
    };
    setData(updatedData);
  }, [data, selectedNode, textInput]);

  const handleNodeClick = useCallback((node) => {
    if (!node) {
      return;
    }
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

    // const finalNodes = data.nodes.map((node) => ({
    //   ...node,
    //   hidden: !connectedNodes.has(node.id),
    // }));

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

  }, [data]);

  const assignLevels = (data) => {
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();
  
    const getLinks = (nodeId) => {
      return data.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };
  
    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };
  
    const removeLink = (linkToRemove) => {
      data.links.splice(data.links.findIndex((link) => link === linkToRemove), 1);
    };
  
    const rootNodeNames = new Set(data.nodes.map(node => node.id));
    data.links.forEach(link => {
      if (!data.nodes.some(node => node.id === link.source) || !data.nodes.some(node => node.id === link.target)) {
        removeLink(link);
      } else {
        rootNodeNames.delete(link.target);
        if (data.links.some((l) => isTwoWayLinked(link, l))) {
          rootNodeNames.add(link.source);
          removeLink(data.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
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
          links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
        } else {
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
  
    return { nodes: finalNodes, links: flattenedLinks };
  };

  function onGraphData(snapshot) {
    if (snapshot.exists()) {
      const data = snapshot.val();

      const nodes_links = assignLevels(data);

      const hiddenNodes = data.nodes.filter((node) => !nodes_links.nodes.some((n) => n.id === node.id));

      const finalNodes = nodes_links.nodes.map((node) => ({
        ...node,
        hidden: false, // add hidden property to nodes
      }));

      const finalLinks = nodes_links.links.map((link) => ({
        link: link.link,
        source: link.source,
        target: link.target,
      }));

      setData({ nodes: finalNodes, links: finalLinks });
      setTextInput('');
      setSelectedNode({});

      hiddenNodes.forEach((node) => {
        const nodeRef = ref(database, `stories/${userId}/graph/nodes/${node.id}`);
        set(nodeRef, { ...node, hidden: true }); // update the hidden property of nodes in the database
      });

      const graphRef = ref(database, `stories/${userId}/graph`);
      set(graphRef, { nodes: finalNodes, links: finalLinks }); // update the graph data in the database
    } else {
      console.log('No data available');
    }
  }

  function fetchData() {
    onValue(graphRef, onGraphData);

  }

  return (
    <div>
      <button onClick={() => {
        fetchData()
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
          {selectedNode && selectedNode.id != undefined && (
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
                  console.log(textInput)
                }}
              />
              <br />
              {<button onClick={handleSaveClick}>Save</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default CharacterMap;