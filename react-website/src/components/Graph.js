import React from "react";
import ForceGraph2D from 'react-force-graph-2d';
import SpriteText from "three-spritetext";

import NodeTable from './NodeTable'
import LinkTable from './LinkTable'

//Return the Force Graph Component
const Graph = ({ data, getNodeSize, handleNodeClick }) => {
  return (
    <>
    <ForceGraph2D
      graphData={data}
      nodeAutoColorBy="level"
      nodeVal={(node) => getNodeSize(node.level)}
      nodeLabel={(node) => node.id} 
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      linkCurvature={0.25}
      linkLabel={(link) => link.link}
      linkThreeObjectExtend={true}  // Allows custom three.js objects to be added to links
      linkThreeObject={(link) => {
        // Uses the name property of the link to return a new SpriteText object
        const sprite = new SpriteText(link.name);
        sprite.color = 'lightgrey';
        sprite.textHeight = 1.5;
        return sprite;
      }}
      onNodeClick={handleNodeClick}
    />
    <NodeTable nodes={data.nodes} links={data.links}/>
    <LinkTable links={data.links} nodes={data.nodes}/>
    </>
    
  );
};

export default Graph;