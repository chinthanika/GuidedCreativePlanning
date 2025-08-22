import React from 'react';

import firebase from 'firebase/app';
import 'firebase/database';

import TextEditor from '../../components/storyeditor/TextEditor';
import TimelineWidget from '../../features/timeline/TimelineWidget';
import "./story.css"

function StoryEditor() {
    return (
        <div className="story-editor-container">
            <div className="timeline-widget">
                <TimelineWidget isVertical={true} /> {/* Render the vertical timeline */}
            </div>
            <div className="text-editor">
                <TextEditor />
            </div>
        </div>
    );
}

export default StoryEditor;