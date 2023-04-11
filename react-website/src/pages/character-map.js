import { useState, useEffect } from 'react'; // Import React hooks for managing state and lifecycle events
import ForceGraph3D from 'react-force-graph-3d'; // Import a third-party library for rendering 3D force-directed graphs in React
import axios from 'axios'; // Import a third-party library for making HTTP requests

import 'firebase/database'; // Import the Firebase Realtime Database
import { ref, onValue, get, child } from "firebase/database"; // Import database functions from Firebase
import { DatabaseReference } from 'firebase/database';

import { useAuthValue } from '../Firebase/AuthContext'; // Import a custom hook for accessing Firebase authentication
import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app


function CharacterMap() {
  const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication

  const [graphData, setGraphData] = useState([]); // Define a state variable for storing the graph data

  // Retrieve the graph data from Firebase
  const graphRef = ref(database, 'stories/' + currentUser.uid + '/' + 'graph/');

  const getNodeSize = (level) => {
    // Define a function to determine node size based on level
    return 10 / level;
  };

  const assignLevels = (data) => {
    const nodes = [];
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

    // Find all nodes with no incoming links
    const rootNodeNames = new Set(data.nodes.map(node => node.id));
    data.links.forEach(link => {
      rootNodeNames.delete(link.target);
      if (data.links.some((l) => isTwoWayLinked(link, l))) {
        rootNodeNames.add(link.source);
        removeLink(data.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
      }
    });

    // Traverse the graph starting from each root node
    rootNodeNames.forEach(rootName => {
      const queue = [{ id: rootName, level: 0 }];
      while (queue.length > 0) {
        const { id, level } = queue.shift();
        visited.add(id);

        const children = getLinks(id);
        const childNodes = children.map((link) => ({ id: link.target, level: level + 1 }));
        queue.push(...childNodes);


        // Add node to nodes array only if it hasn't been added before
        if (!nodes.some((node) => node.id === id)) {
          nodes.push({ id, level });
        }
        //nodes.push({ id, level });

        // Add unique links to the set
        children.forEach((link) => {
          if (visited.has(link.target)) {
            links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
          } else {
            links.add(JSON.stringify(link));
          }
        });
      }
    });

    // Handle nodes with two-way links that are not connected to any root nodes
    data.nodes.forEach((node) => {
      if (!visited.has(node.id) && data.links.some((link) => isTwoWayLinked({ source: node.id, target: node.id }, link))) {
        rootNodeNames.add(node.id);
      }
    });

    // Traverse the graph starting from each additional root node
    rootNodeNames.forEach(rootName => {
      if (!visited.has(rootName)) {
        const queue = [{ id: rootName, level: 0 }];
        while (queue.length > 0) {
          const { id, level } = queue.shift();
          visited.add(id);

          const children = getLinks(id);
          const childNodes = children.map((link) => ({ id: link.target, level: level + 1 }));
          queue.push(...childNodes);

          nodes.push({ id, level });

          // Add unique links to the set
          children.forEach((link) => {
            if (visited.has(link.target)) {
              links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
            } else {
              links.add(JSON.stringify(link));
            }
          });
        }
      }
    });

    // Convert the set of links back to an array
    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

    console.log(nodes, flattenedLinks);

    return { nodes, links: flattenedLinks };
  };

  //Define a function to fetch the data from the database
  function fetchData() {

    const nodes = [];
    const links = [];

    get(graphRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();

        const graphData = assignLevels(data);

        nodes.push(graphData.nodes);
        links.push(graphData.links);

      }
      else {
        console.log("No data available");
      }
    })
      .catch((error) => {
        console.error(error);
      });

    return ({ nodes, links })
  }

  useEffect(() => {
    console.log("Hello")
    const graphData = fetchData(); // Fetch the graph data from Firebase

    setGraphData(graphData) // Set the graph data state variable

    console.log(graphData)
  }, [])

  return (
    <div style={{ height: '100vh' }}>
      {graphData && (
        console.log(graphData),
        <ForceGraph3D
          graphData={graphData}
          nodeAutoColorBy="level"
          nodeVal={(node) => getNodeSize(node.level)}
        />
      )}
    </div>
  );
};

export default CharacterMap;
