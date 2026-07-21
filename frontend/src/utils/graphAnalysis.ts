/**
 * graphAnalysis.ts
 * Pure computation utilities for RepoPulse AI graph analytics.
 * All functions are deterministic and run fully on the frontend from node/edge data.
 */

export interface ApiNode {
  id: string;
  label: string;
  type: string;
  size: number;
  loc: number;
}

export interface ApiEdge {
  id: string;
  source: string;
  target: string;
}

// ─── Entry Point Detection ────────────────────────────────────────────────────
const ENTRY_PATTERNS = [
  /^main\.(py|ts|js|tsx)$/i,
  /^index\.(ts|js|tsx|jsx)$/i,
  /^app\.(py|ts|js|tsx)$/i,
  /^server\.(py|ts|js)$/i,
  /^__init__\.py$/i,
  /^conf\.py$/i,
  /^setup\.py$/i,
  /^manage\.py$/i,
  /^wsgi\.py$/i,
  /^asgi\.py$/i,
  /^vite\.config\.(ts|js)$/i,
  /^next\.config\.(ts|js)$/i,
];

export function isEntryPoint(filename: string): boolean {
  return ENTRY_PATTERNS.some(p => p.test(filename));
}

// ─── Blast Radius ─────────────────────────────────────────────────────────────
/**
 * BFS upward through the dependency graph.
 * Returns every file that transitively DEPENDS ON the given nodeId —
 * i.e., if you change nodeId, all of these are potentially affected.
 */
export function computeBlastRadius(nodeId: string, edges: ApiEdge[]): Set<string> {
  const affected = new Set<string>();
  const queue: string[] = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.target === current && !affected.has(edge.source)) {
        affected.add(edge.source);
        queue.push(edge.source);
      }
    }
  }

  return affected;
}

// ─── Dead Code Detection ──────────────────────────────────────────────────────
/**
 * Returns nodeIds that:
 * – have 0 incoming edges (nobody imports them)
 * – are not known entry points
 * – are not test files (they're designed to be standalone)
 */
export function findDeadCode(nodes: ApiNode[], edges: ApiEdge[]): Set<string> {
  const hasIncoming = new Set(edges.map(e => e.target));
  const dead = new Set<string>();

  for (const node of nodes) {
    if (hasIncoming.has(node.id)) continue;
    if (isEntryPoint(node.label)) continue;
    // Test files are intentionally not imported — don't flag them
    if (/test|spec|\.test\.|\.spec\./i.test(node.id)) continue;
    dead.add(node.id);
  }

  return dead;
}

// ─── Circular Dependency Detection ───────────────────────────────────────────
export function detectCircularDeps(nodes: ApiNode[], edges: ApiEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
  });

  const visited  = new Set<string>();
  const onStack  = new Set<string>();
  const cycles:  string[][] = [];

  const dfs = (node: string, path: string[]): void => {
    visited.add(node);
    onStack.add(node);
    path.push(node);

    for (const neighbor of (adj.get(node) ?? [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (onStack.has(neighbor) && cycles.length < 8) {
        const start = path.indexOf(neighbor);
        if (start !== -1) cycles.push(path.slice(start));
      }
    }

    onStack.delete(node);
  };

  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id, []);
  }

  return cycles;
}

// ─── God Components ───────────────────────────────────────────────────────────
export function findGodComponents(
  nodes: ApiNode[],
  edges: ApiEdge[],
  threshold?: number,
): { node: ApiNode; inDegree: number }[] {
  const inDegree = new Map<string, number>();
  nodes.forEach(n => inDegree.set(n.id, 0));
  edges.forEach(e => inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1));

  const t = threshold ?? Math.max(4, Math.floor(nodes.length * 0.12));

  return nodes
    .filter(n => (inDegree.get(n.id) ?? 0) >= t)
    .map(n => ({ node: n, inDegree: inDegree.get(n.id)! }))
    .sort((a, b) => b.inDegree - a.inDegree);
}

// ─── Architecture Health Score ────────────────────────────────────────────────
export interface HealthReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  strengths: string[];
  weaknesses: string[];
  metrics: {
    avgOutDegree: number;
    deadCodeCount: number;
    circularDepsCount: number;
    godComponentCount: number;
    avgLoc: number;
    largeFileCount: number;
    totalFiles: number;
    totalEdges: number;
  };
}

export function computeHealthScore(nodes: ApiNode[], edges: ApiEdge[]): HealthReport {
  const strengths:  string[] = [];
  const weaknesses: string[] = [];
  let score = 100;

  if (nodes.length === 0) {
    return {
      score: 0, grade: 'F', strengths: [], weaknesses: ['No files indexed'],
      metrics: { avgOutDegree: 0, deadCodeCount: 0, circularDepsCount: 0, godComponentCount: 0, avgLoc: 0, largeFileCount: 0, totalFiles: 0, totalEdges: 0 },
    };
  }

  // 1. Coupling
  const avgOutDegree = parseFloat((edges.length / nodes.length).toFixed(2));
  if (avgOutDegree > 8)      { score -= 18; weaknesses.push('Very high coupling'); }
  else if (avgOutDegree > 5) { score -= 9;  weaknesses.push('Moderate coupling'); }
  else if (avgOutDegree > 3) { strengths.push('Reasonable coupling'); }
  else                       { strengths.push('Low coupling'); }

  // 2. Dead code
  const deadCode = findDeadCode(nodes, edges);
  const deadRatio = deadCode.size / nodes.length;
  if (deadRatio > 0.3)      { score -= 14; weaknesses.push(`High dead code — ${deadCode.size} orphan files`); }
  else if (deadRatio > 0.1) { score -= 6;  weaknesses.push(`${deadCode.size} potentially unused file${deadCode.size > 1 ? 's' : ''}`); }
  else if (deadCode.size === 0) { strengths.push('No dead code detected'); }
  else { strengths.push('Minimal dead code'); }

  // 3. Circular dependencies
  const cycles = detectCircularDeps(nodes, edges);
  if (cycles.length > 5)    { score -= 18; weaknesses.push('Many circular dependencies'); }
  else if (cycles.length > 0) { score -= 9; weaknesses.push(`${cycles.length} circular dependenc${cycles.length > 1 ? 'ies' : 'y'}`); }
  else { strengths.push('No circular dependencies'); }

  // 4. God components
  const gods = findGodComponents(nodes, edges);
  if (gods.length > 3)    { score -= 14; weaknesses.push(`${gods.length} god components (too many dependents)`); }
  else if (gods.length > 0) { score -= 6; weaknesses.push(`${gods.length} highly-coupled component${gods.length > 1 ? 's' : ''}`); }
  else { strengths.push('No god components'); }

  // 5. Large files
  const largeFiles = nodes.filter(n => n.loc > 500);
  const avgLoc = Math.round(nodes.reduce((s, n) => s + n.loc, 0) / nodes.length);
  if (largeFiles.length > nodes.length * 0.2) { score -= 10; weaknesses.push('Many large files (>500 LOC)'); }
  else if (largeFiles.length > 0) { weaknesses.push(`${largeFiles.length} large file${largeFiles.length > 1 ? 's' : ''} (>500 LOC)`); score -= 4; }
  else { strengths.push('Manageable file sizes'); }

  // 6. Modularity bonus
  const hasFrontend  = nodes.some(n => n.id.includes('frontend') || n.id.includes('components'));
  const hasBackend   = nodes.some(n => n.id.includes('backend')  || n.id.includes('api'));
  if (hasFrontend && hasBackend) strengths.push('Separated frontend/backend structure');
  else if (hasFrontend)          strengths.push('Modular frontend structure');

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return {
    score, grade, strengths, weaknesses,
    metrics: {
      avgOutDegree,
      deadCodeCount:     deadCode.size,
      circularDepsCount: cycles.length,
      godComponentCount: gods.length,
      avgLoc,
      largeFileCount:    largeFiles.length,
      totalFiles:        nodes.length,
      totalEdges:        edges.length,
    },
  };
}

// ─── Delete Impact Simulation ─────────────────────────────────────────────────
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DeleteImpact {
  directImporters: string[];
  blastRadius:     string[];
  testFiles:       string[];
  apiFiles:        string[];
  riskLevel:       RiskLevel;
  estimatedTime:   string;
}

export function computeDeleteImpact(
  nodeId:  string,
  edges:   ApiEdge[],
): DeleteImpact {
  const directImporters = edges
    .filter(e => e.target === nodeId)
    .map(e => e.source);

  const blastSet   = computeBlastRadius(nodeId, edges);
  const blastRadius = Array.from(blastSet);

  const testFiles = blastRadius.filter(id =>
    /test|spec|__tests__/i.test(id),
  );
  const apiFiles = blastRadius.filter(id =>
    /api|route|handler|controller|endpoint/i.test(id),
  );

  const total = blastRadius.length;
  const riskLevel: RiskLevel =
    total > 20 ? 'CRITICAL' :
    total > 10 ? 'HIGH'     :
    total > 4  ? 'MEDIUM'   : 'LOW';

  const estimatedTime =
    total > 20 ? '2–5 days'   :
    total > 10 ? '4–8 hours'  :
    total > 4  ? '1–3 hours'  : '< 1 hour';

  return { directImporters, blastRadius, testFiles, apiFiles, riskLevel, estimatedTime };
}
