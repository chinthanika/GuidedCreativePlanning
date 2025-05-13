import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, get } from "firebase/database"

import './map-generator.css'


// Function to remove duplicate entities by checking against existing ones in Firebase
function deduplicateEntities(newEntities, existingEntities) {
  console.log(existingEntities)
  const nodes = new Map();
  newEntities.forEach(({ id, name, aliases, type, attributes }) => {
    if (!aliases || aliases === "") {
      aliases = "None";
    }
    
    if (existingEntities !== undefined){
      const existingNode = existingEntities.find(node =>
        node.label === name || (node.aliases && node.aliases.includes(name))
      );
      
      if (!existingNode) {
        nodes.set(name, { 
          id, 
          label: name, 
          group: type, 
          aliases, 
          attributes });
      }
    }
  });
  return Array.from(nodes.values());
}

// Function to remove duplicate links by checking against existing ones in Firebase
function deduplicateLinks(newLinks, existingLinks) {
  const links = new Map();
  newLinks.forEach(({ source, target, type, context }) => {
    const key = `${source}-${target}-${type}`;
    if (!existingLinks.some(link => link.source === source && link.target === target && link.type === type)) {
      links.set(key, { 
        source, 
        target, 
        type, 
        context });
    }
  });
  return Array.from(links.values());
}


function MapGenerator() {
  //const url = 'http://127.0.0.1:5000/characters';
  const url = 'https://guidedcreativeplanning-1.onrender.com/characters'; // API endpoint for character generation

  // const url = 'https://guided-creative-planning.herokuapp.com/api/characters';

  const { currentUser } = useAuthValue()
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate()

  const handleSubmit = async () => {
    setIsLoading(true);

    const summaryRef = ref(database, `stories/${currentUser.uid}/summary`);
    const graphRef = ref(database, `stories/${currentUser.uid}/graph`);

    const summarySnapshot = await get(summaryRef);
    const graphSnapshot = await get(graphRef);

    if (summarySnapshot.exists()) {
      // Append the new text to the existing summary with a dashed line separator
      const existingSummary = summarySnapshot.val();
      const updatedSummary = `${existingSummary}\n-----------\n${text}`;
      set(summaryRef, updatedSummary);
  } else {
      // Set the new text as the summary if it doesn't exist
      set(summaryRef, text);
  }
  setText('');

    const response = await axios.post(url, { text: text });

    // Ensure existingGraph has default empty arrays
    const existingGraph = graphSnapshot.exists() ? graphSnapshot.val() : {};
    const existingNodes = Array.isArray(existingGraph.nodes) ? existingGraph.nodes : [];
    const existingLinks = Array.isArray(existingGraph.links) ? existingGraph.links : [];

    // Deduplicate new entities and links before adding them
    const newNodes = deduplicateEntities(response.data.entities, existingNodes);
    const newLinks = deduplicateLinks(response.data.relationships.map(({ entity1_id, entity2_id, relationship, context }) => ({
        source: entity1_id,
        target: entity2_id,
        type: relationship,
        context
    })), existingLinks);
    console.log(newLinks)
    // Update Firebase with new and existing nodes and links
    set(graphRef, { nodes: [...existingNodes, ...newNodes], links: [...existingLinks, ...newLinks] });

    setIsLoading(false);
    navigate('/story-map');
};


    // const nodes = new Map();
    // const links = [];

    // response.data.entities.forEach(({
    //   id,
    //   name,
    //   aliases,
    //   type,
    //   attributes
    // }) => {
    //   if (aliases && aliases == ""){
    //     aliases = "None"
    //   }
    //   // Check if an alias of this entity already exists
    //   const existingNode = Array.from(nodes.values()).find(node =>
    //     node.aliases && node.aliases.includes(name)
    //   );

    //   if (!existingNode) {
    //     nodes.set(name, {
    //       id: id,
    //       label: name,
    //       group: type,
    //       aliases,
    //       attributes
    //     });
    //   }
    // });

    // response.data.relationships.forEach(({
    //   entity1_id,
    //   entity2_id,
    //   relationship,
    //   context
    // }) => {
    //   links.push({
    //     source: entity1_id,
    //     target: entity2_id,
    //     type: relationship,
    //     context
    //   })
    // });

  //   if (graphSnapshot.exists()) {
  //     const existingGraph = graphSnapshot.val();

  //     // Append new nodes avoiding duplicates
  //     existingGraph.nodes.forEach(node => {
  //       if (!nodes.has(node.id)) {
  //         nodes.set(node.id, node)
  //       }
  //     });
  //     // Append new links
  //     links.push(...existingGraph.links);
  //   }

  //   // Store the nodes and links in Firebase
  //   set(ref(database, `stories/${currentUser.uid}/graph`), {
  //     // nodes: Array.from(nodeMap.values()),
  //     nodes: Array.from(nodes.values()),
  //     links: links
  //   });

  //   setIsLoading(false);

  //   navigate('/story-map')
  // }

    // -------------------

    // if (graphSnapshot.exists()) {
    //   // Append the new nodes to the existing ones
    //   graphSnapshot.val().nodes.forEach(node => {
    //     nodeMap.set(node.id, node);
    //   });
    // }

    // if (graphSnapshot.exists()) {
    //   // Append the new links to the existing ones
    //   graphSnapshot.val().links.forEach(link => {
    //     links.push(link);
    //   });
    // }

    

  return (
    <div className="map-generator-container">
    <textarea
      rows="20"
      cols="100"
      className="map-generator-textarea"
      type="text"
      value={text}
      required
      placeholder="Enter your plot in as much detail as possible."
      onChange={(e) => setText(e.target.value)}
    />

    <div className="map-generator-buttons">
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className="map-generator-btn save-btn"
      >
        {isLoading ? "Loading..." : "Save"}
      </button>
    </div>
  </div>
  );
}

export default MapGenerator;