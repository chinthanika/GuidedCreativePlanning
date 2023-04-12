import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import firebase from 'firebase/app'
import 'firebase/database'
import axios from 'axios'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set } from "firebase/database"

function NewStory() {
    const url = 'http://localhost:5000/characters';

    const { currentUser } = useAuthValue()
    const [summary, setSummary] = useState('')
    const [title, setTitle] = useState('')

    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate()

    const handleSubmit = async () => {
        setIsLoading(true);

        set(ref(database, 'stories/' + currentUser.uid), {
            title: title,
            summary: summary
        })

        setSummary('')
        setTitle('')

        const response = await axios.post(url, { text: summary });

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
            nodeMap.set(node, { id: node});
            nodeId++;
        });

        // Create an array of links and map each triplet to a link object
        const links = response.data.map(({ head, type, tail }) => ({
            source: head,
            link: type,
            target: tail
        }));

        // Store the nodes and links in Firebase
        set(ref(database, 'stories/' + currentUser.uid + '/' + 'graph/'), {
            nodes: Array.from(nodeMap.values()),
            links: links
        })

        setIsLoading(false);

        navigate('/character-map')
    }

    return (
        <div>
            <textarea
                type='text'
                value={summary}
                required
                placeholder='Enter your plot in as much detail as possible.'
                onChange={e => setSummary(e.target.value)} />

            <input
                type='title'
                value={title}
                required
                placeholder='Enter the title of your story.'
                onChange={e => setTitle(e.target.value)} />

            <button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Save'}
            </button>

        </div>
    );
}

export default NewStory