import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8787;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LOG_AI = process.env.LOG_AI !== '0';
const DEBUG_API = process.env.DEBUG_API === '1';

function logLine(section, message) {
  if (!LOG_AI) return;
  const ts = new Date().toISOString();
  // Avoid extremely long lines in console; truncate large payloads
  const output = typeof message === 'string' ? message : JSON.stringify(message);
  const trimmed = output.length > 8000 ? output.slice(0, 8000) + '... [truncated]' : output;
  console.log(`[${section}] ${ts} ${trimmed}`);
}

// --- Agent registry (lightweight multi-agent framework) ---
const CODE_AGENT_SYSTEM_PROMPT = `You are an assistant that generates safe, concise Mol* (Molstar) builder JavaScript code.
Use only the provided builder API methods:
- builder.loadStructure(pdbId: string)
- builder.addCartoonRepresentation(options: { color: 'secondary-structure' | 'chain-id' | 'nucleotide' })
- builder.addBallAndStickRepresentation(options)
- builder.addSurfaceRepresentation(options)
- builder.addWaterRepresentation(options) // shows water (HOH) as ball-and-stick
- builder.highlightLigands(options)
- builder.focusView()
- builder.clearStructure()
RESIDUE/CHAIN SELECTOR METHODS:
- builder.highlightResidue(selector, options) // selector: {label_asym_id: 'A', label_seq_id: 120}
- builder.labelResidue(selector, text) // adds text label to specific residue
- builder.focusResidue(selector) // focuses camera on specific residue

SELECTOR SYNTAX:
- Specific residue: {label_asym_id: 'A', label_seq_id: 120}
- Chain only: {label_asym_id: 'A'}
- Alternative: {auth_asym_id: 'A', auth_seq_id: 120}

EXAMPLES:
// Highlight residue 120 in chain A as red
await builder.highlightResidue({label_asym_id: 'A', label_seq_id: 120}, {color: 'red'});
// Label and focus on a residue
const residue = {label_asym_id: 'A', label_seq_id: 120};
await builder.labelResidue(residue, 'ALA 120 A: Important Site');
await builder.focusResidue(residue);

Rules:
- When residue/chain information is provided, use selector methods with {label_asym_id, label_seq_id}
- If the request changes the structure (different PDB), clear first with await builder.clearStructure().
- If the request modifies the existing view (e.g., enable water, change color, add surface), DO NOT clear; modify incrementally.
Wrap code in a single try/catch, use await for async calls. Do NOT include markdown, backticks, or explanations. Only output runnable JS statements using the builder API shown.`;

const BIO_CHAT_SYSTEM_PROMPT = `You are a concise bioinformatics and structural biology assistant.
- You may receive a SelectionContext describing the user's current selection in a PDB viewer.
- If SelectionContext is provided, TREAT IT AS GROUND TRUTH and answer specifically about that residue in the given PDB and chain. Do NOT say you lack context when SelectionContext is present.
- You may also receive a CodeContext that includes existing viewer code. Use it to infer the loaded PDB ID or other relevant context if SelectionContext lacks a PDB ID.
- Prefer a short, factual answer first; mention residue name (expand 3-letter code), chemistry (acidic/basic/polar/nonpolar; nucleotide identity if DNA/RNA), and any typical roles; cite the PDB ID when known.
- If a proposedMutation is present, briefly compare side-chain/nucleotide differences and potential effects at a high-level without fabricating structure-specific claims.
- Answer questions about proteins, PDB IDs, structures, chains, ligands, and visualization best practices.
- Keep answers short and to the point unless the user asks for more detail.

When the user asks a vague question like "what is this?" and SelectionContext is provided, start with:
"In PDB <PDB>, residue <RESNAME> <SEQ_ID> (chain <CHAIN>): <concise description>."`;

const agents = {
  'code-builder': {
    id: 'code-builder',
    name: 'Mol* Code Builder Agent',
    description: 'Generates runnable Molstar builder JavaScript for protein visualization.',
    system: CODE_AGENT_SYSTEM_PROMPT,
    modelEnv: 'CLAUDE_CODE_MODEL',
    defaultModel: 'claude-3-5-sonnet-20241022',
    kind: 'code',
  },
  'bio-chat': {
    id: 'bio-chat',
    name: 'Protein Info Agent',
    description: 'Answers questions about proteins, PDB data, and structural biology.',
    system: BIO_CHAT_SYSTEM_PROMPT,
    modelEnv: 'CLAUDE_CHAT_MODEL',
    defaultModel: 'claude-3-5-sonnet-20241022',
    kind: 'text',
  },
};

function listAgents() {
  return Object.values(agents).map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    kind: a.kind,
  }));
}

function pickAgentForPrompt(prompt, selection) {
  const p = String(prompt || '').toLowerCase();
  const visualizationKeywords = [
    'show ', 'display ', 'visualize', 'render', 'color', 'colour', 'cartoon', 'surface', 'ball-and-stick', 'water', 'ligand', 'focus', 'zoom', 'load', 'pdb', 'highlight', 'chain', 'view', 'representation'
  ];
  const likelyCode = visualizationKeywords.some(k => p.includes(k));
  const interrogatives = ['what is this', "what's this", 'what am i looking at', 'this residue', 'selected', 'identify', 'which residue'];
  const hasSelectionQuestion = Array.isArray(interrogatives) && interrogatives.some(k => p.includes(k));
  if (selection && hasSelectionQuestion) return agents['bio-chat'];
  return likelyCode ? agents['code-builder'] : agents['bio-chat'];
}

async function runAgent({ agent, userText, currentCode, history, selection }) {
  const model = process.env[agent.modelEnv] || agent.defaultModel;
  const baseLog = { model, agentId: agent.id };

  if (agent.kind === 'code') {
    // Build user content with optional code context and brief history
    const contextPrefix = currentCode && String(currentCode).trim().length > 0
      ? `You may MODIFY the existing Molstar builder code below to satisfy the new request. Prefer editing in-place if it does not change the loaded PDB. Always return the full updated code.\n\nExisting code:\n\n\u0060\u0060\u0060js\n${String(currentCode)}\n\u0060\u0060\u0060\n\nRequest: ${userText}`
      : `Generate Molstar builder code for: ${userText}`;

    const priorDialogue = Array.isArray(history) && history.length
      ? `\n\nRecent context: ${history.map(m => `${m.type}: ${m.content}`).slice(-4).join(' | ')}`
      : '';

    logLine('agent:code:req', { ...baseLog, hasCurrentCode: Boolean(currentCode && String(currentCode).trim()), userText });
    const completion = await anthropic.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: agent.system,
      messages: [
        { role: 'user', content: contextPrefix + priorDialogue },
      ],
    });
    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : String(completion.content || '');
    const code = String(content)
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    logLine('agent:code:res', `code (${code.length} chars)`);
    return { type: 'code', code };
  }

  // Text agent
  const selectionContext = selection ? `Context:\n- PDB: ${selection.pdbId || 'unknown'}\n- Kind: ${selection.kind}\n- Residue: ${selection.compId || '?'}\n- label_seq_id: ${selection.labelSeqId ?? 'null'}\n- auth_seq_id: ${selection.authSeqId ?? 'null'}\n- insCode: ${selection.insCode ?? 'null'}\n- label_asym_id: ${selection.labelAsymId || 'null'}\n- auth_asym_id: ${selection.authAsymId || 'null'}\n${selection.mutation?.toCompId ? `- ProposedMutation: ${selection.compId || '?'}${selection.authSeqId ?? '?'}${selection.authAsymId || ''} -> ${selection.mutation.toCompId}\n` : ''}` : '';
  const codeContext = currentCode && String(currentCode).trim().length > 0 ? `Additional code context (may indicate PDB via builder.loadStructure):\n${String(currentCode).slice(0, 3000)}` : '';

  const messages = [];
  if (selectionContext || codeContext) {
    messages.push({ role: 'user', content: [selectionContext, codeContext].filter(Boolean).join('\n\n') });
  }
  messages.push({ role: 'user', content: userText });

  logLine('agent:text:req', { ...baseLog, hasSelection: Boolean(selection), userText, selection });
  const completion = await anthropic.messages.create({
    model,
    max_tokens: 800,
    temperature: 0.5,
    system: agent.system,
    messages,
  });
  const text = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
  logLine('agent:text:res', { preview: text.slice(0, 400), length: text.length });
  return { type: 'text', text };
}

// Single-purpose endpoints (backward compatibility)
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, currentCode, history } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Build user content with optional code context and brief history
    const contextPrefix = currentCode && String(currentCode).trim().length > 0
      ? `You may MODIFY the existing Molstar builder code below to satisfy the new request. Prefer editing in-place if it does not change the loaded PDB. Always return the full updated code.

Existing code:\n\n\u0060\u0060\u0060js\n${String(currentCode)}\n\u0060\u0060\u0060\n\nRequest: ${prompt}`
      : `Generate Molstar builder code for: ${prompt}`;

    const priorDialogue = Array.isArray(history) && history.length
      ? `\n\nRecent context: ${history.map(m => `${m.type}: ${m.content}`).slice(-4).join(' | ')}`
      : '';

    const model = process.env.CLAUDE_CODE_MODEL || 'claude-3-5-sonnet-20241022';
    logLine('generate:req', {
      model,
      prompt,
      hasCurrentCode: Boolean(currentCode && String(currentCode).trim()),
    });

    const completion = await anthropic.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: CODE_AGENT_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: contextPrefix + priorDialogue },
      ],
    });

    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : String(completion.content || '');

    const code = String(content)
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    logLine('generate:res', `code (${code.length} chars):\n${code}`);
    return res.json({ code });
  } catch (err) {
    console.error('Claude generation failed', err);
    const payload = { error: 'generation_failed' };
    if (DEBUG_API) payload.detail = err?.message || String(err);
    return res.status(500).json(payload);
  }
});

// General chat/analysis using standard Messages API
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const model = process.env.CLAUDE_CHAT_MODEL || 'claude-3-5-sonnet-20241022';
    logLine('chat:req', { model, prompt });
    const completion = await anthropic.messages.create({
      model,
      max_tokens: 800,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    logLine('chat:res', `text (${content.length} chars):\n${content}`);
    res.json({ text: content });
  } catch (err) {
    console.error('Chat failed', err);
    const payload = { error: 'chat_failed' };
    if (DEBUG_API) payload.detail = err?.message || String(err);
    res.status(500).json(payload);
  }
});

// --- New Multi-Agent API ---
app.get('/api/agents', (_req, res) => {
  res.json({ agents: listAgents() });
});

app.post('/api/agents/invoke', async (req, res) => {
  try {
    const { agentId, input, currentCode, history, selection } = req.body || {};
    if (!agentId || !agents[agentId]) {
      return res.status(400).json({ error: 'invalid_agent', details: 'agentId missing or unknown' });
    }
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'invalid_input', details: 'input is required' });
    }
    const agent = agents[agentId];
    const result = await runAgent({ agent, userText: input, currentCode, history, selection });
    res.json({ agentId, ...result });
  } catch (err) {
    console.error('Agent invoke failed', err);
    const payload = { error: 'agent_invoke_failed' };
    if (DEBUG_API) payload.detail = err?.message || String(err);
    res.status(500).json(payload);
  }
});

app.post('/api/agents/route', async (req, res) => {
  try {
    const { input, currentCode, history, selection } = req.body || {};
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'invalid_input', details: 'input is required' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      const msg = 'Missing ANTHROPIC_API_KEY; set it in your environment or .env and restart the server.';
      console.error('Agent route failed (config)', msg);
      const payload = { error: 'agent_route_failed' };
      if (DEBUG_API) payload.detail = msg;
      return res.status(500).json(payload);
    }
    const agent = pickAgentForPrompt(input, selection);
    const result = await runAgent({ agent, userText: input, currentCode, history, selection });
    res.json({ agentId: agent.id, ...result });
  } catch (err) {
    console.error('Agent route failed', err);
    const payload = { error: 'agent_route_failed' };
    if (DEBUG_API) payload.detail = err?.message || String(err);
    res.status(500).json(payload);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  const which = process.env.ANTHROPIC_API_KEY ? 'with ANTHROPIC_API_KEY' : 'WITHOUT ANTHROPIC_API_KEY';
  console.log(`[server] listening on http://localhost:${PORT} (${which})`);
});


