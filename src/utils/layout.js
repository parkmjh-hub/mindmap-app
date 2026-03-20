import dagre from 'dagre';

// Calculate positions for nodes using dagre based on edges
export const getLayoutedElements = (nodes, edges, direction = 'TB', verticalSpacing = 100, horizontalSpacing = 150) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: horizontalSpacing, edgesep: 50, ranksep: verticalSpacing });

  const nodeWidth = 160; // Reduced to match CSS min-width + padding for tightest possible layout
  const nodeHeight = 60;  

  // De-duplicate edges by source→target key
  const edgeKey = (e) => `${e.source}→${e.target}`;
  const seenEdges = new Set();
  const uniqueEdges = edges.filter((e) => {
    const key = edgeKey(e);
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return true;
  });

  // Map nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Map edges to dagre
  uniqueEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Build a map of dagre-computed positions
  const dagrePositions = new Map();
  nodes.forEach((node) => {
    const pos = dagreGraph.node(node.id);
    dagrePositions.set(node.id, { x: pos.x, y: pos.y });
  });

  // Build a map of the user's original x-positions (before layout)
  const originalXMap = new Map(nodes.map((n) => [n.id, n.position?.x ?? 0]));

  // Group children by parent so we can preserve sibling order
  const childrenByParent = new Map();
  uniqueEdges.forEach((edge) => {
    if (!childrenByParent.has(edge.source)) {
      childrenByParent.set(edge.source, []);
    }
    childrenByParent.get(edge.source).push(edge.target);
  });

  // Helper to get all descendants of a node in the dagre graph
  const getAllDescendants = (nodeId) => {
    const descendants = [];
    const queue = [nodeId];
    const visited = new Set([nodeId]);
    while (queue.length > 0) {
      const current = queue.shift();
      const children = childrenByParent.get(current) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          descendants.push(childId);
          queue.push(childId);
        }
      }
    }
    return descendants;
  };

  // Process tree layer by layer to reorder siblings while shifting subtrees
  // We use BFS to ensure we process parents before children
  const roots = nodes.filter(n => !edges.some(e => e.target === n.id)).map(n => n.id);
  const queue = [...roots];
  const processedParents = new Set();

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (processedParents.has(parentId)) continue;
    processedParents.add(parentId);

    const childIds = childrenByParent.get(parentId) || [];
    if (childIds.length <= 1) {
      queue.push(...childIds);
      continue;
    }

    // Detect if a node is brand-new (at origin, with isNew flag)
    const isNewNode = (id) => {
      const node = nodes.find(n => n.id === id);
      return node?.position?.x === 0 && node?.position?.y === 0 && node?.data?.isNew;
    };

    // 1. Sort children by their current visual horizontal position
    const sortedByUser = [...childIds].sort((a, b) => {
      const aNew = isNewNode(a);
      const bNew = isNewNode(b);
      if (aNew && !bNew) return 1;
      if (!aNew && bNew) return -1;
      return (originalXMap.get(a) ?? 0) - (originalXMap.get(b) ?? 0);
    });

    // 2. Get the target x-slots that Dagre provided for this group
    const dagreXSlots = childIds
      .map(id => dagrePositions.get(id).x)
      .sort((a, b) => a - b);

    // 3. To avoid double-shifting or conflicting moves, we calculate all deltas first
    const shifts = sortedByUser.map((id, i) => {
      const currentDagreX = dagrePositions.get(id).x;
      const targetX = dagreXSlots[i];
      return { id, deltaX: targetX - currentDagreX };
    });

    // 4. Apply shifts to each sibling and its entire subtree
    shifts.forEach(({ id, deltaX }) => {
      if (Math.abs(deltaX) < 0.1) return; // Skip negligible shifts

      // Shift the node itself
      dagrePositions.get(id).x += deltaX;

      // Shift all its descendants
      const descendants = getAllDescendants(id);
      descendants.forEach(descId => {
        dagrePositions.get(descId).x += deltaX;
      });
    });

    // Add children to queue for next level processing
    queue.push(...childIds);
  }

  // Final Pass: Respect Node Locks
  // We must process these TOP-DOWN (parents before children) so that parent shifts
  // are applied to children BEFORE we calculate the child's own required lock shift.
  const originalPositions = new Map(nodes.map((n) => [n.id, { x: n.position?.x ?? 0, y: n.position?.y ?? 0 }]));
  const rootsForLock = nodes.filter(n => !uniqueEdges.some(e => e.target === n.id)).map(n => n.id);
  const lockQueue = [...rootsForLock];
  const processedForLock = new Set();

  while (lockQueue.length > 0) {
    const id = lockQueue.shift();
    if (processedForLock.has(id)) continue;
    processedForLock.add(id);

    const node = nodes.find(n => n.id === id);
    if (node?.data?.isLocked) {
      const originalPos = originalPositions.get(id);
      const currentDagrePos = dagrePositions.get(id);
      
      const currentTopLeftX = currentDagrePos.x - nodeWidth / 2;
      const currentTopLeftY = currentDagrePos.y - nodeHeight / 2;
      
      const dx = originalPos.x - currentTopLeftX;
      const dy = originalPos.y - currentTopLeftY;
      
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        // Shift the node itself
        currentDagrePos.x += dx;
        currentDagrePos.y += dy;
        
        // Shift all its descendants
        const descendants = getAllDescendants(id);
        descendants.forEach(descId => {
          const dPos = dagrePositions.get(descId);
          if (dPos) {
            dPos.x += dx;
            dPos.y += dy;
          }
        });
      }
    }
    
    // Add children to queue
    const children = childrenByParent.get(id) || [];
    lockQueue.push(...children);
  }

  // Apply layout back to our ReactFlow nodes
  const layoutedNodes = nodes.map((node) => {
    const pos = dagrePositions.get(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? 'left' : 'top',
      sourcePosition: direction === 'LR' ? 'right' : 'bottom',
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
      style: { opacity: 1, ...node.style }
    };
  });

  return { nodes: layoutedNodes, edges: uniqueEdges };
};


