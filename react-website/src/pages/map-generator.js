import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, get } from "firebase/database"

// Function to remove duplicate entities by checking against existing ones in Firebase
function deduplicateEntities(newEntities, existingEntities) {
  const nodes = new Map();
  newEntities.forEach(({ id, name, aliases, type, attributes }) => {
    if (!aliases || aliases === "") {
      aliases = "None";
    }
    
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
  const url = 'http://127.0.0.1:5000/characters';

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

    if (!summarySnapshot.exists()) {
      set(summaryRef, text);
    }
    setText('');

    const response = await axios.post(url, { text: text });

    const existingGraph = graphSnapshot.exists() ? graphSnapshot.val() : { nodes: [], links: [] };

    // Create array of nodes for knowledge graph
    // const nodes = new Set();

    // response.data.forEach(({ head, tail }) => {
    //   nodes.add(head);
    //   nodes.add(tail);
    // });

    // Map each unique node to an object with an id and a group
    //const nodeMap = new Map();

    // let nodeId = 0;
    // nodes.forEach(node => {
    //   nodeMap.set(node, { id: node});
    //   nodeId++;
    // });

    // // Create an array of links and map each triplet to a link object
    // const links = response.data.map(({ head, type, tail }) => ({
    //   source: head,
    //   link: type,
    //   target: tail
    // }));

    // Deduplicate new entities and links before adding them
    const newNodes = deduplicateEntities(response.data.entities, existingGraph.nodes);
    const newLinks = deduplicateLinks(response.data.relationships.map(({ entity1_id, entity2_id, relationship, context }) => ({
      source: entity1_id,
      target: entity2_id,
      type: relationship,
      context
    })), existingGraph.links);

    // Update Firebase with new and existing nodes and links
    set(graphRef, { nodes: [...existingGraph.nodes, ...newNodes], links: [...existingGraph.links, ...newLinks] });
    setIsLoading(false);
    navigate('/story-map');
  }



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
    <div>
      <textarea rows="40" cols="150"
        type='text'
        value={text}
        required
        placeholder='Enter your plot in as much detail as possible.'
        onChange={e => setText(e.target.value)} />

      <button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Save'}
      </button>

    </div>
  );
}

export default MapGenerator;