// Cloudflare Worker: POST a plain-English update, get a one-line confirmation back.
// Secrets (set with `npx wrangler secret put`): HOUSE_TOKEN, ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { handle, parserPrompt, OPS_SCHEMA, SYSTEM_PROMPT } from './house.js';

const MODEL = 'claude-haiku-5-5';

async function parseWithClaude(env, state, message) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const started = Date.now();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low' },
    tools: [{ name: 'apply_changes', description: 'Apply the edits from his message to the tracker.', input_schema: OPS_SCHEMA }],
    tool_choice: { type: 'auto' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: parserPrompt(state, message) }],
  });
  console.log(`claude ${Date.now() - started} ms, stop ${res.stop_reason}, in ${res.usage.input_tokens} out ${res.usage.output_tokens}`);
  if (res.stop_reason === 'refusal') return { question: "I can't help with that one.", ops: [] };
  if (res.stop_reason === 'max_tokens') return { question: 'That was too much at once. Try one change per text.', ops: [] };
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'apply_changes');
  if (call) return { question: '', ops: call.input.ops || [] };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return { question: text || "I couldn't tell what to change, so nothing changed.", ops: [] };
}

export default {
  fetch(request, env) {
    return handle(request, env, {
      fetch: (...args) => fetch(...args),
      parse: (state, message) => parseWithClaude(env, state, message),
      now: () => Date.now(),
    });
  },
};
