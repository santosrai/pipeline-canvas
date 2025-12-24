import { PipelineNode } from '../types/index';

/**
 * Resolves template variables in strings like {{input.target}} or {{config.contigs}}
 */
export function resolveTemplate(
  template: string,
  node: PipelineNode,
  inputData: Record<string, any>
): any {
  if (typeof template !== 'string') {
    return template;
  }

  // Match {{variable}} patterns
  const templateRegex = /\{\{([^}]+)\}\}/g;
  
  return template.replace(templateRegex, (match, path) => {
    const trimmedPath = path.trim();
    
    // Handle {{input.handleId}} - get data from input connections
    if (trimmedPath.startsWith('input.')) {
      const handleId = trimmedPath.replace('input.', '');
      const value = inputData[handleId];
      if (value === undefined || value === null) {
        throw new Error(`Input '${handleId}' not found for node ${node.id}`);
      }
      return value;
    }
    
    // Handle {{config.fieldName}} - get from node config
    if (trimmedPath.startsWith('config.')) {
      const fieldName = trimmedPath.replace('config.', '');
      // Get value from node config
      const value = node.config?.[fieldName];
      
      // For API keys and sensitive fields, return empty string if not set (allows fallback)
      // For other fields, return empty string as well (API will handle defaults)
      if (value === undefined || value === null || value === '') {
        return '';
      }
      
      return value;
    }
    
    // Handle {{node.fieldName}} - get from node metadata
    if (trimmedPath.startsWith('node.')) {
      const fieldName = trimmedPath.replace('node.', '');
      return (node as any)[fieldName] || '';
    }
    
    return match; // Return original if pattern not recognized
  });
}

/**
 * Recursively resolves all template variables in an object
 */
export function resolveTemplates(
  obj: any,
  node: PipelineNode,
  inputData: Record<string, any>
): any {
  if (typeof obj === 'string') {
    // Check if it's a template string
    if (obj.includes('{{')) {
      return resolveTemplate(obj, node, inputData);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveTemplates(item, node, inputData));
  }
  
  if (obj && typeof obj === 'object') {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveTemplates(value, node, inputData);
    }
    return resolved;
  }
  
  return obj;
}

