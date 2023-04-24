import React from 'react';

import firebase from 'firebase/app';
import 'firebase/database';

import TextEditor from '../../components/TextEditor';
import "./story.css"

function StoryEditor() {
    return (
        <div className="TextEditor">
            <TextEditor />
        </div>
    );
}

export default StoryEditor;