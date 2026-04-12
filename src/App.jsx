import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Panel,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Network, LayoutDashboard, Menu, Plus, File, Trash2, Edit2, Undo2, Redo2, Printer, Sun, Moon, Download, Upload, Lock, Unlock } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

import MindMapNode from './components/MindMapNode';
import { getLayoutedElements } from './utils/layout';

const nodeTypes = {
  mindmap: MindMapNode,
};

const createDefaultNode = () => ({
  id: 'root',
  type: 'mindmap',
  data: { label: 'Central Idea' },
  position: { x: 0, y: 0 },
});

const getWelcomeDiagram = () => {
  const rootId = 'root';
  const child1Id = uuidv4();
  const child2Id = uuidv4();
  const grandchildId = uuidv4();

  const nodes = [
    {
      id: rootId,
      type: 'mindmap',
      data: { label: 'Welcome to Mindmap! 🚀 ' },
      position: { x: 0, y: 0 },
    },
    {
      id: child1Id,
      type: 'mindmap',
      data: { label: 'Double click to edit any node ✍️' },
      position: { x: -200, y: 150 },
    },
    {
      id: child2Id,
      type: 'mindmap',
      data: { label: 'Click [+] or hover for actions 🪄' },
      position: { x: 200, y: 150 },
    },
    {
      id: grandchildId,
      type: 'mindmap',
      data: { label: 'Drag nodes to reorganize! ↔️' },
      position: { x: 200, y: 300 },
    },
  ];

  const edges = [
    { id: `e-${rootId}-${child1Id}`, source: rootId, target: child1Id, animated: true, style: { stroke: '#58a6ff', strokeWidth: 2 } },
    { id: `e-${rootId}-${child2Id}`, source: rootId, target: child2Id, animated: true, style: { stroke: '#58a6ff', strokeWidth: 2 } },
    { id: `e-${child2Id}-${grandchildId}`, source: child2Id, target: grandchildId, animated: true, style: { stroke: '#58a6ff', strokeWidth: 2 } },
  ];

  return { nodes, edges };
};

export default function App() {
  const fileInputRef = React.useRef(null);
  // Document Management State
  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('mindmap-docs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback for corrupt data
      }
    }
    const welcomeDocId = uuidv4();
    return [{ id: welcomeDocId, title: 'Welcome Map 👋', updatedAt: Date.now() }];
  });

  const [currentDocId, setCurrentDocId] = useState(() => {
    const saved = localStorage.getItem('mindmap-current-id');
    return saved || documents[0].id;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [verticalSpacing, setVerticalSpacing] = useState(100);
  const [horizontalSpacing, setHorizontalSpacing] = useState(150);

  // Canvas State
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  // History State (Undo/Redo)
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [isUndoingRedoing, setIsUndoingRedoing] = useState(false);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('mindmap-theme');
    return saved ? saved === 'dark' : true;
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const loadedDocIdRef = React.useRef(currentDocId);
  const [rfInstance, setRfInstance] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const currentDoc = useMemo(() => documents.find(d => d.id === currentDocId) || documents[0], [documents, currentDocId]);

  // Save a copy of the current nodes & edges to the past array
  const takeSnapshot = useCallback(() => {
    setPast((p) => [...p, { nodes: [...nodes], edges: [...edges] }]);
    setFuture([]); // Clear future on new action
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setIsUndoingRedoing(true);
    
    const previousState = past[past.length - 1];
    const newPast = past.slice(0, -1);
    
    setPast(newPast);
    setFuture((f) => [...f, { nodes: [...nodes], edges: [...edges] }]);
    
    setNodes(previousState.nodes);
    setEdges(previousState.edges);
    
    setTimeout(() => setIsUndoingRedoing(false), 50);
  }, [past, nodes, edges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setIsUndoingRedoing(true);
    
    const nextState = future[future.length - 1];
    const newFuture = future.slice(0, -1);
    
    setFuture(newFuture);
    setPast((p) => [...p, { nodes: [...nodes], edges: [...edges] }]);
    
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    
    setTimeout(() => setIsUndoingRedoing(false), 50);
  }, [future, nodes, edges]);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
      // Check for Cmd/Ctrl + Y for Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Save documents list and current ID to local storage when they change
  useEffect(() => {
    localStorage.setItem('mindmap-docs', JSON.stringify(documents));
    localStorage.setItem('mindmap-current-id', currentDocId);
    
    // Safety check, if currentDocId isn't in documents, pick the first one
    if (!documents.find(d => d.id === currentDocId)) {
        setCurrentDocId(documents[0].id);
    }
  }, [documents, currentDocId]);

  // Save Theme and apply to html element
  useEffect(() => {
    localStorage.setItem('mindmap-theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [isDarkMode]);

  // Auto-save nodes/edges when they change
  useEffect(() => {
    if (!isLoaded) return;
    if (loadedDocIdRef.current !== currentDocId) return; // Prevent cross-saving on switch

    const data = { nodes, edges };
    localStorage.setItem(`mindmap-data-${currentDocId}`, JSON.stringify(data));
    
    // Update modified time
    setDocuments(docs => docs.map(doc => 
      doc.id === currentDocId ? { ...doc, updatedAt: Date.now() } : doc
    ));
  }, [nodes, edges, currentDocId, isLoaded]);

  // Load active document data
  useEffect(() => {
    setIsLoaded(false);
    
    // First clear nodes and let render cycle process
    setNodes([]);
    setEdges([]);
    
    // In next cycle, load new state
    setTimeout(() => {
      const savedData = localStorage.getItem(`mindmap-data-${currentDocId}`);
      if (savedData) {
        try {
          const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedData);
          setNodes(savedNodes || [createDefaultNode()]);
          setEdges(savedEdges || []);
        } catch(e) {
          setNodes([createDefaultNode()]);
          setEdges([]);
        }
      } else {
        // Check if this is the welcome doc
        const isWelcome = documents.find(d => d.id === currentDocId)?.title.includes('Welcome Map');
        if (isWelcome) {
           const { nodes: wNodes, edges: wEdges } = getWelcomeDiagram();
           setNodes(wNodes);
           setEdges(wEdges);
        } else {
           setNodes([createDefaultNode()]);
           setEdges([]);
        }
      }
      
      // Clear history when loading a new document
      setPast([]);
      setFuture([]);
      
      loadedDocIdRef.current = currentDocId;
      setIsLoaded(true);
    }, 50);
  }, [currentDocId]);

  // Layout processing
  const triggerAutoLayout = useCallback((currentNodes, currentEdges, vSpacing = verticalSpacing, hSpacing = horizontalSpacing) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      currentNodes, currentEdges, 'TB', vSpacing, hSpacing
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    
    // Smooth transition
    if (rfInstance) {
      setTimeout(() => {
        rfInstance.fitView({ padding: 0.2, duration: 800 });
      }, 0);
    }
    return { layoutedNodes, layoutedEdges };
  }, [verticalSpacing, horizontalSpacing, rfInstance]);

  const getSubtreeIds = useCallback((id, allEdges) => {
    const ids = new Set([id]);
    let queue = [id];
    while (queue.length > 0) {
      const current = queue.shift();
      const children = allEdges.filter(e => e.source === current).map(e => e.target);
      for (const child of children) {
        if (!ids.has(child)) {
          ids.add(child);
          queue.push(child);
        }
      }
    }
    return ids;
  }, []);

  // Node Change Callbacks
  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const extraChanges = [];
        
        // Check for dragging changes to move subtrees
        changes.forEach(change => {
          if (change.type === 'position' && change.position && change.dragging) {
            const node = nds.find(n => n.id === change.id);
            if (node) {
              const dx = change.position.x - node.position.x;
              const dy = change.position.y - node.position.y;
              
              // Only move if there is a real change
              if (dx !== 0 || dy !== 0) {
                const subtreeIds = getSubtreeIds(node.id, edges);
                subtreeIds.delete(node.id);
                
                subtreeIds.forEach(childId => {
                  // To avoid double-moving if a child is also in the changes list, 
                  // we could check if childId is in changes, but usually only one node is dragged in mindmap
                  const childNode = nds.find(n => n.id === childId);
                  if (childNode) {
                    extraChanges.push({
                      id: childId,
                      type: 'position',
                      position: {
                        x: childNode.position.x + dx,
                        y: childNode.position.y + dy
                      },
                      dragging: true,
                    });
                  }
                });
              }
            }
          }
        });

        // Intercept dragging changes
        const allChanges = [...changes, ...extraChanges];
        // We no longer snap Y because the user might want to reposition branches vertically, 
        // and Auto Layout will handle the global tree structure.
        return applyNodeChanges(allChanges, nds);
      });
    },
    [edges, getSubtreeIds]
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params) => {
      takeSnapshot();
      setEdges((eds) => addEdge(params, eds))
    },
    [takeSnapshot]
  );

  // Canvas Interactions
  const onChangeLabel = useCallback((id, newLabel) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const { isNew, ...restData } = node.data;
          return { ...node, data: { ...restData, label: newLabel } };
        }
        return node;
      })
    );
  }, [takeSnapshot]);

  const onChangeColor = useCallback((id, newColor) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, color: newColor } };
        }
        return node;
      })
    );
  }, [takeSnapshot]);


  const onAddChild = useCallback((parentId) => {
    takeSnapshot();
    const newNodeId = uuidv4();
    const newNode = {
      id: newNodeId,
      type: 'mindmap',
      data: { label: '', isNew: true },
      position: { x: 0, y: 0 },
    };
    
    const newEdge = {
      id: `e-${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId,
      animated: true,
      style: { stroke: '#58a6ff', strokeWidth: 2 },
    };

    setNodes((nds) => {
      const nextNodes = nds.concat(newNode);
      setEdges((eds) => {
        const nextEdges = eds.concat(newEdge);
        setTimeout(() => {
          const { layoutedNodes } = triggerAutoLayout(nextNodes, nextEdges);
          const newlyLayouted = layoutedNodes.find(n => n.id === newNodeId);
          if (rfInstance && newlyLayouted) {
             setTimeout(() => {
                 const currentZoom = rfInstance.getZoom();
                 const targetZoom = Math.max(currentZoom, 1.2);
                 rfInstance.setCenter(newlyLayouted.position.x + 75, newlyLayouted.position.y + 25, { duration: 800, zoom: targetZoom });
             }, 50);
          }
        }, 0);
        return nextEdges;
      });
      return nextNodes;
    });
  }, [triggerAutoLayout, rfInstance, takeSnapshot]);

  const safeOnDelete = useCallback((id) => {
    if (id === 'root') return;
    takeSnapshot();
    setEdges((eds) => {
      const idsToDelete = getSubtreeIds(id, eds);
      const nextEdges = eds.filter(
        (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)
      );
      
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => !idsToDelete.has(n.id));
        setTimeout(() => triggerAutoLayout(nextNodes, nextEdges), 0);
        return nextNodes;
      });
      
      return nextEdges;
    });
  }, [getSubtreeIds, triggerAutoLayout, takeSnapshot]);

  const onToggleLock = useCallback((id) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const isLocked = !node.data.isLocked;
          return { ...node, draggable: !isLocked, data: { ...node.data, isLocked } };
        }
        return node;
      })
    );
  }, [takeSnapshot]);

  const areAllLocked = useMemo(() => 
    nodes.length > 0 && nodes.every(n => n.data?.isLocked), 
    [nodes]
  );

  const onToggleAllLock = useCallback(() => {
    takeSnapshot();
    const targetState = !areAllLocked;
    setNodes(nds => nds.map(node => ({
      ...node,
      draggable: !targetState,
      data: { ...node.data, isLocked: targetState }
    })));
  }, [areAllLocked, takeSnapshot]);

  const onInsertAbove = useCallback((childId) => {
    if (childId === 'root') return;
    takeSnapshot();

    // Compute everything from current state upfront (no nesting)
    const parentEdge = edges.find(e => e.target === childId);
    if (!parentEdge) return;

    console.log('[DEBUG] === INSERT ABOVE ===');
    console.log('[DEBUG] childId:', childId);
    console.log('[DEBUG] parentEdge to remove:', parentEdge.id, parentEdge);
    console.log('[DEBUG] all edges BEFORE:', edges.map(e => `${e.id} (${e.source}->${e.target})`));

    const parentId = parentEdge.source;
    const newNodeId = uuidv4();

    // Place new node at midpoint between parent and child
    const parentNode = nodes.find(n => n.id === parentId);
    const childNode = nodes.find(n => n.id === childId);
    const midX = ((parentNode?.position.x ?? 0) + (childNode?.position.x ?? 0)) / 2;
    const midY = ((parentNode?.position.y ?? 0) + (childNode?.position.y ?? 0)) / 2;

    const newNode = {
      id: newNodeId,
      type: 'mindmap',
      data: { label: '', isNew: true },
      position: { x: midX, y: midY },
    };

    // Inherit style from the original edge
    const edgeStyle = parentEdge.style || { stroke: '#58a6ff', strokeWidth: 2 };
    const edgeAnimated = parentEdge.animated ?? true;

    // Build new edges: remove old parent->child, add parent->new and new->child
    const nextEdges = edges.filter(e => e.id !== parentEdge.id).concat([
      {
        id: `e-${parentId}-${newNodeId}`,
        source: parentId,
        target: newNodeId,
        animated: edgeAnimated,
        style: { ...edgeStyle },
      },
      {
        id: `e-${newNodeId}-${childId}`,
        source: newNodeId,
        target: childId,
        animated: edgeAnimated,
        style: { ...edgeStyle },
      },
    ]);

    console.log('[DEBUG] all edges AFTER:', nextEdges.map(e => `${e.id} (${e.source}->${e.target})`));
    console.log('[DEBUG] old edge still present?', nextEdges.some(e => e.id === parentEdge.id));

    const nextNodes = [...nodes, newNode];

    // Set both state at once
    setNodes(nextNodes);
    setEdges(nextEdges);

    // Then trigger layout
    setTimeout(() => {
      console.log('[DEBUG] triggerAutoLayout with edges:', nextEdges.map(e => `${e.id} (${e.source}->${e.target})`));
      const { layoutedNodes } = triggerAutoLayout(nextNodes, nextEdges);
      const newlyLayouted = layoutedNodes.find(n => n.id === newNodeId);
      if (rfInstance && newlyLayouted) {
        setTimeout(() => {
          const currentZoom = rfInstance.getZoom();
          const targetZoom = Math.max(currentZoom, 1.2);
          rfInstance.setCenter(newlyLayouted.position.x + 75, newlyLayouted.position.y + 25, { duration: 800, zoom: targetZoom });
        }, 50);
      }
    }, 0);
  }, [nodes, edges, triggerAutoLayout, rfInstance, takeSnapshot]);

  const nodesWithData = useMemo(() => {
    // 1. Calculate hierarchical labels based on tree structure and visual order
    const labels = {};
    
    // Find all nodes that are roots (no incoming edges)
    const rootNodes = nodes.filter(n => !edges.some(e => e.target === n.id));
    // Sort roots primarily by Y position (top-down) then X (left-right)
    rootNodes.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));

    const traverse = (nodeId, prefix) => {
      labels[nodeId] = prefix;
      
      // Find children of this node
      const children = edges
        .filter(e => e.source === nodeId)
        .map(e => nodes.find(n => n.id === e.target))
        .filter(Boolean);
      
      // Sort children by horizontal position
      children.sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
      
      children.forEach((child, i) => {
        traverse(child.id, `${prefix}.${i + 1}`);
      });
    };

    rootNodes.forEach((root, i) => {
      traverse(root.id, `${i + 1}`);
    });

    return nodes.map((n) => ({
      ...n,
      draggable: !n.data?.isLocked,
      data: {
        ...n.data,
        indexLabel: labels[n.id],
        onChangeLabel,
        onChangeColor,
        onAddChild,
        onDelete: safeOnDelete,
        onToggleLock,
        onInsertAbove,
      },
    }));
  }, [nodes, edges, onChangeLabel, onChangeColor, onAddChild, safeOnDelete, onToggleLock, onInsertAbove]);

  // Document UI Actions
  const createNewDocument = () => {
    const newDoc = { id: uuidv4(), title: 'Untitled Map', updatedAt: Date.now() };
    setDocuments(docs => [newDoc, ...docs]);
    setCurrentDocId(newDoc.id);
  };

  const deleteDocument = (e, id) => {
    e.stopPropagation(); // prevent selecting the doc
    if (documents.length === 1) {
      // Must have at least 1 document, just reset it
      const newDoc = { id: uuidv4(), title: 'Untitled Map', updatedAt: Date.now() };
      setDocuments([newDoc]);
      setCurrentDocId(newDoc.id);
      localStorage.removeItem(`mindmap-data-${id}`);
      return;
    }
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    if (currentDocId === id) setCurrentDocId(newDocs[0].id);
    localStorage.removeItem(`mindmap-data-${id}`);
  };

  const updateTitle = (newTitle) => {
    setDocuments(docs => docs.map(d => 
      d.id === currentDocId ? { ...d, title: newTitle } : d
    ));
  };

  const handleManualRelayout = () => {
    triggerAutoLayout(nodes, edges, verticalSpacing, horizontalSpacing);
    if (rfInstance) {
      setTimeout(() => {
         rfInstance.fitView({ duration: 800 });
      }, 50);
    }
  };

  const handleVerticalSpacingChange = (delta) => {
    const newSpacing = Math.max(20, Math.min(200, verticalSpacing + delta));
    setVerticalSpacing(newSpacing);
    triggerAutoLayout(nodes, edges, newSpacing, horizontalSpacing);
  };

  const handleHorizontalSpacingChange = (delta) => {
    const newSpacing = Math.max(0, Math.min(400, horizontalSpacing + delta));
    setHorizontalSpacing(newSpacing);
    triggerAutoLayout(nodes, edges, verticalSpacing, newSpacing);
  };

  const handleExportPDF = async () => {
    if (!rfInstance || nodes.length === 0) return;

    // We get the DOM node
    const viewportNode = document.querySelector('.react-flow__viewport');
    const flowWrapper = document.querySelector('.react-flow');
    if (!viewportNode || !flowWrapper) return;

    // Temporarily add a class to make edges solid black
    flowWrapper.classList.add('exporting-pdf');

    // Calculate dimensions based on the nodes
    const nodesBounds = getNodesBounds(nodes);
    const imageWidth = nodesBounds.width + 200;
    const imageHeight = nodesBounds.height + 200;
    
    // Calculate the transform needed to fit the whole graph
    const viewport = getViewportForBounds(
        nodesBounds,
        imageWidth,
        imageHeight,
        0.5,
        2,
        0
    );

    try {
        const dataUrl = await toPng(viewportNode, {
            backgroundColor: isDarkMode ? '#2b2d31' : '#f6f8fa', // Match --bg-color
            width: imageWidth,
            height: imageHeight,
            style: {
                width: imageWidth,
                height: imageHeight,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
        });

        // Create PDF with margins
        const margin = 50;
        const pdfWidth = imageWidth + (margin * 2);
        const pdfHeight = imageHeight + (margin * 2);

        const pdf = new jsPDF({
            orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
            unit: 'px',
            format: [pdfWidth, pdfHeight]
        });

        // Set the background color for the margin area
        pdf.setFillColor(isDarkMode ? '#2b2d31' : '#f6f8fa');
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

        pdf.addImage(dataUrl, 'PNG', margin, margin, imageWidth, imageHeight);
        pdf.save(`${currentDoc?.title || 'Mindmap'}.pdf`);

    } catch (err) {
        console.error('Failed to export PDF:', err);
    } finally {
        flowWrapper.classList.remove('exporting-pdf');
    }
  };

  const handleExportAll = () => {
    try {
      // Strip non-serializable callback functions from nodes before export
      const cleanNodes = (nodeList) => {
        return nodeList.map(node => ({
          ...node,
          data: Object.fromEntries(
            Object.entries(node.data || {}).filter(([, v]) => typeof v !== 'function')
          ),
        }));
      };

      const exportData = {
        version: 1,
        documents: documents,
        data: {}
      };
      
      documents.forEach(doc => {
        const docData = localStorage.getItem(`mindmap-data-${doc.id}`);
        if (docData) {
          try {
            const parsed = JSON.parse(docData);
            exportData.data[doc.id] = {
              nodes: cleanNodes(parsed.nodes || []),
              edges: parsed.edges || [],
            };
          } catch (parseErr) {
            // Skip corrupt data
          }
        }
      });
      
      // Also add current in-memory data for the active document (most up-to-date)
      exportData.data[currentDocId] = { nodes: cleanNodes(nodes), edges: edges };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindmaps-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export all diagrams:', err);
      alert('Failed to export diagrams.');
    }
  };

  const handleImportAll = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const imported = JSON.parse(content);
        
        if (!imported.documents || !Array.isArray(imported.documents) || !imported.data) {
          throw new Error('Invalid file format. Missing documents or data.');
        }

        // Merge documents
        const newDocsMap = new Map();
        documents.forEach(d => newDocsMap.set(d.id, d));
        
        imported.documents.forEach(d => {
            newDocsMap.set(d.id, d); // Overwrite or add
        });

        const mergedDocs = Array.from(newDocsMap.values());
        
        // Save data to localStorage
        Object.keys(imported.data).forEach(docId => {
            localStorage.setItem(`mindmap-data-${docId}`, JSON.stringify(imported.data[docId]));
        });

        // Update documents list in localStorage
        localStorage.setItem('mindmap-docs', JSON.stringify(mergedDocs));

        // Update state
        setDocuments(mergedDocs);
        
        // Force reload of the current document's canvas data from localStorage
        const currentData = imported.data[currentDocId];
        if (currentData) {
          setNodes(currentData.nodes || [createDefaultNode()]);
          setEdges(currentData.edges || []);
        }
        
        // Clear input so same file can be imported again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        
        alert('Diagrams imported successfully!');
      } catch (err) {
        console.error('Failed to import diagrams:', err);
        alert('Failed to import diagrams. The file might be corrupted or in an incompatible format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar glass-panel ${!isSidebarOpen ? 'closed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <Network color="#58a6ff" size={24} />
            <h2>Maps</h2>
          </div>
          <button className="btn-icon" onClick={createNewDocument} title="New Map">
            <Plus size={18} />
          </button>
        </div>
        <div className="document-list">
          {documents.slice().sort((a,b) => b.updatedAt - a.updatedAt).map(doc => (
            <div 
              key={doc.id} 
              className={`document-item ${doc.id === currentDocId ? 'active' : ''}`}
              onClick={() => setCurrentDocId(doc.id)}
            >
              <File size={16} className="doc-icon" />
              <span className="doc-item-title">{doc.title}</span>
              <button 
                className="btn-icon btn-icon-small btn-delete-doc" 
                onClick={(e) => deleteDocument(e, doc.id)}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="header glass-panel">
          <button className="btn-icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle Sidebar">
            <Menu size={20} />
          </button>
          
          <div className="title-wrapper">
            <input 
              className="doc-title-input" 
              value={currentDoc?.title || ''} 
              onChange={(e) => updateTitle(e.target.value)} 
              placeholder="Untitled Map"
            />
            <Edit2 size={14} className="edit-icon" />
          </div>
        </header>

        <div className="toolbar glass-panel">
          <div className="toolbar-group">
            <button 
              className="btn-icon" 
              onClick={undo} 
              disabled={past.length === 0}
              title="Undo (Cmd+Z)"
            >
              <Undo2 size={20} className={past.length === 0 ? "disabled-icon" : ""} />
            </button>
            <button 
              className="btn-icon" 
              onClick={redo} 
              disabled={future.length === 0}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 size={20} className={future.length === 0 ? "disabled-icon" : ""} />
            </button>
          </div>
          <div className="toolbar-divider"></div>
          <button className="btn-icon" onClick={handleExportPDF} title="Print to PDF">
            <Printer size={20} />
          </button>
          <button className="btn-icon" onClick={handleManualRelayout} title="Auto Layout">
            <LayoutDashboard size={20} />
          </button>
          <button 
            className="btn-icon" 
            onClick={onToggleAllLock} 
            title={areAllLocked ? "Unlock All Nodes" : "Lock All Nodes"}
            disabled={nodes.length === 0}
          >
            {areAllLocked ? <Unlock size={20} /> : <Lock size={20} />}
          </button>
          <div className="toolbar-divider"></div>
          <input 
            type="file" 
            accept=".json" 
            style={{ display: 'none' }} 
            ref={fileInputRef} 
            onChange={handleImportAll} 
          />
          <button className="btn-icon" onClick={handleExportAll} title="Export All Diagrams">
            <Upload size={20} />
          </button>
          <button className="btn-icon" onClick={() => fileInputRef.current?.click()} title="Import Diagrams">
            <Download size={20} />
          </button>
          <button className="btn-icon" onClick={() => setIsHelpOpen(true)} title="Quick Help">
            <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
          </button>
          <div className="toolbar-divider"></div>
          <button className="btn-icon" onClick={() => setIsDarkMode(!isDarkMode)} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        {isLoaded && (
          <ReactFlow
            nodes={nodesWithData}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onInit={setRfInstance}
            fitView
            minZoom={0.1}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={20} size={1} />
            
            <Panel position="bottom-left" className="custom-panel">
              <div className="control-group">
                <button className="control-btn" onClick={() => rfInstance?.zoomIn({ duration: 300 })} title="Zoom In">+</button>
                <span className="control-label">Zoom</span>
                <button className="control-btn" onClick={() => rfInstance?.zoomOut({ duration: 300 })} title="Zoom Out">-</button>
              </div>
              <div className="control-group">
                <button className="control-btn" onClick={() => handleVerticalSpacingChange(20)} title="Increase Vertical Spacing">+</button>
                <div className="control-label-stack">
                  <span className="control-label">Vertical</span>
                  <span className="control-label">Spacing</span>
                </div>
                <button className="control-btn" onClick={() => handleVerticalSpacingChange(-20)} title="Decrease Vertical Spacing">-</button>
              </div>
              <div className="control-group">
                <button className="control-btn" onClick={() => handleHorizontalSpacingChange(30)} title="Increase Horizontal Spacing">+</button>
                <div className="control-label-stack">
                  <span className="control-label">Horizontal</span>
                  <span className="control-label">Spacing</span>
                </div>
                <button className="control-btn" onClick={() => handleHorizontalSpacingChange(-30)} title="Decrease Horizontal Spacing">-</button>
              </div>
            </Panel>
          </ReactFlow>
        )}
      {/* Help Modal */}
      {isHelpOpen && (
        <div className="help-overlay" onClick={() => setIsHelpOpen(false)}>
          <div className="help-modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Quick Guide 💡</h3>
            <div className="help-content">
              <div className="help-section">
                <h4>Mouse Controls</h4>
                <ul>
                  <li><strong>Double Click:</strong> Edit node text</li>
                  <li><strong>Click [+]:</strong> Add child node</li>
                  <li><strong>Hover:</strong> Show colors, delete & lock</li>
                  <li><strong>Drag:</strong> Move nodes (locked nodes stay put!)</li>
                  <li><strong>Scroll / Pinch:</strong> Zoom & Pan</li>
                </ul>
              </div>
              <div className="help-section">
                <h4>Shortcuts</h4>
                <ul>
                  <li><strong>Cmd/Ctrl + Z:</strong> Undo</li>
                  <li><strong>Cmd/Ctrl + Shift + Z:</strong> Redo</li>
                  <li><strong>Enter:</strong> Save label (while editing)</li>
                  <li><strong>Esc:</strong> Close help</li>
                </ul>
              </div>
            </div>
            <button className="btn-primary" onClick={() => setIsHelpOpen(false)}>Got it!</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
