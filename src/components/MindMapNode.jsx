import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, Trash2, Lock, Unlock } from 'lucide-react';

const COLORS = ['#E57373', '#F6CA94', '#FAFABE', '#C1EBC0', '#C7CAFF', '#A78BFA', '#F6C2F3', '#1D2432'];

export default function MindMapNode({ id, data, selected }) {
  const [isEditing, setIsEditing] = useState(data.isNew || false);
  const [label, setLabel] = useState(data.label);
  const inputRef = useRef(null);

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Delay focus to ensure all ReactFlow transitions, state updates, and panning finish
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
          inputRef.current.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const onDoubleClick = () => {
    setIsEditing(true);
  };

  const onChange = (evt) => {
    setLabel(evt.target.value);
  };

  const onBlur = () => {
    setIsEditing(false);
    const finalLabel = label.trim() || 'New Node';
    if (label !== finalLabel) {
      setLabel(finalLabel);
    }
    if (data.onChangeLabel) {
      data.onChangeLabel(id, finalLabel);
    }
  };

  const onKeyDown = (evt) => {
    if (evt.key === 'Enter') {
      onBlur();
    }
  };

  const bgColor = data.color || '#1D2432';
  const textColor = bgColor === '#1D2432' ? '#f0f6fc' : '#000000';

  return (
    <div 
      className={`custom-node ${selected ? 'selected' : ''}`} 
      onDoubleClick={onDoubleClick}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ opacity: 0, width: '1px', height: '1px', minWidth: 'auto', minHeight: 'auto' }} 
        isConnectable={false}
      />
      
      {isEditing ? (
        <input
          ref={inputRef}
          value={label}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="node-input"
        />
      ) : (
        <div>{label || 'New Node'}</div>
      )}

      {/* Hover action buttons (Left Color Palette) */}
      <div className="node-left-actions" onClick={(e) => e.stopPropagation()}>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-btn ${bgColor === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            title={c === '#1D2432' ? "Default Space Blue" : "Set Color"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              data.onChangeColor?.(id, c);
            }}
          />
        ))}
      </div>

      {/* Hover action buttons (Top Right Lock) */}
      <div className="node-top-actions" onClick={(e) => e.stopPropagation()}>
        <button 
          className={`node-btn ${data.isLocked ? 'node-btn-locked' : ''}`} 
          title={data.isLocked ? "Unlock Node" : "Lock Node"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            data.onToggleLock?.(id);
          }}
        >
          {data.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      </div>

      {/* Hover action buttons */}
      <div className="node-actions" onClick={(e) => e.stopPropagation()}>
        <button 
          className="node-btn" 
          title="Add Child"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            data.onAddChild?.(id);
          }}
        >
          <Plus size={14} />
        </button>
        {id !== 'root' && (
          <button 
            className="node-btn node-btn-delete" 
            title="Delete Node"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              data.onDelete?.(id);
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ opacity: 0, width: '1px', height: '1px', minWidth: 'auto', minHeight: 'auto' }} 
        isConnectable={false}
      />
    </div>
  );
}
