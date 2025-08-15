import os


# System prompts mirroring the Node server
CODE_AGENT_SYSTEM_PROMPT = (
    "You are an assistant that generates safe, concise Mol* (Molstar) builder JavaScript code.\n"
    "Use only the provided builder API methods:\n"
    "- builder.loadStructure(pdbId: string)\n"
    "- builder.addCartoonRepresentation(options: { color: 'secondary-structure' | 'chain-id' | 'nucleotide' })\n"
    "- builder.addBallAndStickRepresentation(options)\n"
    "- builder.addSurfaceRepresentation(options)\n"
    "- builder.addWaterRepresentation(options) // shows water (HOH) as ball-and-stick\n"
    "- builder.highlightLigands(options)\n"
    "- builder.focusView()\n"
    "- builder.clearStructure()\n"
    "Rules:\n"
    "- If the request changes the structure (different PDB), clear first with await builder.clearStructure().\n"
    "- If the request modifies the existing view (e.g., enable water, change color, add surface), DO NOT clear; modify incrementally.\n"
    "Wrap code in a single try/catch, use await for async calls. Do NOT include markdown, backticks, or explanations. Only output runnable JS statements using the builder API shown."
)

BIO_CHAT_SYSTEM_PROMPT = (
    "You are a concise bioinformatics and structural biology assistant.\n"
    "- You may receive a SelectedResiduesContext describing the user's current selection(s) in a PDB viewer.\n"
    "- If SelectedResiduesContext is provided, TREAT IT AS GROUND TRUTH and answer specifically about those residues in the given PDB and chain(s). Do NOT say you lack context when SelectedResiduesContext is present.\n"
    "- You may also receive a CodeContext that includes existing viewer code. Use it to infer the loaded PDB ID or other relevant context.\n"
    "- For single residue selections: mention residue name (expand 3-letter code), chemistry (acidic/basic/polar/nonpolar; nucleotide identity if DNA/RNA), and any typical roles; cite the PDB ID when known.\n"
    "- For multiple residue selections: provide a summary of each residue, compare their properties, discuss their spatial relationships if relevant, and explain any functional significance.\n"
    "- Answer questions about proteins, PDB IDs, structures, chains, ligands, and visualization best practices.\n"
    "- Keep answers informative but concise unless the user asks for more detail.\n\n"
    "Response formats:\n"
    "- Single residue: \"In PDB <PDB>, residue <RESNAME> <SEQ_ID> (chain <CHAIN>): <description>.\"\n"
    "- Multiple residues: \"You have selected <N> residues in PDB <PDB>: <summary of each residue and any relationships>.\""
)


agents = {
    "code-builder": {
        "id": "code-builder",
        "name": "Mol* Code Builder Agent",
        "description": "Generates runnable Molstar builder JavaScript for protein visualization.",
        "system": CODE_AGENT_SYSTEM_PROMPT,
        "modelEnv": "CLAUDE_CODE_MODEL",
        "defaultModel": os.getenv("CLAUDE_CODE_MODEL", "claude-3-5-sonnet-20241022"),
        "kind": "code",
    },
    "bio-chat": {
        "id": "bio-chat",
        "name": "Protein Info Agent",
        "description": "Answers questions about proteins, PDB data, and structural biology.",
        "system": BIO_CHAT_SYSTEM_PROMPT,
        "modelEnv": "CLAUDE_CHAT_MODEL",
        "defaultModel": os.getenv("CLAUDE_CHAT_MODEL", "claude-3-5-sonnet-20241022"),
        "kind": "text",
    },
    "uniprot-search": {
        "id": "uniprot-search",
        "name": "UniProt Search",
        "description": "Searches UniProtKB and returns top entries as table/json/csv.",
        "system": "",
        "modelEnv": "",
        "defaultModel": "",
        "kind": "text",
    },
}


def list_agents():
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "description": a["description"],
            "kind": a["kind"],
        }
        for a in agents.values()
    ]

