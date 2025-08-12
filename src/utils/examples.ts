export interface ExampleTemplate {
  id: string;
  title: string;
  description: string;
  code: string;
  category: 'basic' | 'advanced' | 'analysis';
}

export const exampleTemplates: ExampleTemplate[] = [
  {
    id: 'insulin-basic',
    title: 'Insulin Structure',
    description: 'Basic visualization of insulin protein structure',
    category: 'basic',
    code: `// Insulin Structure Visualization
try {
  await builder.loadStructure('1ZNI');
  
  await builder.addCartoonRepresentation({
    color: 'chain-id'
  });
  
  builder.focusView();
  console.log('Insulin loaded successfully');
} catch (error) {
  console.error('Failed to load insulin:', error);
}`
  },
  
  {
    id: 'hemoglobin-heme',
    title: 'Hemoglobin with Heme Groups',
    description: 'Hemoglobin structure highlighting heme cofactors',
    category: 'basic',
    code: `// Hemoglobin with Heme Groups
try {
  await builder.loadStructure('1HHO');
  
  await builder.addCartoonRepresentation({
    color: 'secondary-structure'
  });
  
  await builder.highlightLigands();
  
  builder.focusView();
  console.log('Hemoglobin with heme groups loaded');
} catch (error) {
  console.error('Failed to load hemoglobin:', error);
}`
  },
  
  {
    id: 'dna-double-helix',
    title: 'DNA Double Helix',
    description: 'DNA structure with nucleotide-based coloring',
    category: 'basic',
    code: `// DNA Double Helix
try {
  await builder.loadStructure('1BNA');
  
  await builder.addCartoonRepresentation({
    color: 'nucleotide'
  });
  
  builder.focusView();
  console.log('DNA double helix loaded');
} catch (error) {
  console.error('Failed to load DNA:', error);
}`
  },
  
  {
    id: 'protein-surface',
    title: 'Protein Surface Visualization',
    description: 'Display protein as a molecular surface',
    category: 'advanced',
    code: `// Protein Surface Visualization
try {
  await builder.loadStructure('1CBS');
  
  // Add surface representation
  await builder.addSurfaceRepresentation({
    color: 'hydrophobicity',
    alpha: 0.8
  });
  
  // Add cartoon for context
  await builder.addCartoonRepresentation({
    color: 'secondary-structure',
    alpha: 0.3
  });
  
  builder.focusView();
  console.log('Protein surface visualization loaded');
} catch (error) {
  console.error('Failed to load protein surface:', error);
}`
  },
  
  {
    id: 'binding-site-analysis',
    title: 'Binding Site Analysis',
    description: 'Analyze and visualize protein-ligand binding sites',
    category: 'analysis',
    code: `// Binding Site Analysis
try {
  await builder.loadStructure('1CBS');
  
  // Show protein as cartoon
  await builder.addCartoonRepresentation({
    color: 'chain-id'
  });
  
  // Highlight ligands
  await builder.highlightLigands();
  
  builder.focusView();
  console.log('Binding site analysis complete');
} catch (error) {
  console.error('Failed to analyze binding site:', error);
}`
  },
  
  {
    id: 'multi-chain-complex',
    title: 'Multi-Chain Protein Complex',
    description: 'Visualize complex protein assemblies',
    category: 'advanced',
    code: `// Multi-Chain Protein Complex
try {
  await builder.loadStructure('1IGT');
  
  // Different colors for each chain
  await builder.addCartoonRepresentation({
    color: 'chain-id'
  });
  
  // Add surface for one chain
  await builder.addSurfaceRepresentation({
    color: 'uniform',
    alpha: 0.3
  });
  
  builder.focusView();
  console.log('Multi-chain complex loaded');
} catch (error) {
  console.error('Failed to load complex:', error);
}`
  },
  
  {
    id: 'residue-highlighting',
    title: 'Specific Residue Highlighting',
    description: 'Highlight and label specific residues using selectors',
    category: 'analysis',
    code: `// Specific Residue Highlighting
try {
  await builder.loadStructure('1CBS');
  
  // Show protein as cartoon
  await builder.addCartoonRepresentation({
    color: 'secondary-structure'
  });
  
  // Highlight a specific residue in chain A
  const residue = {label_asym_id: 'A', label_seq_id: 120};
  await builder.highlightResidue(residue, {color: 'red'});
  
  // Label the residue
  await builder.labelResidue(residue, 'ALA 120 A: Important Site');
  
  // Focus on the residue
  await builder.focusResidue(residue);
  
  console.log('Residue highlighting complete');
} catch (error) {
  console.error('Failed to highlight residue:', error);
}`
  }
];

export const getExamplesByCategory = (category: ExampleTemplate['category']) => {
  return exampleTemplates.filter(template => template.category === category);
};

export const getExampleById = (id: string) => {
  return exampleTemplates.find(template => template.id === id);
};