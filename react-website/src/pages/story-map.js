
import { useState, useEffect, useCallback } from 'react'; 

import 'firebase/database'; 
import { set, ref, onValue, orderByChild, equalTo, query, update } from "firebase/database"; 

import { useAuthValue } from '../Firebase/AuthContext'; 
import { database } from '../Firebase/firebase'; 

import Graph from '../components/Graph'

function CharacterMap() {
  const { currentUser } = useAuthValue(); 

  const userId = currentUser ? currentUser.uid : null;
  const graphRef = ref(database, `stories/${userId}/graph/`);

  // Empty arrays for nodes and links
  var nodes = [
    {
      id: "Click Me for Instructions!",
      level: 1,
      text: "1. This is where you can see your story map.\n\n2. This map is generated based on the input you entered into the map generator.\n\n3. To view it, click 'Render Map'. Wait! Read the rest of the instructions first.\n\n4. To view the name of a node, hover over it. You can do the same to view the name of a link.\n\n5. Here, the nodes represent the entities in your story (these could be characters, locations, topics you tackle, etc.). The links represent the relationships between the nodes they connect.\n\n6. Click on a node to view only the nodes directly connected to it and add details about it, like me. For example, if it's a character, what's their motivation? Where are they from? What kind of life do they live? If it's a location, what does it look like? What's the atmosphere? When you're done, click Render Map to see the whole map again.\n\n7. You can add new nodes using the 'Node' Table beside me. Just click the ADD button, type in the name of the node, and click SAVE. You should see your node added to the table with no connecting links.\n\n8. When you've added all the nodes you want, scroll down and click ADD at the 'Link' Table to add the links to connect them. A 'Source' is the node where the link starts, and a 'Target' is the node where the link ends. You can select these from a drop down list of nodes. The link is the type of relationship.\n\n9. Click SAVE to save your new links. (Warning! If you haven't hit save after adding your nodes, they won't appear on the drop down lists.\n\n10. Click EDIT to edit the existing links, choosing new sources and targets or changing the link name. Clicking CANCEL will remove the changes you made after you last clicked SAVE.\n\n11. Click the trash icon beside a node or link to delete it.\n\n12. At first, your map will be disjointed, with the map in separate parts. Now that you know how to change it, try to connect them by adding the links that connect them to nodes in other parts so that, at the end, you have one whole map.\n\n13. Go ahead and click Render Map to get started!"
    }
  ];
  var links = [
    {
      link: "Unknown",
      source: "Click Me for Instructions!",
      target: "Click Me for Instructions!"
    }
  ];

  // Define state variables
  const [data, setData] = useState({ nodes, links }); // Store the graph data
  const [selectedNode, setSelectedNode] = useState({}); // Keep track of the selected node ID
  const [textInput, setTextInput] = useState(selectedNode ? selectedNode.text : "None.");

  // Update the text input when the selected node changes
  useEffect(() => {
    if (selectedNode && selectedNode.text) {
      setTextInput(selectedNode.text);

    }
  }, [textInput, selectedNode]);

  // Determine node size based on level
  const getNodeSize = (level) => {
    return 10 / level;
  };

  // Handle the Save button click to update the node's text
  const handleSaveClick = useCallback(() => {

    // Create an updated data object with the modified node text.
    const updatedData = {
      nodes: data.nodes.map((node) => {
        // If the node is the selected node, update its text with the input value.
        if (node.id === selectedNode.id) {
          return { ...node, text: textInput };
        }
        return node;
      }),
      links: data.links,
    };

    // Update the node text in the database.
    const nodeRef = ref(database, `stories/${userId}/graph/nodes`);
    const q = query(nodeRef, orderByChild("id"), equalTo(selectedNode.id));

    onValue(q, (snapshot) => {
      snapshot.forEach((childSnapshot) => {
        const nodeKey = childSnapshot.key;
        update(ref(database, `stories/${userId}/graph/nodes/${nodeKey}`), { text: textInput });
      });
    });

    // Update the local data state with the updated data.
    setData(updatedData);
  }, [data, selectedNode, textInput, userId]);

  // Handle node click event to display connected nodes and update the selected node
  const handleNodeClick = useCallback((node) => {
    if (!node) {
      return;
    }
    setSelectedNode(node);

    // Find all connected nodes and add them to a set.
    const connectedNodes = new Set([node.id]);
    data.links.forEach((link) => {
      if (link.source.id === node.id || link.source === node.id) {
        connectedNodes.add(link.target?.id || link.target);
      } else if (link.target.id === node.id || link.target === node.id) {
        connectedNodes.add(link.source?.id || link.source);
      }
    });

    // Filter the nodes and links data to only include connected nodes and their links.
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

  // Assign levels to nodes based on their connections
  const assignLevels = (data) => {
    const nodes = new Map();
    const links = new Set();
    const visited = new Set();

    // Check if the data object is valid and has the required properties.
    if (!data || !data.hasOwnProperty('links') || !data.hasOwnProperty('nodes')) {
      console.error('Data object is null or missing "links" property');
      return;
    }

    // Prepare the levelData object with nodes and links as arrays.
    const levelData = [];

    if (!Array.isArray(data.nodes)) {
      levelData.nodes = Object.values(data.nodes);
    }
    else {
      levelData.nodes = data.nodes;
    }

    if (!Array.isArray(data.links)) {
      levelData.links = Object.values(levelData.links);
    }
    else {
      levelData.links = data.links;
    }

    // Get links connected to a specific node
    const getLinks = (nodeId) => {
      return levelData.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };

    // Check if two links are connected bi-directionally
    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };

    // Remove a link from the levelData.links array
    const removeLink = (linkToRemove) => {
      levelData.links.splice(levelData.links.findIndex((link) => link === linkToRemove), 1);
    };

    // Identify root nodes (nodes with no incoming links).
    const rootNodeNames = new Set(levelData.nodes.map(node => node.id));
    levelData.links.forEach(link => {
      rootNodeNames.delete(link.target);
      if (!levelData.nodes.some(node => node.id === link.source) || !levelData.nodes.some(node => node.id === link.target)) {
        removeLink(link);
      } else {
        rootNodeNames.delete(link.target);
        if (levelData.links.some((l) => isTwoWayLinked(link, l))) {
          rootNodeNames.add(link.source);
          removeLink(levelData.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
        }
      }
    });

    // Initialize the queue with the root nodes and their initial levels.
    const queue = Array.from(rootNodeNames, rootNodeName => ({ id: rootNodeName, level: 1 }));
    
    // Process nodes using a breadth-first search approach.
    while (queue.length > 0) {

      // Get the next node from the queue and mark it as visited.
      const { id, level } = queue.shift();
      visited.add(id);

      // Get the child nodes connected to the current node and their levels.
      const children = getLinks(id);
      const childNodes = children.map((link) => {
        const childLevel = level + (link.source === id ? 1 : 0); // check if link.source is the current node
        return { id: link.target, level: childLevel };
      });
      // Add the child nodes to the queue for further processing.
      queue.push(...childNodes);

      // Set the level of the current node in the nodes Map.
      if (!nodes.has(id)) {
        nodes.set(id, level);
      } else if (nodes.get(id) > level) {
        nodes.set(id, level);
      }

      // Handle the links connected to the current node.
      children.forEach((link) => {
        if (visited.has(link.target)) {
          links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
        } else {
          links.add(JSON.stringify(link));
        }
      });

      // Adjust the levels of child nodes if necessary.
      links.forEach((link) => {
        if (nodes.get(link.source) === level && nodes.get(link.target) === level) {
          // increase link.target's level and the levels of its child nodes by 1
          const targetNode = childNodes.find(node => node.id === link.target);
          if (targetNode) {
            targetNode.level = level + 1;
            const targetChildren = getLinks(link.target);
            targetChildren.forEach((child) => {
              const childNode = childNodes.find(node => node.id === child.target);
              if (childNode) {
                childNode.level = targetNode.level + 1;
              }
            });
          }
        }
      })

    }

    // Convert the set of links back to an array
    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

    // Build a mapping of node IDs to their assigned levels
    const nodeLevels = {};
    nodes.forEach((level, id) => {
      nodeLevels[id] = level;
    });

    // Build the final list of nodes with text attribute added
    const finalNodes = levelData.nodes.filter((node) => nodes.has(node.id)).map((node) => ({ id: node.id, level: nodes.get(node.id), text: node.text || "" }));

    return { nodes: finalNodes, links: flattenedLinks };
  };

  // Handle graph data fetched from the database
  function onGraphData(snapshot) {
    if (snapshot.exists()) {
      const data = snapshot.val();

      const nodes_links = assignLevels(data);

      const finalNodes = nodes_links.nodes.map((node) => ({
        ...node,
      }));

      const finalLinks = nodes_links.links.map((link) => ({
        link: link.link,
        source: link.source,
        target: link.target,
      }));

      setData({ nodes: finalNodes, links: finalLinks });
      setTextInput('');
      setSelectedNode({});

      const graphRef = ref(database, `stories/${userId}/graph`);
      set(graphRef, { nodes: finalNodes, links: finalLinks }); // update the graph data in the database
    } else {
      console.log('No data available');
    }
  }

  // Fetch data from the database
  // and call onGraphData
  function fetchData() {
    onValue(graphRef, onGraphData);

  }

  return (
    <div>
      <button onClick={() => {
        fetchData()
      }}>
        Render Map
      </button>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Graph
            data={data}
            getNodeSize={getNodeSize}
            handleNodeClick={handleNodeClick}
          />
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
              <textarea cols="40" rows="20"
                type="text"
                value={textInput}
                placeholder={`This is where you can enter the details about ${selectedNode?.id}. For example, if ${selectedNode?.id} is a character, then try adding their background story and motivation. If ${selectedNode?.id} is a location, try to describe its ambience and what it looks like.`}
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