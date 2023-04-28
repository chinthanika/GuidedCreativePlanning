import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, get } from "firebase/database"

function MapGenerator() {
  const url = 'http://localhost:5000/characters';

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
    const nodes = new Set();

    response.data.forEach(({ head, tail }) => {
      nodes.add(head);
      nodes.add(tail);
    });

    // Map each unique node to an object with an id and a group
    const nodeMap = new Map();

    let nodeId = 0;
    nodes.forEach(node => {
      nodeMap.set(node, { id: node });
      nodeId++;
    });

    // Create an array of links and map each triplet to a link object
    const links = response.data.map(({ head, type, tail }) => ({
      source: head,
      link: type,
      target: tail
    }));

    const graphRef = ref(database, `stories/${currentUser.uid}/graph`);
    const graphSnapshot = await get(graphRef);

    if (graphSnapshot.exists()) {
        // Append the new nodes to the existing ones
        graphSnapshot.val().nodes.forEach(node => {
          nodeMap.set(node.id, node);
        });
    }

    if (graphSnapshot.exists()) {
        // Append the new links to the existing ones
        graphSnapshot.val().links.forEach(link => {
          links.push(link);
        });
    }

    // Store the nodes and links in Firebase
    set(ref(database, `stories/${currentUser.uid}/graph`), {
      nodes: Array.from(nodeMap.values()),
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
        placeholder=' 1. Summarize the plot of your story in 500 to 1500 words.
        2. Keep in mind that the more words you include the longer it takes to generate the map!
        3. If you exceed 1500 words, or have less than 500 words, the map will lose accuracy.
        4. If you want, you could also generate the map in chunks, generating it for small snippets at a time.
        5. When you have finished entering the summary click SAVE and wait. Do not go to another page on this website! I will switch you to the next page when I have generated your map.
        6. Go ahead and input your story summary.'
        onChange={e => setText(e.target.value)} />

      <button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Save'}
      </button>

    </div>
  );
}

export default MapGenerator;