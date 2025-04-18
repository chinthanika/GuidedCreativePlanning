import React from "react";
import ForceGraph2D from 'react-force-graph-2d'; // Import a third-party library for rendering 3D force-directed graphs in React
import SpriteText from "three-spritetext";

//Return the Force Graph Component
const Graph = ({ data, getNodeSize, handleNodeClick, handleLinkClick }) => {
  console.log("Received by graph: ", data)
  return (
    <>
    <ForceGraph2D
      graphData={data}
      nodeAutoColorBy="level"
      nodeVal={(node) => getNodeSize(node.level)}
      nodeLabel={(node) => node.label}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      linkCurvature={0.25}
      linkLabel={(link) => link.type}
      linkThreeObjectExtend={true}
      linkThreeObject={(link) => {
        const sprite = new SpriteText(link.type);
        sprite.color = 'lightgrey';
        sprite.textHeight = 1.5;
        return sprite;
      }}
      onNodeClick={handleNodeClick}
      onLinkClick={handleLinkClick}
    />
    {/* <NodeTable nodes={data.nodes}/> */}
    {/* <LinkTable links={data.links} nodes={data.nodes}/> */}
    </>
    
  );
};

export default Graph;