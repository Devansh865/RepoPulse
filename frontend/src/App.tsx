import React, { useState, useMemo } from 'react';
import { 
  GitBranch, 
  Search, 
  Filter, 
  ArrowLeft, 
  Database, 
  Activity,
  AlertTriangle,
  Loader2,
  TrendingUp,
  FileText,
  Workflow,
  ShieldCheck,
  CircleAlert,
  Trash2,
  Zap,
  TestTube2,
  Route,
  Link2
} from 'lucide-react';
import DependencyGraph from './components/DependencyGraph';
import {
  computeBlastRadius,
  computeDeleteImpact,
  computeHealthScore,
  findDeadCode,
} from './utils/graphAnalysis';

// High-quality mock data for instant demo/offline capability
const MOCK_GRAPH = {
  repo_name: "RepoPulse-AI-Demo",
  nodes: [
    { id: "main.py", label: "main.py", type: "py", size: 4096, loc: 120 },
    { id: "config.py", label: "config.py", type: "py", size: 1024, loc: 35 },
    { id: "db.py", label: "db.py", type: "py", size: 1500, loc: 45 },
    { id: "models.py", label: "models.py", type: "py", size: 6144, loc: 150 },
    { id: "auth.py", label: "auth.py", type: "py", size: 8192, loc: 180 },
    { id: "payment.py", label: "payment.py", type: "py", size: 9728, loc: 210 },
    { id: "checkout.py", label: "checkout.py", type: "py", size: 3584, loc: 95 },
    { id: "notifications.py", label: "notifications.py", type: "py", size: 2867, loc: 75 },
    { id: "tests/test_payment.py", label: "test_payment.py", type: "py", size: 3072, loc: 85 },
    { id: "tests/test_auth.py", label: "test_auth.py", type: "py", size: 2458, loc: 65 },
    { id: "frontend/src/App.tsx", label: "App.tsx", type: "tsx", size: 5120, loc: 110 },
    { id: "frontend/src/components/Graph.tsx", label: "Graph.tsx", type: "tsx", size: 4096, loc: 90 },
    { id: "frontend/src/index.css", label: "index.css", type: "css", size: 2048, loc: 60 }
  ],
  edges: [
    { id: "main.py->auth.py", source: "main.py", target: "auth.py" },
    { id: "main.py->payment.py", source: "main.py", target: "payment.py" },
    { id: "main.py->config.py", source: "main.py", target: "config.py" },
    { id: "auth.py->db.py", source: "auth.py", target: "db.py" },
    { id: "auth.py->models.py", source: "auth.py", target: "models.py" },
    { id: "payment.py->db.py", source: "payment.py", target: "db.py" },
    { id: "payment.py->models.py", source: "payment.py", target: "models.py" },
    { id: "payment.py->notifications.py", source: "payment.py", target: "notifications.py" },
    { id: "checkout.py->payment.py", source: "checkout.py", target: "payment.py" },
    { id: "checkout.py->auth.py", source: "checkout.py", target: "auth.py" },
    { id: "tests/test_payment.py->payment.py", source: "tests/test_payment.py", target: "payment.py" },
    { id: "tests/test_auth.py->auth.py", source: "tests/test_auth.py", target: "auth.py" },
    { id: "frontend/src/App.tsx->frontend/src/components/Graph.tsx", source: "frontend/src/App.tsx", target: "frontend/src/components/Graph.tsx" },
    { id: "frontend/src/App.tsx->frontend/src/index.css", source: "frontend/src/App.tsx", target: "frontend/src/index.css" }
  ]
};

function ImpactMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ background: 'rgba(0, 0, 0, 0.16)', borderRadius: 7, padding: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 10 }}>{icon}{label}</span>
      <strong style={{ display: 'block', marginTop: 4, fontSize: 16 }}>{value}</strong>
    </div>
  );
}

function HealthList({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  if (items.length === 0) return null;
  const color = positive ? 'var(--color-success)' : 'var(--color-warning)';
  return (
    <div style={{ marginTop: 14 }}>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{title}</span>
      {items.slice(0, 3).map(item => <div key={item} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-secondary)', marginTop: 5 }}><span style={{ color, fontWeight: 700 }}>{positive ? '✓' : '⚠'}</span>{item}</div>)}
    </div>
  );
}

export default function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [graphData, setGraphData] = useState<typeof MOCK_GRAPH | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [showDeleteImpact, setShowDeleteImpact] = useState(false);

  // Trigger analysis via local FastAPI server
  const handleAnalyze = async (e?: React.FormEvent, customUrl?: string) => {
    if (e) e.preventDefault();
    const urlToAnalyze = (customUrl || repoUrl).trim();
    if (!urlToAnalyze) return;

    setIsLoading(true);
    setError(null);
    setStatusMessage('Cloning repository...');

    // Dynamic fake step updates for beautiful feedback
    const messageInterval = setInterval(() => {
      setStatusMessage(prev => {
        if (prev === 'Cloning repository...') return 'Parsing abstract syntax trees (AST)...';
        if (prev === 'Parsing abstract syntax trees (AST)...') return 'Resolving import dependencies...';
        if (prev === 'Resolving import dependencies...') return 'Generating architectural network graph...';
        return prev;
      });
    }, 2500);

    try {
      const response = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: urlToAnalyze })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to parse repository.');
      }

      const data = await response.json();
      setGraphData(data);
      setSelectedNodeId(null);
      setShowDeleteImpact(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Could not connect to analysis backend. Ensure the backend server is running on localhost:8000.');
    } finally {
      clearInterval(messageInterval);
      setIsLoading(false);
    }
  };

  const loadDemo = () => {
    setIsLoading(true);
    setStatusMessage('Compiling virtual demo workspace...');
    setTimeout(() => {
      setGraphData(MOCK_GRAPH);
      setSelectedNodeId(null);
      setShowDeleteImpact(false);
      setIsLoading(false);
    }, 1200);
  };

  const handleBackToDashboard = () => {
    setGraphData(null);
    setSelectedNodeId(null);
    setSearchQuery('');
    setFilterType('ALL');
    setShowDeleteImpact(false);
  };

  // Extract unique file extensions for the filter dropdown
  const fileTypes = useMemo(() => {
    if (!graphData) return [];
    const types = new Set<string>();
    graphData.nodes.forEach(n => {
      if (n.type) types.add(n.type);
    });
    return Array.from(types);
  }, [graphData]);

  // Filter nodes based on search and selected extension
  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(node => {
      const matchesSearch = node.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === 'ALL' || node.type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [graphData, searchQuery, filterType]);

  // Keep edges that connect visible, filtered nodes
  const filteredEdges = useMemo(() => {
    if (!graphData) return [];
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    return graphData.edges.filter(edge => 
      visibleIds.has(edge.source) && visibleIds.has(edge.target)
    );
  }, [graphData, filteredNodes]);

  // Get details for the selected node
  const selectedNodeDetails = useMemo(() => {
    if (!graphData || !selectedNodeId) return null;
    const node = graphData.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;

    // Outgoing dependencies (files this file imports)
    const imports = graphData.edges
      .filter(e => e.source === selectedNodeId)
      .map(e => e.target);

    // Incoming dependencies (files that import this file)
    const importedBy = graphData.edges
      .filter(e => e.target === selectedNodeId)
      .map(e => e.source);

    return { ...node, imports, importedBy };
  }, [graphData, selectedNodeId]);

  const blastRadius = useMemo(() => {
    if (!graphData || !selectedNodeId) return [];
    return Array.from(computeBlastRadius(selectedNodeId, graphData.edges));
  }, [graphData, selectedNodeId]);

  const healthReport = useMemo(() => {
    if (!graphData) return null;
    return computeHealthScore(graphData.nodes, graphData.edges);
  }, [graphData]);

  const deadCodeCandidates = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(node => findDeadCode(graphData.nodes, graphData.edges).has(node.id));
  }, [graphData]);

  const deleteImpact = useMemo(() => {
    if (!graphData || !selectedNodeId) return null;
    return computeDeleteImpact(selectedNodeId, graphData.edges);
  }, [graphData, selectedNodeId]);

  const selectedIsRemovalCandidate = Boolean(selectedNodeId && deadCodeCandidates.some(node => node.id === selectedNodeId));

  const selectNode = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setShowDeleteImpact(false);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* HEADER NAVBAR */}
      <header className="glass-panel" style={{ 
        margin: '16px 24px', 
        padding: '16px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ 
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
            width: 38,
            height: 38,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-neon)'
          }}>
            <Workflow size={20} color="#ffffff" />
          </div>
          <div>
            <h1 className="glow-text" style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>
              RepoPulse AI
            </h1>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Predictive Architecture Intelligence</span>
          </div>
        </div>

        {graphData && (
          <button className="cyber-button-secondary" onClick={handleBackToDashboard}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        )}
      </header>

      {/* DASHBOARD SCREEN */}
      {!graphData && (
        <main style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '0 24px 80px 24px',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span style={{ 
              background: 'rgba(168, 85, 247, 0.1)', 
              color: 'var(--color-primary)', 
              padding: '6px 16px', 
              borderRadius: '20px', 
              fontSize: '13px', 
              fontWeight: 600,
              border: '1px solid rgba(168, 85, 247, 0.2)',
              letterSpacing: '0.5px'
            }}>
              STAGED PROTOVAL V1.0
            </span>
            <h2 className="glow-text" style={{ fontSize: '48px', fontWeight: 800, marginTop: '20px', lineHeight: 1.15 }}>
              Predict the Impact <br />Before You Commit.
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '16px', lineHeight: 1.6 }}>
              Convert any software repository into a live dependency graph. Scan imports, modules, 
              and connections instantly to map the blast radius of code changes.
            </p>
          </div>

          <div className="glass-panel" style={{ width: '100%', padding: '32px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-primary)', animation: 'spin 1.5s linear infinite' }} />
                <h4 style={{ marginTop: '20px', fontWeight: 600 }}>Analyzing codebase...</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                  {statusMessage}
                </p>
              </div>
            ) : (
              <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    GitHub Repository Link
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }}
                    >
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                    <input 
                      type="url" 
                      required
                      placeholder="https://github.com/username/repository" 
                      className="cyber-input" 
                      style={{ paddingLeft: '48px' }}
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div style={{ 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.25)', 
                    color: 'var(--color-error)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="cyber-button" style={{ flex: 2 }}>
                    Analyze Repository
                  </button>
                  <button type="button" className="cyber-button-secondary" onClick={loadDemo} style={{ flex: 1 }}>
                    Try Demo Graph
                  </button>
                </div>
              </form>
            )}
          </div>

          <div style={{ display: 'flex', gap: '40px', marginTop: '48px', width: '100%', justifyContent: 'space-around' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--color-primary)' }}><Database size={24} /></div>
              <div>
                <h5 style={{ fontSize: '14px', fontWeight: 600 }}>Structure Indexing</h5>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Scans AST tree file imports</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--color-accent)' }}><Activity size={24} /></div>
              <div>
                <h5 style={{ fontSize: '14px', fontWeight: 600 }}>Blast Radius</h5>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Trace downstream impact paths</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--color-primary)' }}><TrendingUp size={24} /></div>
              <div>
                <h5 style={{ fontSize: '14px', fontWeight: 600 }}>Visual Dashboard</h5>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Interactive drag-zoom canvas</p>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* GRAPH EXPLORER SCREEN */}
      {graphData && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 24px 24px 24px', gap: 20, minHeight: 0 }}>
          {/* GRAPH CANVAS WRAPPER */}
          <div className="glass-panel" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* CANVAS FILTER BAR */}
            <div style={{ 
              display: 'flex', 
              padding: '16px', 
              borderBottom: '1px solid var(--border-color)', 
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(10, 9, 20, 0.4)',
              zIndex: 5
            }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>Target Repository</span>
                <span style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GitBranch size={16} className="text-purple-400" />
                  {graphData.repo_name}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: 12 }}>
                {/* Search */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search files..." 
                    className="cyber-input"
                    style={{ padding: '8px 12px 8px 36px', fontSize: '13px', width: '200px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Filter Type */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Filter size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                  <select 
                    className="cyber-input"
                    style={{ 
                      padding: '8px 24px 8px 36px', 
                      fontSize: '13px', 
                      width: '130px', 
                      appearance: 'none', 
                      cursor: 'pointer' 
                    }}
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="ALL">All Files</option>
                    {fileTypes.map(t => (
                      <option key={t} value={t}>.{t} Files</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* RENDER CANVAS */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {filteredNodes.length === 0 ? (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 5 }}>
                  <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <h4 style={{ color: 'var(--text-secondary)' }}>No matching nodes found</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Try resetting your search filters.</p>
                </div>
              ) : (
                <DependencyGraph 
                  apiNodes={filteredNodes}
                  apiEdges={filteredEdges}
                  selectedNodeId={selectedNodeId}
                  blastRadiusIds={blastRadius}
                  onSelectNode={selectNode}
                />
              )}
            </div>
          </div>

          {/* INSPECTION SIDEBAR */}
          <aside className="glass-panel" style={{ width: '360px', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0 }}>
            {selectedNodeDetails ? (
              // Selected File Node Detail
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    File Inspected
                  </span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', wordBreak: 'break-all' }}>
                    {selectedNodeDetails.label}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {selectedNodeDetails.id}
                  </p>
                </div>

                <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* File Stats */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>LINES</span>
                      <strong style={{ fontSize: '18px', color: 'var(--color-accent)' }}>{selectedNodeDetails.loc}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>SIZE</span>
                      <strong style={{ fontSize: '18px', color: 'var(--color-primary)' }}>
                        {(selectedNodeDetails.size / 1024).toFixed(1)} KB
                      </strong>
                    </div>
                  </div>

                  {selectedIsRemovalCandidate && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, padding: 12 }}>
                      <strong style={{ display: 'block', fontSize: 12, color: '#fbbf24' }}>Safe to investigate for removal</strong>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 5 }}>RepoPulse found no local file importing this module. This is a candidate, not proof of dead code—check runtime loading, scripts, and external consumers before removal.</p>
                    </div>
                  )}

                  {/* Outgoing Imports (What it depends on) */}
                  <div>
                    <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Imports ({selectedNodeDetails.imports.length})</span>
                    </h4>
                    {selectedNodeDetails.imports.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Imports no local modules.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedNodeDetails.imports.map(imp => (
                          <li 
                          key={imp}
                            onClick={() => selectNode(imp)}
                            style={{ 
                              background: 'rgba(255,255,255,0.02)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '6px',
                              padding: '8px 12px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-mono)',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap'
                            }}
                            className="hover:border-purple-500"
                          >
                            {imp}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Incoming Imports (What imports this file) */}
                  <div>
                    <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Imported By ({selectedNodeDetails.importedBy.length})
                    </h4>
                    {selectedNodeDetails.importedBy.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Not imported by any local module.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedNodeDetails.importedBy.map(impBy => (
                          <li 
                          key={impBy}
                            onClick={() => selectNode(impBy)}
                            style={{ 
                              background: 'rgba(255,255,255,0.02)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '6px',
                              padding: '8px 12px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-mono)',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {impBy}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ background: 'rgba(6, 182, 212, 0.07)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-accent)' }}>
                      <Zap size={16} />
                      <strong style={{ fontSize: '12px' }}>Blast Radius</strong>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
                      A change here can affect <strong style={{ color: 'var(--text-primary)' }}>{blastRadius.length}</strong> downstream file{blastRadius.length === 1 ? '' : 's'} through local import paths.
                    </p>
                    {blastRadius.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {blastRadius.slice(0, 5).map(id => (
                          <button key={id} type="button" onClick={() => selectNode(id)} style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)', color: 'var(--text-primary)', borderRadius: 5, padding: '4px 6px', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                            {id.split('/').pop()}
                          </button>
                        ))}
                        {blastRadius.length > 5 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0' }}>+{blastRadius.length - 5} more</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <button className="cyber-button-secondary" onClick={() => setShowDeleteImpact(value => !value)} style={{ width: '100%', justifyContent: 'center', borderColor: showDeleteImpact ? 'rgba(239, 68, 68, 0.55)' : undefined, color: showDeleteImpact ? '#fca5a5' : undefined }}>
                      <Trash2 size={15} /> {showDeleteImpact ? 'Hide Delete Assessment' : 'Simulate File Deletion'}
                    </button>
                    {showDeleteImpact && deleteImpact && (
                      <div style={{ marginTop: 10, background: 'rgba(239, 68, 68, 0.07)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10, padding: 14 }}>
                        <strong style={{ display: 'block', fontSize: 12, color: '#fca5a5' }}>Deleting this file will break or affect</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                          <ImpactMetric icon={<Link2 size={14} />} label="Direct imports" value={deleteImpact.directImporters.length} />
                          <ImpactMetric icon={<Zap size={14} />} label="Total blast radius" value={deleteImpact.blastRadius.length} />
                          <ImpactMetric icon={<TestTube2 size={14} />} label="Affected tests" value={deleteImpact.testFiles.length} />
                          <ImpactMetric icon={<Route size={14} />} label="API / route files" value={deleteImpact.apiFiles.length} />
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 12 }}>
                          Risk: <strong style={{ color: '#fca5a5' }}>{deleteImpact.riskLevel}</strong> · estimated remediation {deleteImpact.estimatedTime}. CI pipelines are not yet indexed, so they are excluded from this assessment.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
                  <button 
                    className="cyber-button-secondary" 
                    onClick={() => selectNode(null)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Clear Inspection
                  </button>
                </div>
              </div>
            ) : (
              // General Repository Details & Sidebar Explorer
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Repository Stats
                  </span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                    Overview
                  </h3>
                </div>

                <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Indexed Files</span>
                      <strong style={{ fontSize: '14px' }}>{graphData.nodes.length}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Module Connections</span>
                      <strong style={{ fontSize: '14px' }}>{graphData.edges.length}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Avg. Dependencies</span>
                      <strong style={{ fontSize: '14px' }}>
                        {graphData.nodes.length > 0 ? (graphData.edges.length / graphData.nodes.length).toFixed(2) : 0}
                      </strong>
                    </div>
                  </div>

                  {healthReport && (
                    <section style={{ background: 'rgba(168, 85, 247, 0.07)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-primary)' }}><ShieldCheck size={16} /><strong style={{ fontSize: 12 }}>Architecture Health</strong></div>
                        <strong style={{ fontSize: 18 }}>{healthReport.score}<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> / 100</span></strong>
                      </div>
                      <HealthList title="Strengths" items={healthReport.strengths} positive />
                      <HealthList title="Investigate" items={healthReport.weaknesses} />
                    </section>
                  )}

                  <section style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-warning)' }}><CircleAlert size={16} /><strong style={{ fontSize: 12 }}>Removal Candidates</strong></div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 7 }}>Files with no detected local importers, excluding entry points and tests. Review before deleting.</p>
                    {deadCodeCandidates.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 9 }}>No candidates detected.</p> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                        {deadCodeCandidates.slice(0, 5).map(node => <button key={node.id} type="button" onClick={() => selectNode(node.id)} style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.16)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 8px', textAlign: 'left', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.id}</button>)}
                        {deadCodeCandidates.length > 5 && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>+{deadCodeCandidates.length - 5} more candidates</span>}
                      </div>
                    )}
                  </section>

                  {/* List of Files in Sidebar */}
                  <div>
                    <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Indexed Files ({filteredNodes.length})
                    </h4>
                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {filteredNodes.map(node => (
                        <div 
                          key={node.id}
                          onClick={() => selectNode(node.id)}
                          style={{ 
                            padding: '8px 12px', 
                            fontSize: '12px', 
                            background: 'rgba(255,255,255,0.01)', 
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                            {node.id}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{node.loc} L</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Select any file node in the canvas to view import/export dependencies.
                  </span>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* FOOTER */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '16px', 
        fontSize: '11px', 
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border-color)',
        background: 'rgba(5, 5, 10, 0.8)',
        zIndex: 5
      }}>
        RepoPulse AI • Created for Hackathon Startup Pitch prototype • Step 1 Graph Visualization
      </footer>
    </div>
  );
}
