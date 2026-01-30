import React, { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import SpriteText from "three-spritetext";
import { useAuthValue } from '../../Firebase/AuthContext';
import {
  logViewToggle,
  logGraphInteraction
} from '../../utils/analytics';

const Graph = ({ data, getNodeSize, handleNodeClick, handleLinkClick }) => {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;
  
  const graphRef = useRef(); // Reference to the ForceGraph2D instance
  const forceGraphRef = useRef(); // Reference to the ForceGraph2D component
  const [showNodeLabels, setShowNodeLabels] = useState(false); // Toggle state for node labels
  
  // Analytics state
  const [lastZoomLevel, setLastZoomLevel] = useState(1);
  const [zoomChangeCount, setZoomChangeCount] = useState(0);
  const [panCount, setPanCount] = useState(0);
  const [nodeHoverCount, setNodeHoverCount] = useState(0);
  const [linkHoverCount, setLinkHoverCount] = useState(0);
  const lastInteractionTime = useRef(Date.now());
  
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
  
  // Track zoom changes
  useEffect(() => {
    if (!forceGraphRef.current) return;
    
    const checkZoom = setInterval(() => {
      if (forceGraphRef.current) {
        const currentZoom = forceGraphRef.current.zoom();
        if (currentZoom && Math.abs(currentZoom - lastZoomLevel) > 0.1) {
          setLastZoomLevel(currentZoom);
          setZoomChangeCount(prev => prev + 1);
          
          // Log zoom interaction
          if (userId) {
            logGraphInteraction(userId, 'zoom', {
              zoomLevel: currentZoom.toFixed(2),
              direction: currentZoom > lastZoomLevel ? 'in' : 'out'
            });
          }
        }
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(checkZoom);
  }, [lastZoomLevel, userId]);
  
  // Track camera position changes (pan)
  const handleCameraPositionChange = () => {
    setPanCount(prev => prev + 1);
    
    // Throttle pan logging (only log every 3rd pan)
    if (panCount % 3 === 0 && userId) {
      const timeSinceLastInteraction = Date.now() - lastInteractionTime.current;
      
      logGraphInteraction(userId, 'pan', {
        panCount: panCount + 1,
        timeSinceLastInteraction
      });
      
      lastInteractionTime.current = Date.now();
    }
  };
  
  // Track node hover
  const handleNodeHover = (node) => {
    if (node) {
      setNodeHoverCount(prev => prev + 1);
      
      // Log every 5th hover to avoid spam
      if (nodeHoverCount % 5 === 0 && userId) {
        logGraphInteraction(userId, 'node_hover', {
          nodeLabel: node.label,
          nodeGroup: node.group,
          nodeLevel: node.level,
          totalHovers: nodeHoverCount + 1
        });
      }
    }
  };
  
  // Track link hover
  const handleLinkHover = (link) => {
    if (link) {
      setLinkHoverCount(prev => prev + 1);
      
      // Log every 5th hover
      if (linkHoverCount % 5 === 0 && userId) {
        logGraphInteraction(userId, 'link_hover', {
          linkType: link.type,
          totalHovers: linkHoverCount + 1
        });
      }
    }
  };
  
  // Handle view toggle with analytics
  const handleViewToggle = () => {
    const newView = !showNodeLabels;
    setShowNodeLabels(newView);
    
    if (userId) {
      logViewToggle(userId, newView ? 'label' : 'node');
    }
  };
  
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
        onClick={handleViewToggle}
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 10,
          padding: "10px 20px",
          backgroundColor: "var(--primary-main)",
          color: "var(--background-default)",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "400",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = "var(--primary-dark)";
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = "var(--primary-main)";
        }}
      >
        {showNodeLabels ? "Switch to Node View" : "Switch to Label View"}
      </button>
      
      <ForceGraph2D
        ref={forceGraphRef}
        graphData={data}
        width={graphRef.current?.offsetWidth || 800}
        height={graphRef.current?.offsetHeight || 600}
        nodeAutoColorBy="level"
        nodeVal={(node) => getNodeSize(node.level)}
        nodeLabel={(node) => node.label}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (showNodeLabels) {
            // Draw node label directly on the node
            const label = node.label;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "black";
            ctx.fillText(label, node.x, node.y);
          }
        }}
        nodeCanvasObjectMode={() => (showNodeLabels ? "replace" : undefined)}
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
        onNodeHover={handleNodeHover}
        onLinkHover={handleLinkHover}
        onZoom={() => {
          // Zoom handled by useEffect interval
        }}
        onEngineTick={() => {
          // Track panning via camera position changes
          handleCameraPositionChange();
        }}
      />
    </div>
  );
};

export default Graph;