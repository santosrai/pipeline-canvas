import { PipelineNode } from '../types/index';

/**
 * Performs topological sort on pipeline nodes based on their edges
 * Returns an array of node IDs in execution order
 */
export function topologicalSort(
  nodes: PipelineNode[],
  edges: Array<{ source: string; target: string }>
): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  
  // Initialize
  nodeIds.forEach((id) => {
    inDegree.set(id, 0);
    graph.set(id, []);
  });
  
  // Build graph and calculate in-degrees
  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      graph.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });
  
  // Find nodes with no incoming edges
  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  const result: string[] = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    
    const neighbors = graph.get(nodeId) || [];
    neighbors.forEach((neighbor) => {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }
  
  return result;
}



