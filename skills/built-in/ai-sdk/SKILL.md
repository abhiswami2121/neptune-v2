---
name: ai-sdk
description: Answer questions about the AI SDK and help build AI-powered features. Use when developers ask about AI SDK functions like generateText, streamText, ToolLoopAgent, embed, or tools. Triggers on AI SDK, Vercel AI SDK, generateText, streamText, add AI to my app, build an agent, tool calling, structured output, useChat.
version: 1.0.0
---

# AI SDK — Vercel AI SDK Expertise

Answer questions about the Vercel AI SDK and help build AI-powered features.

## When to Use

- Questions about `generateText`, `streamText`, `ToolLoopAgent`
- Building AI agents, chatbots, RAG systems
- Questions about providers (OpenAI, Anthropic, Google, etc.)
- Streaming, tool calling, structured output, embeddings
- React hooks like `useChat` or `useCompletion`

## Core Functions

1. **generateText** — Generate text completions with tool calling
2. **streamText** — Stream text responses for real-time UX
3. **ToolLoopAgent** — Build autonomous agent loops with tool access
4. **embed** — Generate embeddings for semantic search
5. **useChat** — React hook for chat UI integration

## Provider Configuration

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const { text } = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  prompt: 'Explain prompt caching',
});
```

## Best Practices

- Use `streamText` for interactive UIs, `generateText` for background jobs
- Enable prompt caching for repeated system prompts
- Set appropriate `maxSteps` on ToolLoopAgent to prevent infinite loops
- Use structured output (`zod` schemas) when parsing is needed
