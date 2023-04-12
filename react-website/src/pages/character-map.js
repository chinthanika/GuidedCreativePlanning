import { useState, useEffect } from 'react'; // Import React hooks for managing state and lifecycle events
import ForceGraph2D from 'react-force-graph-2d'; // Import a third-party library for rendering 3D force-directed graphs in React
import axios from 'axios'; // Import a third-party library for making HTTP requests

import 'firebase/database'; // Import the Firebase Realtime Database
import { ref, onValue, get, child } from "firebase/database"; // Import database functions from Firebase
import { DatabaseReference } from 'firebase/database';

import { useAuthValue } from '../Firebase/AuthContext'; // Import a custom hook for accessing Firebase authentication
import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app

import SpriteText from 'three-spritetext'


function CharacterMap() {
  const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication

  const [data, setData] = useState({});

  const [graphData, setGraphData] = useState({}); // Store the graph data


  // Empty arrays for nodes and links
  var nodes = [];
  var links = [];

  var nodes_links = {};

  // Retrieve the graph data from Firebase
  const graphRef = ref(database, 'stories/' + currentUser.uid + '/' + 'graph/');

  // Determine node size based on level
  const getNodeSize = (level) => {
    return 10 / level;
  };

  const assignLevels = (data) => {
    // Empty arrays and sets to keep track of nodes, links, and visited nodes.
    const nodes = [];
    const links = new Set();
    const visited = new Set();

    // Get all links connected to a given node.
    const getLinks = (nodeId) => {
      return data.links.filter((link) => link.source === nodeId && !visited.has(link.target));
    };

    // Check if two links are bidirectional.
    const isTwoWayLinked = (link1, link2) => {
      return link1.source === link2.target && link1.target === link2.source;
    };

    // Remove a link from the data.links array.
    const removeLink = (linkToRemove) => {
      data.links.splice(data.links.findIndex((link) => link === linkToRemove), 1);
    };

    // Find all nodes with no incoming links, and remove two-way links from their sources.
    const rootNodeNames = new Set(data.nodes.map(node => node.id));
    data.links.forEach(link => {
      rootNodeNames.delete(link.target);
      if (data.links.some((l) => isTwoWayLinked(link, l))) {
        rootNodeNames.add(link.source);
        removeLink(data.links.find((l) => isTwoWayLinked(link, l) && l.source !== link.source));
      }
    });

    // Traverse the graph starting from each root node and assign levels to nodes.
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

  // //Define a function to fetch the data from the database
  // function fetchData() {



  //   // // Retrieve data from the database using the get() function and pass in a reference to the graph
  //   // get(graphRef).then((snapshot) => {

  //   //   // Retrieve data from snapshot
  //   //   if (snapshot.exists()) {
  //   //     const data = snapshot.val();

  //   //     setData(data);

  //   //     // Call the assignLevels function to assign levels to nodes and links
  //   //     nodes_links = assignLevels(data);

  //   //     console.log(nodes_links)

  //   //     // Push nodes and links data to their respective arrays
  //   //     nodes.push(nodes_links.nodes);
  //   //     links.push(nodes_links.links);

  //   //   }
  //   //   else {
  //   //     console.log("No data available");
  //   //   }
  //   // })
  //   //   .catch((error) => {
  //   //     console.error(error);
  //   //   });

  //   console.log(data)

  //   // return { nodes: nodes.flat(), links: links.flat() }

  //   // return{ nodes, links }
  //   // const graph = (props) => {
  //   //   let graph = (

  //   //   )
  //   // }
  //   return (
  //     <div>
  //       <h4>AAAAAAHHHHH</h4>
  //       <ForceGraph3D
  //         graphData={nodes_links}
  //         nodeAutoColorBy="level"
  //         nodeVal={(node) => getNodeSize(node.level)}
  //       />
  //       {/* {graphData && (
  //         console.log(nodes_links),
  //         <ForceGraph3D
  //           graphData={nodes_links}
  //           nodeAutoColorBy="level"
  //           nodeVal={(node) => getNodeSize(node.level)}
  //         />
  //       )} */}
  //     </div>
  //   )
  // }

  // useEffect(() => {

  //   const { nodes, links } = fetchData();

  //   setGraphData(nodes, links);

  //   console.log(graphData)

  //   // const fetchGraphData = async () => {
  //   //   const {nodes, links} = fetchData(); // Fetch the graph data from Firebase

  //   //   console.log(nodes, links)

  //   //   setGraphData({nodes, links}); // Set the graph data state variable

  //   //   console.log(graphData)
  //   // };

  //   // fetchGraphData();
  // }, []);

  onValue(graphRef, (snapshot) => {
    // Retrieve data from snapshot
    if (snapshot.exists()) {
      const data = snapshot.val();

      // Call the assignLevels function to assign levels to nodes and links
      nodes_links = assignLevels(data);

      console.log(nodes_links)

      // Push nodes and links data to their respective arrays
      nodes.push(nodes_links.nodes);
      links.push(nodes_links.links);

    }
    else {
      console.log("No data available");
    }
  })

  return (
    <div style={{ height: '100vh' }}>
      {graphData && (
        console.log(nodes_links),
        <ForceGraph2D
          graphData={nodes_links}
          nodeAutoColorBy="level"
          nodeVal={(node) => getNodeSize(node.level)}
          nodeLabel={(node) => {
            return node.id
          }}
          // nodeCanvasObject={(node, ctx, globalScale) => {
          //   const label = node.id;
          //   const fontSize = Math.min(2 * node.__size, (2 * node.__size - 8) / ctx.measureText(label).width * 10) / globalScale;
          //   ctx.font = `${fontSize}px Sans-Serif`;
          //   const textWidth = ctx.measureText(label).width;
          //   const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding
    
          //   ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          //   ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);
    
          //   ctx.textAlign = 'center';
          //   ctx.textBaseline = 'middle';
          //   ctx.fillStyle = 'black';
          //   ctx.fillText(label, node.x, node.y);
    
          //   node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
          
          // }}

          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.25}
          linkLabel={(link) => {
            return link.link
          }}
      linkThreeObjectExtend={true}
      linkThreeObject={(link) => {
        // extend link with text sprite
        const sprite = new SpriteText(link.name);
        sprite.color = 'lightgrey';
        sprite.textHeight = 1.5;
        return sprite;
      }}
        />
      )}
    </div>
  );
};

export default CharacterMap;
