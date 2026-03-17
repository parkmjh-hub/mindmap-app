import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Calculate positions for nodes using dagre based on edges
export const getLayoutedElements = (nodes, edges, direction = 'TB', verticalSpacing = 50) => {
  // ranksep: vertical distance between nodes in TB layout
  // nodesep: horizontal distance between nodes in TB layout
  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, edgesep: 30, ranksep: verticalSpacing });

  // Map nodes to dagre
  nodes.forEach((node) => {
    // Estimating average size of our `.custom-node` class
    const width = 150;
    const height = 50;
    dagreGraph.setNode(node.id, { width, height });
  });

  // Map edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply layout back to our ReactFlow nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // We adjust by half width and height because dagre positions from center, 
    // but React Flow positions from top-left.
    return {
      ...node,
      targetPosition: direction === 'LR' ? 'left' : 'top',
      sourcePosition: direction === 'LR' ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - 75,
        y: nodeWithPosition.y - 25,
      },
      // When auto-layout is applied, we can make them visible by default
      style: { opacity: 1, ...node.style }
    };
  });

  return { nodes: layoutedNodes, edges };
};
