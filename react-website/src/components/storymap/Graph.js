import React, { useRef, useEffect, useState, useCallback } from "react";
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
  
  const graphRef = useRef();
  const forceGraphRef = useRef();
  const [showNodeLabels, setShowNodeLabels] = useState(false);
  
  // Analytics state with throttling
  const [lastZoomLevel, setLastZoomLevel] = useState(1);
  const analyticsTimers = useRef({
    zoom: null,
    pan: null,
    nodeHover: null,
    linkHover: null
  });
  const interactionCounts = useRef({
    zoomChanges: 0,
    panMoves: 0,
    nodeHovers: 0,
    linkHovers: 0
  });
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(analyticsTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);
  
  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current) {
        graphRef.current.width = graphRef.current.offsetWidth;
        graphRef.current.height = graphRef.current.offsetHeight;
      }
    };
    
    window.addEventListener("resize", handleResize);
    handleResize();
    
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // OPTIMIZED: Track zoom changes with debouncing (only log after user stops zooming)
  useEffect(() => {
    if (!forceGraphRef.current) return;
    
    const checkZoom = setInterval(() => {
      if (forceGraphRef.current) {
        const currentZoom = forceGraphRef.current.zoom();
        if (currentZoom && Math.abs(currentZoom - lastZoomLevel) > 0.1) {
          interactionCounts.current.zoomChanges++;
          const direction = currentZoom > lastZoomLevel ? 'in' : 'out';
          setLastZoomLevel(currentZoom);
          
          // Clear existing timer
          if (analyticsTimers.current.zoom) {
            clearTimeout(analyticsTimers.current.zoom);
          }
          
          // DEBOUNCE: Only log after user stops zooming for 2 seconds
          analyticsTimers.current.zoom = setTimeout(() => {
            if (userId) {
              logGraphInteraction(userId, 'zoom', {
                zoomLevel: currentZoom.toFixed(2),
                direction,
                totalZoomChanges: interactionCounts.current.zoomChanges
              });
            }
          }, 2000);
        }
      }
    }, 500);
    
    return () => clearInterval(checkZoom);
  }, [lastZoomLevel, userId]);
  
  // OPTIMIZED: Track pan with heavy debouncing
  const handleCameraPositionChange = useCallback(() => {
    if (!userId) return;
    
    interactionCounts.current.panMoves++;
    
    // Clear existing timer
    if (analyticsTimers.current.pan) {
      clearTimeout(analyticsTimers.current.pan);
    }
    
    // DEBOUNCE: Only log after user stops panning for 3 seconds
    analyticsTimers.current.pan = setTimeout(() => {
      logGraphInteraction(userId, 'pan', {
        totalPanMoves: interactionCounts.current.panMoves
      });
      // Reset counter after logging
      interactionCounts.current.panMoves = 0;
    }, 3000);
  }, [userId]);
  
  // OPTIMIZED: Track node hover with heavy throttling
  const handleNodeHover = useCallback((node) => {
    if (!node || !userId) return;
    
    interactionCounts.current.nodeHovers++;
    
    // Clear existing timer
    if (analyticsTimers.current.nodeHover) {
      clearTimeout(analyticsTimers.current.nodeHover);
    }
    
    // DEBOUNCE: Only log after user stops hovering for 2 seconds
    // This captures when they've finished exploring nodes
    analyticsTimers.current.nodeHover = setTimeout(() => {
      logGraphInteraction(userId, 'node_hover_session', {
        totalNodesHovered: interactionCounts.current.nodeHovers,
        lastNodeLabel: node.label,
        lastNodeGroup: node.group
      });
      // Reset counter
      interactionCounts.current.nodeHovers = 0;
    }, 2000);
  }, [userId]);
  
  // OPTIMIZED: Track link hover with heavy throttling
  const handleLinkHover = useCallback((link) => {
    if (!link || !userId) return;
    
    interactionCounts.current.linkHovers++;
    
    // Clear existing timer
    if (analyticsTimers.current.linkHover) {
      clearTimeout(analyticsTimers.current.linkHover);
    }
    
    // DEBOUNCE: Only log after user stops hovering for 2 seconds
    analyticsTimers.current.linkHover = setTimeout(() => {
      logGraphInteraction(userId, 'link_hover_session', {
        totalLinksHovered: interactionCounts.current.linkHovers,
        lastLinkType: link.type
      });
      // Reset counter
      interactionCounts.current.linkHovers = 0;
    }, 2000);
  }, [userId]);
  
  // Handle view toggle (this is fine - user-triggered action)
  const handleViewToggle = () => {
    const newView = !showNodeLabels;
    setShowNodeLabels(newView);
    
    if (userId) {
      logViewToggle(userId, newView ? 'label' : 'node');
    }
  };
  
  // CRITICAL FIX: Remove onEngineTick completely - it fires 60 times per second!
  // Pan tracking is now handled only when user actually interacts with the graph
  
  return (
    <div
      ref={graphRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
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
        // REMOVED: onZoom - handled by interval with debouncing
        // REMOVED: onEngineTick - this was firing 60 times per second!
        onBackgroundClick={handleCameraPositionChange} // Track pan only on actual interaction
      />
    </div>
  );
};

export default Graph;