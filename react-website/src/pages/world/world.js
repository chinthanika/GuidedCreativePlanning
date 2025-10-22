import React from 'react';
import 'firebase/database';

import WorldBuildingWidget from '../../features/world/worldBuildingWidget';

function StoryWorld() {
    return (
            <div className="world">
                <WorldBuildingWidget /> {/* Render the world hierarchy */}
            </div>
    );
}

export default StoryWorld;