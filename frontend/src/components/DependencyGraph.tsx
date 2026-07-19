import React, { useMemo, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import type { NodeProps, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileCode } from 'lucide-react';

// Custom Node Component
const CustomFileNode = ({ data, selected }: NodeProps) => {
  const fileType = (data.type as string || '').toLowerCase();

  const getBadgeClass = (ext: string) => {
    switch (ext) {
      case 'py':  return 'node-badge-py';
      case 'js':  return 'node-badge-js';
      case 'jsx': return 'node-badge-jsx';
      case 'ts':  return 'node-badge-ts';
      case 'tsx': return 'node-badge-tsx';
      default:    return '';
    }
  };

  return (
    <div className={`custom-node ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'var(--color-primary)', border: '2px solid var(--bg-primary)', width: 8, height: 8 }}
      />

      <div className="custom-node-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileCode size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <span className="custom-node-title" title={data.id as string}>
            {data.label as string}
          </span>
        </div>
        <span className={`node-badge ${getBadgeClass(fileType)}`}>
          {fileType || 'file'}
        </span>
      </div>

      <div className="custom-node-meta">
        <span>LOC: {data.loc as number}</span>
        <span>{((data.size as number) / 1024).toFixed(1)} KB</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'var(--color-accent)', border: '2px solid var(--bg-primary)', width: 8, height: 8 }}
      />
    </div>
  );
};

interface ApiNode {
  id: string;
  label: string;
  type: string;
  size: number;
  loc: number;
}

interface ApiEdge {
  id: string;
  source: string;
  target: string;
}

interface GraphProps {
  apiNodes: ApiNode[];
  apiEdges: ApiEdge[];
  selectedNodeId: string | null;       // driven from outside (sidebar clicks)
  onSelectNode: (nodeId: string | null) => void;
}

// ── Edge style constants ──────────────────────────────────────────────
const DIM_OPACITY   = 0.12;   // resting opacity when nothing is selected
const FULL_OPACITY  = 1;
const DIM_COLOR     = 'rgba(168, 85, 247, 0.7)';   // violet, dimmed further by opacity
const HI_COLOR      = '#a855f7';                    // violet, bright
const HI_COLOR_IN   = '#06b6d4';                    // cyan  – incoming edges

function buildEdgeStyle(active: boolean, isIncoming: boolean, nothingSelected: boolean) {
  const opacity = nothingSelected ? DIM_OPACITY : (active ? FULL_OPACITY : DIM_OPACITY);
  const color   = active ? (isIncoming ? HI_COLOR_IN : HI_COLOR) : DIM_COLOR;
  return {
    stroke:      color,
    strokeWidth: active ? 2 : 1.2,
    opacity,
    transition:  'opacity 0.25s ease, stroke 0.25s ease, stroke-width 0.25s ease',
  };
}

export default function DependencyGraph({
  apiNodes,
  apiEdges,
  selectedNodeId,
  onSelectNode,
}: GraphProps) {
  const nodeTypes = useMemo(() => ({ fileNode: CustomFileNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ── Build initial nodes + edges from API data ────────────────────────
  useEffect(() => {
    const depthGroups: { [key: number]: ApiNode[] } = {};
    apiNodes.forEach(node => {
      const depth = node.id.split('/').length - 1;
      if (!depthGroups[depth]) depthGroups[depth] = [];
      depthGroups[depth].push(node);
    });

    const columns = Object.keys(depthGroups).map(Number).sort((a, b) => a - b);
    const colWidth  = 280;
    const rowHeight = 110;

    const formattedNodes: Node[] = apiNodes.map(node => {
      const depth     = node.id.split('/').length - 1;
      const colIndex  = columns.indexOf(depth);
      const group     = depthGroups[depth];
      const nodeIndex = group.findIndex(n => n.id === node.id);
      const yOffset   = (group.length - 1) * rowHeight / 2;

      return {
        id:   node.id,
        type: 'fileNode',
        data: { id: node.id, label: node.label, type: node.type, size: node.size, loc: node.loc },
        position: {
          x: colIndex * colWidth + 50,
          y: nodeIndex * rowHeight - yOffset + 300,
        },
      };
    });

    // All edges start dimmed (nothing selected)
    const formattedEdges: Edge[] = apiEdges.map(edge => ({
      id:       edge.id,
      source:   edge.source,
      target:   edge.target,
      animated: false,
      style:    buildEdgeStyle(false, false, true),
      markerEnd: {
        type:   MarkerType.ArrowClosed,
        width:  14,
        height: 14,
        color:  DIM_COLOR,
      },
    }));

    setNodes(formattedNodes);
    setEdges(formattedEdges);
  }, [apiNodes, apiEdges, setNodes, setEdges]);

  // ── Re-style edges whenever selected node changes ────────────────────
  useEffect(() => {
    if (edges.length === 0) return;

    const nothingSelected = selectedNodeId === null;

    setEdges(prev =>
      prev.map(edge => {
        const isOutgoing = edge.source === selectedNodeId;
        const isIncoming = edge.target === selectedNodeId;
        const active = isOutgoing || isIncoming;
        const style  = buildEdgeStyle(active, isIncoming, nothingSelected);

        return {
          ...edge,
          animated:  active,           // animate only active edges
          style,
          markerEnd: {
            type:   MarkerType.ArrowClosed,
            width:  active ? 16 : 14,
            height: active ? 16 : 14,
            color:  active ? (isIncoming ? HI_COLOR_IN : HI_COLOR) : DIM_COLOR,
          },
        };
      })
    );

    // Also update node selection state so the custom node renders as selected
    setNodes(prev =>
      prev.map(node => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    );
  }, [selectedNodeId, setEdges, setNodes]);  // deliberately omit `edges` to avoid loop

  // ── Canvas interaction handlers ──────────────────────────────────────
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onSelectNode(node.id);
  }, [onSelectNode]);

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={2}
        style={{ width: '100%', height: '100%' }}
        // Prevent React Flow's own selection box from fighting with our state
        selectNodesOnDrag={false}
      >
        <Background color="rgba(255,255,255,0.06)" gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor="#1a192b"
          maskColor="rgba(8, 7, 16, 0.6)"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        />
      </ReactFlow>
    </div>
  );
}
