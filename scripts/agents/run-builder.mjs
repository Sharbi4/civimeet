#!/usr/bin/env node
// Direct Agents HTTP calls through curl. No SDK, consumer session or arbitrary shell execution.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const project = 'proj_YcAMhVhK4eAC6sEeJq2b5j0d';
const config = JSON.parse(fs.readFileSync(path.join(root, 'scripts/agents/builder.config.json'), 'utf8'));
const { values } = parseArgs({ options: { message: { type: 'string' }, session: { type: 'string' }, browser: { type: 'boolean' }, status: { type: 'boolean' }, cancel: { type: 'boolean' }, 'allow-origin': { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('npm run agent:builder -- --message "Your task" [--browser]\nContinue: --session SESSION_ID --message "Follow up"\nRecover: --session SESSION_ID\nInspect: --session SESSION_ID --status\nStop: --session SESSION_ID --cancel\nApprove one pending browser origin: --session SESSION_ID --allow-origin https://example.com\nValidate configuration without credentials: --dry-run');
  process.exit(0);
}
if (values['dry-run']) {
  console.log(JSON.stringify({ project, agent_id: config.agent_id, model: config.agent.model, reasoning: config.agent.reasoning, text: config.agent.text, tools: config.agent.tools.map(t => t.type), browser: Boolean(values.browser), environment: 'openai_hosted', instructionCharacters: config.agent.instructions.length }, null, 2));
  process.exit(0);
}
// Load only the requested application API key, never a consumer/Codex login credential.
if (!process.env.OPENAI_API_KEY) {
  const local = path.join(root, '.env.local');
  if (fs.existsSync(local)) process.env.OPENAI_API_KEY = fs.readFileSync(local, 'utf8').match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
}
const key = process.env.OPENAI_API_KEY;
if (!key || /[\r\n]/.test(key)) { console.error('Set OPENAI_API_KEY in your environment or ignored .env.local. Lovable server secrets are not exposed to local commands.'); process.exit(1); }
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const sessionPattern = /^[a-zA-Z0-9_-]{1,160}$/;
if (values.session && !sessionPattern.test(values.session)) throw new Error('Invalid session ID.');
const stateDirectory = path.join(root, '.civimeet-agent');
fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
let sessionId = values.session, childStream;

function request(method, endpoint, body, streaming = false, idempotencyKey) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'civimeet-agents-'));
  const bodyPath = path.join(temp, 'request.json');
  const headersPath = path.join(temp, 'headers.txt');
  if (streaming) fs.writeFileSync(headersPath, '', { mode: 0o600 });
  if (body !== undefined) fs.writeFileSync(bodyPath, JSON.stringify(body), { mode: 0o600 });
  // Credentials travel on stdin, not argv, console output, or a temporary config file.
  const curlConfig = [
    `header = ${JSON.stringify('Authorization: Bearer ' + key)}`,
    `header = ${JSON.stringify('OpenAI-Project: ' + project)}`,
    'header = "OpenAI-Beta: agents=v1"', 'header = "Content-Type: application/json"',
    ...(streaming ? ['header = "Accept: text/event-stream"'] : []),
    ...(idempotencyKey ? [`header = ${JSON.stringify('Idempotency-Key: ' + idempotencyKey)}`] : []),
  ].join('\n') + '\n';
  const child = spawn(curl, ['--config', '-', '--silent', '--show-error', '--fail-with-body', '--no-buffer', '--max-time', streaming ? '180' : '45', ...(streaming ? ['--dump-header', headersPath] : []), '--request', method, ...(body === undefined ? [] : ['--data-binary', '@' + bodyPath]), 'https://api.openai.com/v1' + endpoint], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdin.end(curlConfig);
  let stderr = ''; child.stderr.on('data', c => { stderr = (stderr + c).slice(-2000); });
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => { fs.rmSync(bodyPath, { force: true }); fs.rmSync(headersPath, { force: true }); fs.rmdirSync(temp); code === 0 ? resolve() : reject(new Error(`curl exited ${code}. ${stderr}`)); });
  });
  // Attach a handler immediately so an HTTP failure cannot become an unhandled rejection while reading output.
  completed.catch(() => {});
  const ready = async () => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (fs.existsSync(headersPath)) {
        const headers = fs.readFileSync(headersPath, 'utf8');
        const statuses = [...headers.matchAll(/^HTTP\/\S+\s+(\d+)/gm)].map(m => Number(m[1]));
        if (statuses.at(-1) >= 400) throw new Error('Stream subscription returned HTTP ' + statuses.at(-1));
        if (/content-type:\s*text\/event-stream/i.test(headers) && /\r?\n\r?\n$/.test(headers)) return;
      }
      if (child.exitCode !== null) { await completed; throw new Error('Stream closed before subscription.'); }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    child.kill(); throw new Error('Stream subscription timed out; no new message was submitted.');
  };
  return { child, completed, ready };
}
async function jsonRequest(method, endpoint, body, idempotencyKey) {
  const { child, completed } = request(method, endpoint, body, false, idempotencyKey);
  let text = ''; for await (const chunk of child.stdout) text += chunk;
  try { await completed; } catch (error) {
    let detail; try { const e = JSON.parse(text).error; detail = `${e?.type ?? ''} ${e?.code ?? ''} ${e?.param ?? ''}`; } catch { detail = 'Non-JSON provider response'; }
    throw new Error(`${error.message}\n${detail}\nDo not blindly retry session creation; inspect saved sessions first.`);
  }
  return text.trim() ? JSON.parse(text) : null;
}
const events = events => jsonRequest('POST', `/agents/sessions/${sessionId}/events`, { events });
async function handleActions(session) {
  for (const action of session.required_actions || []) {
    if (action.type === 'function_call') {
      // Saved tools cannot turn an untrusted model request into local shell/code execution.
      await events([{ type: 'agent.session.input.tool_result', turn_id: action.turn_id, call_id: action.call_id, success: false, error: 'No local handler is registered for this function. Use the configured hosted tools or ask the operator to implement an allowlisted handler.' }]);
    } else if (action.type === 'computer_use_approval_request' && action.request?.type === 'browser_origin_access') {
      const origin = action.request.origin;
      if (values['allow-origin'] !== origin) {
        console.log(`\nApproval required for browser origin: ${origin}\nResume with --session ${sessionId} --allow-origin ${origin} only if you authorize this website.`);
        return false;
      }
      await events([{ type: 'agent.session.input.computer_use_approval_request_result', request_id: action.request_id, response: { type: 'browser_origin_access', decision: 'approve' } }]);
    } else {
      console.log(`\nWaiting for ${action.request?.type || action.type}. This launcher does not collect credentials or fabricate browser takeover. Use a supported secure UI, or --cancel.`);
      return false;
    }
  }
  return true;
}
process.on('SIGINT', () => { childStream?.kill(); console.log(`\nDisconnected. The cloud task may still run. Stop it with: npm run agent:builder -- --session ${sessionId || 'SESSION_ID'} --cancel`); process.exit(130); });
try {
  if (!sessionId) {
    if (values.cancel || values.status || values['allow-origin']) throw new Error('Supply --session for this operation.');
    // Passing agent_id plus overrides preserves saved settings not explicitly replaced here.
    const payload = structuredClone(config);
    payload.environment = { type: 'openai_hosted', ...(values.browser ? { desktop: { enabled: true }, network: { access: 'enabled' } } : {}) };
    if (values.browser && !payload.agent.tools.some(t => t.type === 'computer_use')) payload.agent.tools.push({ type: 'computer_use', include_screenshots: true });
    payload.metadata = { application: 'civimeet-builder', request_id: randomUUID() };
    const created = await jsonRequest('POST', '/agents/sessions', payload);
    sessionId = created.id;
    fs.writeFileSync(path.join(stateDirectory, 'last-session.json'), JSON.stringify({ project, sessionId, agentId: config.agent_id, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log('Session:', sessionId);
  }
  if (values.cancel) { await events([{ type: 'agent.session.input.cancel' }]); console.log('Cancellation requested; use --status to verify the outcome.'); process.exit(0); }
  const state = await jsonRequest('GET', `/agents/sessions/${sessionId}`);
  if (values.status) {
    const history = await jsonRequest('GET', `/agents/sessions/${sessionId}/items?order=desc&limit=30`);
    console.log(JSON.stringify({ sessionId, status: state.status, usage: state.usage, requiredActions: (state.required_actions || []).map(a => ({ type: a.type, requestType: a.request?.type })), recentMessages: (history.data || []).filter(i => i.type === 'message') }, null, 2)); process.exit(0);
  }
  if (values.message && state.status !== 'idle') throw new Error('The session is active. Resume without --message, or cancel it first.');
  const stream = request('GET', `/agents/sessions/${sessionId}/events`, undefined, true);
  childStream = stream.child;
  const lines = createInterface({ input: stream.child.stdout, crlfDelay: Infinity });
  // Starting curl does not itself prove SSE headers arrived. Wait for the first stream frame before submitting input.
  let submitted = false, finished = false, stopForInput = false, data = [];
  const submit = async () => {
    if (submitted) return; submitted = true;
    const message = values.message || (!values.session ? 'Introduce yourself and inspect the available environment. Report what you can actually access. Do not claim to have inspected or changed the CiviMeet repository unless it is present. Do not publish, message anyone, book, or spend money.' : null);
    if (message) {
      const id = randomUUID();
      fs.writeFileSync(path.join(stateDirectory, 'last-submission.json'), JSON.stringify({ sessionId, id, message }), { mode: 0o600 });
      await jsonRequest('POST', `/agents/sessions/${sessionId}/events`, { events: [{ type: 'agent.session.input.message', input: [{ role: 'user', content: [{ type: 'input_text', text: message }] }] }] }, id);
    } else if (state.status === 'requires_action') stopForInput = !await handleActions(state);
    else if (state.status === 'idle') { console.log('Session is idle. Use --message or --status.'); finished = true; }
  };
  // A stream may wait for input without emitting an initial event. curl's headers prove subscription readiness.
  await stream.ready();
  await submit();
  if (finished || stopForInput) childStream.kill();
  for await (const line of lines) {
    if (finished || stopForInput) break;
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    if (line !== '' || !data.length) continue;
    const raw = data.join('\n'); data = []; if (raw === '[DONE]') break;
    const event = JSON.parse(raw);
    if (event.type === 'agent.session.turn.output_text.delta') process.stdout.write(event.delta);
    else if (event.type === 'agent.session.turn.output_text.done') console.log('\n' + event.text);
    else if (event.type === 'agent.session.requires_action') stopForInput = !await handleActions(await jsonRequest('GET', `/agents/sessions/${sessionId}`));
    else if (['agent.session.turn.completed','agent.session.turn.failed','agent.session.turn.cancelled'].includes(event.type) && event.turn?.subagent_id == null) { console.log('\nOutcome:', event.type); finished = true; break; }
    else if (event.type === 'error' || event.type === 'agent.session.failed') throw new Error('Provider session failed. Retrieve --status for recovery.');
    else console.log('\nEvent:', event.type);
  }
  childStream.kill();
  console.log(`\nSaved session: ${sessionId}. ${finished ? 'Retrieve --status to inspect saved work.' : 'No completed outcome confirmed; use --status or resume this session.'}`);
} catch (error) { childStream?.kill(); console.error(error.message); process.exitCode = 1; }
