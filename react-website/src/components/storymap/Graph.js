import React, { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import SpriteText from "three-spritetext";

const Graph = ({ data, getNodeSize, handleNodeClick, handleLinkClick }) => {
  const graphRef = useRef(); // Reference to the ForceGraph2D instance
  const [showNodeLabels, setShowNodeLabels] = useState(false); // Toggle state for node labels

  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current) {
        graphRef.current.width = graphRef.current.offsetWidth;
        graphRef.current.height = graphRef.current.offsetHeight;
      }
    };

    // Attach resize listener
    window.addEventListener("resize", handleResize);

    // Initial resize
    handleResize();

    // Cleanup listener on unmount
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      ref={graphRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >

      {/* Toggle Button */}
      <button
        onClick={() => setShowNodeLabels((prev) => !prev)}
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 10,
          padding: "10px 20px",
          backgroundColor: "#000000",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        {showNodeLabels ? "Switch to Node View" : "Switch to Label View"}
      </button>

      <ForceGraph2D
        graphData={data}
        width={graphRef.current?.offsetWidth || 800} // Default width
        height={graphRef.current?.offsetHeight || 600} // Default height
        nodeAutoColorBy="level"
        nodeVal={(node) => getNodeSize(node.level)}
        nodeLabel={(node) => node.label}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (showNodeLabels) {
            // Draw node label directly on the node
            const label = node.label;
            const fontSize = 12 / globalScale; // Scale font size based on zoom level
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "black"; // Text color
            ctx.fillText(label, node.x, node.y);
          }
        }}
        nodeCanvasObjectMode={() => (showNodeLabels ? "replace" : undefined)} // Replace default rendering if labels are shown
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        linkLabel={(link) => link.type}
        linkThreeObjectExtend={true}
        linkThreeObject={(link) => {
          const sprite = new SpriteText(link.type);
          sprite.color = "lightgrey";
          sprite.textHeight = 1.5;
          return sprite;
        }}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
      />
    </div>
  );
};

export default Graph;