import React from 'react';
import 'firebase/database';

import TimelineWidget from '../../features/timeline/TimelineWidget';

function StoryTimeline() {
    return (
            <div className="timeline">
                <TimelineWidget /> {/* Render the vertical timeline */}
            </div>
    );
}

export default StoryTimeline;