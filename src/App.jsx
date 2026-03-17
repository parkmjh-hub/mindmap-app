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
import { Network, LayoutDashboard, Menu, Plus, File, Trash2, Edit2, Undo2, Redo2, Printer, Sun, Moon } from 'lucide-react';
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

export default function App() {
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
    return [{ id: uuidv4(), title: 'Untitled Map', updatedAt: Date.now() }];
  });

  const [currentDocId, setCurrentDocId] = useState(() => {
    const saved = localStorage.getItem('mindmap-current-id');
    return saved || documents[0].id;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [verticalSpacing, setVerticalSpacing] = useState(50);

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
        setNodes([createDefaultNode()]);
        setEdges([]);
      }
      
      // Clear history when loading a new document
      setPast([]);
      setFuture([]);
      
      loadedDocIdRef.current = currentDocId;
      setIsLoaded(true);
    }, 50);
  }, [currentDocId]);

  // Layout processing
  const triggerAutoLayout = useCallback((currentNodes, currentEdges, spacing = verticalSpacing) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      currentNodes,
      currentEdges,
      'TB', // Top-Bottom layout
      spacing
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    return { layoutedNodes, layoutedEdges };
  }, [verticalSpacing]);

  // Node Change Callbacks
  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        let isDragChange = false;
        
        // Intercept dragging changes to force horizontal-only movement
        const adjustedChanges = changes.map(change => {
            if (change.type === 'position' && change.position) {
               isDragChange = true;
               const node = nds.find(n => n.id === change.id);
               if (node) {
                   // Keep the new X, but snap Y back to the original Y
                   return { ...change, position: { x: change.position.x, y: node.position.y } };
               }
            }
            return change;
        });

        // We only take a snapshot on drag end to avoid capturing every tiny pixel move
        // However, React Flow's onNodesChange fires frequently during drag. 
        // A better place for drag snapshots is onNodeDragStop, but for simplicity, 
        // we will only snapshot explicit add/delete/edit/connect actions for now.
        
        return applyNodeChanges(adjustedChanges, nds);
      });
    },
    []
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

  const nodesWithData = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      draggable: !n.data?.isLocked,
      data: {
        ...n.data,
        onChangeLabel,
        onChangeColor,
        onAddChild,
        onDelete: safeOnDelete,
        onToggleLock,
      },
    }));
  }, [nodes, onChangeLabel, onChangeColor, onAddChild, safeOnDelete, onToggleLock]);

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
    triggerAutoLayout(nodes, edges, verticalSpacing);
    if (rfInstance) {
      setTimeout(() => {
         rfInstance.fitView({ duration: 800 });
      }, 50);
    }
  };

  const handleSpacingChange = (delta) => {
    const newSpacing = Math.max(20, Math.min(150, verticalSpacing + delta));
    setVerticalSpacing(newSpacing);
    triggerAutoLayout(nodes, edges, newSpacing);
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
                <button className="control-btn" onClick={() => handleSpacingChange(15)} title="Increase Spacing">+</button>
                <span className="control-label">Spacing</span>
                <button className="control-btn" onClick={() => handleSpacingChange(-15)} title="Decrease Spacing">-</button>
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
