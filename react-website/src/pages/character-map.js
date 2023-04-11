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

  // Define a function to traverse the graph and assign levels
  // const assignLevels = (root, data) => {
  //   const visited = new Set();
  //   const queue = [{ ...root, level: 1 }];
  //   const nodes = [], links = [];

  //   var nodeId = 1;

  //   while (queue.length > 0) {
  //     const { id, ...node } = queue.shift();
  //     visited.add(id);

  //     const children = data.links.filter((edge) => edge.source === node.name && !visited.has(edge.target));
  //     const childNodes = children.map((edge) => ({ id: nodeId, name: edge.target, level: node.level + 1 }));
  //     queue.push(...childNodes);

  //     console.log(...childNodes)

  //     nodes.push({ id, ...node });
  //     links.push(...children);


  //     console.log(nodes, links)

  //     nodeId = nodeId + 1;
  //     console.log(nodeId)
  //   }

  //   return { nodes, links };
  // };

  const assignLevels = (data) => {
    const nodes = [];
    const links = new Set();
    const visited = new Set();

    // Find all nodes with no incoming links
    const rootNodeNames = new Set(data.nodes.map(node => node.name));
    data.links.forEach(link => {
      rootNodeNames.delete(link.target);
    });

    // Traverse the graph starting from each root node
    rootNodeNames.forEach(rootName => {
      const queue = [{ name: rootName, level: 1 }];
      while (queue.length > 0) {
        const { name, level } = queue.shift();
        visited.add(name);

        console.log(visited)

        const children = data.links.filter((link) => link.source === name && !visited.has(link.target));
        const childNodes = children.map((link) => ({ name: link.target, level: level + 1 }));
        queue.push(...childNodes);

        nodes.push({ name, level });

        // Add unique links to the set
        children.forEach((link) => {
          if (visited.has(link.target)) {
            links.add(JSON.stringify({ link: link.link, source: link.source, target: link.target }));
          } else {
            links.add(JSON.stringify(link));
          }
        });

        // Add links for two-way linked nodes
        const nodeLinks = data.links.filter((link) => link.source === name && link.target === name);

        console.log(nodeLinks)
        nodeLinks.forEach((link) => {
          const source = data.nodes.find((n) => n.name === link.source);
          const target = data.nodes.find((n) => n.name === link.target);

          console.log(source, target)
          links.add(JSON.stringify({ link: link.link, source: source.name, target: target.name }));
        });
      }
    });

    // Handle nodes with two-way links that are not connected to any root nodes
    data.nodes.forEach((node) => {
      if (!visited.has(node.name)) {
        console.log(node)

        nodes.push({ name: node.name, level: 0 });
      }
    });

    // Convert the set of links back to an array
    const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

    console.log(nodes, flattenedLinks)

    return { nodes, links: flattenedLinks };
  }


  // //   const visited = new Set();
  // //   const queue = [];
  // //   const nodes = [], links = new Set(); // Use a Set for links instead of an array

  // //   // Find all nodes that are not targets of any link, and add them to the queue with level 1
  // //   const roots = data.nodes.filter((node) => !data.links.some((link) => link.target === node.name));
  // //   roots.forEach((root) => {
  // //     queue.push({ ...root, level: 1 });
  // //   });

  // //   while (queue.length > 0) {
  // //     const { id, ...node } = queue.shift();
  // //     visited.add(id);

  // //     console.log(visited)

  // //     const children = data.links.filter((link) => link.source === node.name && !visited.has(link.target));
  // //     const childNodes = children.map((link) => {
  // //       const childNode = data.nodes.find((node) => node.name === link.target);
  // //       return { ...childNode, level: node.level + 1 };
  // //     });
  // //     queue.push(...childNodes);

  // //     nodes.push({ id, ...node });

  // //     // Use links.add() to add unique links to the Set
  // //     children.forEach((link) => {
  // //       console.log(link)

  // //       links.add(JSON.stringify(link));
  // //     });
  // //   }

  // //   // Convert the Set of links back to an array
  // //   const flattenedLinks = Array.from(links, (link) => JSON.parse(link));

  // //   console.log(nodes, flattenedLinks)

  // //   return { nodes, links: flattenedLinks };
  // // };


  //Define a function to fetch the data from the database
  function fetchData() {

    const nodes = [];
    const links = [];

    get(graphRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();

        //const rootNode = data.nodes.find((node) => !data.links.some((edge) => edge.target === node.name));

        //console.log(rootNode)

        //const graphData = assignLevels(rootNode, data);

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


// import { useState, useEffect } from 'react';
// import ForceGraph3D from 'react-force-graph-3d';
// import axios from 'axios';

// // Import Firebase database dependencies
// import { ref, onValue, get, child } from "firebase/database"
// import { database } from '../Firebase/firebase'

// // Import authentication context and database instance from Firebase
// import { useAuthValue } from '../Firebase/AuthContext'

// function CharacterMap() {
//   // Retrieve the current user from the authentication context
//   const { currentUser } = useAuthValue()

//   // Initialize state variables for the graph data, nodes, and links
//   const [graphData, setGraphData] = useState([]);
//   const [nodes, setNodes] = useState([]);
//   const [links, setLinks] = useState([]);

//   // Reference the graph data in Firebase
//   const graphRef = ref(database, 'stories/' + currentUser.uid + '/' + 'graph/');

//   // Define a function to determine node size based on level
//   const getNodeSize = (level) => {
//     return 10 / level;
//   };

//   // Define a function to traverse the graph and assign levels to nodes
//   const assignLevels = (root, data) => {
//     const visited = new Set();
//     const queue = [{ ...root, level: 1 }];
//     const nodes = [], links = [];

//     while (queue.length > 0) {
//       const { id, ...node } = queue.shift();
//       visited.add(id);

//       // Get the children of the current node
//       const children = data.links.filter((edge) => edge.source === id && !visited.has(edge.target));
//       const childNodes = children.map((edge) => ({ id: edge.target, ...edge, level: node.level + 1 }));
//       queue.push(...childNodes);

//       // Add the current node and its children to the nodes and links arrays, respectively
//       nodes.push({ id, ...node });
//       links.push(...children);
//     }

//     return { nodes, links };
//   };

//   useEffect(() => {
//     // Retrieve the graph data from Firebase and initialize the state variables with the result
//     const graphListener = onValue(graphRef, (snapshot) => {
//       if (snapshot.exists()) {
//         const data = snapshot.val();

//         // Find the root node of the graph
//         const rootNode = data.nodes.find((node) => !data.links.some((edge) => edge.target === node.id));

//         // Assign levels to the nodes in the graph
//         const graphData = assignLevels(rootNode, data);

//         // Update the state variables with the graph data, nodes, and links
//         setGraphData(graphData);
//         setNodes(data.nodes);
//         setLinks(data.links);
//       } else {
//         console.log("No data available");
//       }
//     });

//     // Detach the Firebase listener when the component unmounts
//     return () => {
//       onValue(graphRef, graphListener);
//     };
//   }, [currentUser.uid]);

//   // Render the 3D force-directed graph using the graph data and node size function
//   return (
//     <div style={{ height: '100vh' }}>
//       {graphData && (
//         <ForceGraph3D
//           nodesData={nodes}
//           linksData={links}
//           nodeAutoColorBy="level"
//           nodeVal={(node) => getNodeSize(node.level)}
//         />
//       )}
//     </div>
//   );
// };

// export default CharacterMap;

