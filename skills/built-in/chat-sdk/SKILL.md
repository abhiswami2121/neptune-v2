---
name: chat-sdk
description: Build multi-platform chat bots with Chat SDK. Use when developers want to build a Slack, Teams, Google Chat, Discord, Telegram, GitHub, Linear, or WhatsApp bot. Triggers on chat bot, Slack bot, chatbot, messaging integration.
version: 1.0.0
---

# Chat SDK — Multi-Platform Chat Bot Framework

Build multi-platform chat bots with the `@vercel/chat` SDK.

## Supported Platforms

- Slack
- Microsoft Teams
- Google Chat
- Discord
- Telegram
- GitHub
- Linear
- WhatsApp

## When to Use

- Building a chatbot for any supported platform
- Adding AI responses to existing messaging channels
- Creating multi-platform agents that respond consistently
- Handling slash commands, mentions, and thread replies

## Core Concepts

1. **Platform Adapters** — Each platform has its own adapter for message format conversion
2. **Middleware Pipeline** — Process messages through auth, logging, transformation
3. **AI Integration** — Connect to AI SDK for intelligent responses
4. **Thread Management** — Handle threaded conversations per platform's conventions

## Quick Start

```typescript
import { createBot } from '@vercel/chat';
import { slack } from '@vercel/chat/adapters';

const bot = createBot({
  adapter: slack({ token: process.env.SLACK_BOT_TOKEN }),
  async onMessage(message) {
    return `Echo: ${message.text}`;
  },
});

bot.start();
```

## Platform-Specific Notes

- **Slack**: Requires OAuth scopes for channels:history, chat:write
- **Discord**: Uses gateway intents for message content
- **Telegram**: Polling or webhook modes available
