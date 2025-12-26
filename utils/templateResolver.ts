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
  
  // Check if template contains any variables
  if (!templateRegex.test(template)) {
    return template;
  }
  
  // Reset regex (test() advances the lastIndex)
  templateRegex.lastIndex = 0;
  
  // Check if the entire string is just a template variable (for preserving types)
  const fullMatch = template.match(/^\{\{([^}]+)\}\}$/);
  if (fullMatch) {
    const trimmedPath = fullMatch[1].trim();
    
    // Handle {{input.handleId}} - get data from input connections
    if (trimmedPath.startsWith('input.')) {
      const handleId = trimmedPath.replace('input.', '');
      const value = inputData[handleId];
      if (value === undefined || value === null) {
        throw new Error(`Input '${handleId}' not found for node ${node.id}`);
      }
      // Return value as-is to preserve type (object, number, etc.)
      return value;
    }
    
    // Handle {{config.fieldName}} - get from node config
    if (trimmedPath.startsWith('config.')) {
      const fieldName = trimmedPath.replace('config.', '');
      const value = node.config?.[fieldName];
      
      if (value === undefined || value === null || value === '') {
        return '';
      }
      // Return value as-is to preserve type (number, boolean, object, etc.)
      return value;
    }
    
    // Handle {{node.fieldName}} - get from node metadata
    if (trimmedPath.startsWith('node.')) {
      const fieldName = trimmedPath.replace('node.', '');
      return (node as any)[fieldName] || '';
    }
  }
  
  // For strings with embedded templates, use replace
  return template.replace(templateRegex, (match, path) => {
    const trimmedPath = path.trim();
    
    // Handle {{input.handleId}} - get data from input connections
    if (trimmedPath.startsWith('input.')) {
      const handleId = trimmedPath.replace('input.', '');
      const value = inputData[handleId];
      if (value === undefined || value === null) {
        throw new Error(`Input '${handleId}' not found for node ${node.id}`);
      }
      // For embedded templates, convert to string
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    
    // Handle {{config.fieldName}} - get from node config
    if (trimmedPath.startsWith('config.')) {
      const fieldName = trimmedPath.replace('config.', '');
      const value = node.config?.[fieldName];
      
      if (value === undefined || value === null || value === '') {
        return '';
      }
      // For embedded templates, convert to string
      return String(value);
    }
    
    // Handle {{node.fieldName}} - get from node metadata
    if (trimmedPath.startsWith('node.')) {
      const fieldName = trimmedPath.replace('node.', '');
      return String((node as any)[fieldName] || '');
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

