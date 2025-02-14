import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, get } from "firebase/database"

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

    console.log(currentUser.uid)

    const snapshot = await get(summaryRef);

    if (!snapshot.exists()) {
      set(summaryRef, text);
    }
    setText('');

    const response = await axios.post(url, { text: text });

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

    const nodes = new Map();
    const links = [];

    response.data.entities.forEach(({
      id,
      name,
      aliases,
      type,
      attributes
    }) => {
      if (aliases && aliases == ""){
        aliases = "None"
      }
      // Check if an alias of this entity already exists
      const existingNode = Array.from(nodes.values()).find(node =>
        node.aliases && node.aliases.includes(name)
      );

      if (!existingNode) {
        nodes.set(name, {
          id: id,
          label: name,
          group: type,
          aliases,
          attributes
        });
      }
    });

    response.data.relationships.forEach(({
      entity1_id,
      entity2_id,
      relationship,
      context
    }) => {
      links.push({
        source: entity1_id,
        target: entity2_id,
        type: relationship,
        context
      })
    });

    const graphRef = ref(database, `stories/${currentUser.uid}/graph`);
    const graphSnapshot = await get(graphRef);

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

    if (graphSnapshot.exists()) {
      const existingGraph = graphSnapshot.val();

      // Append new nodes avoiding duplicates
      existingGraph.nodes.forEach(node => {
        if (!nodes.has(node.id)) {
          nodes.set(node.id, node)
        }
      });
      // Append new links
      links.push(...existingGraph.links);
    }

    // Store the nodes and links in Firebase
    set(ref(database, `stories/${currentUser.uid}/graph`), {
      // nodes: Array.from(nodeMap.values()),
      nodes: Array.from(nodes.values()),
      links: links
    });

    setIsLoading(false);

    navigate('/story-map')
  }

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