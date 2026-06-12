---
name: workflow
description: Creates durable, resumable workflows using Vercel's Workflow DevKit. Use when building workflows that need to survive restarts, pause for external events, retry on failure, or coordinate multi-step operations over time. Triggers on workflow, durable functions, resumable, workflow devkit, step-based orchestration.
version: 1.0.0
---

# Workflow — Durable Workflow Orchestration

Creates durable, resumable workflows using Vercel's Workflow DevKit.

## When to Use

- Multi-step operations that must survive restarts
- Workflows that pause waiting for external events (webhooks, human approval)
- Operations requiring retry logic with backoff
- Long-running processes (>30 seconds)
- Step-based orchestration with dependencies

## Core Concepts

1. **Durable Execution** — Workflow state persists across server restarts
2. **Step Functions** — Each step is atomic and idempotent
3. **Event-Driven** — Pause and resume based on external triggers
4. **Retry with Backoff** — Automatic retry with configurable strategies
5. **Observability** — Built-in logging, tracing, and status tracking

## Quick Start

```typescript
import { createWorkflow } from '@vercel/workflow';

export const orderWorkflow = createWorkflow({
  id: 'order-processing',
  
  async execute(orderId: string) {
    // Step 1: Validate order
    const order = await this.step('validate', () =>
      validateOrder(orderId)
    );
    
    // Step 2: Charge payment (with retry)
    const payment = await this.step('charge', () =>
      chargeCustomer(order.customerId, order.total)
    ).withRetry({ maxAttempts: 3, backoff: 'exponential' });
    
    // Step 3: Wait for fulfillment webhook
    const shipped = await this.step('await-fulfillment', () =>
      this.waitFor('fulfillment.shipped', { timeout: '24h' })
    );
    
    // Step 4: Send confirmation
    await this.step('confirm', () =>
      sendConfirmationEmail(order.customerId, shipped.tracking)
    );
  }
});
```

## Retry Strategies

- **Exponential backoff**: 1s, 2s, 4s, 8s... (default)
- **Fixed interval**: Same delay between each attempt
- **Linear backoff**: 1s, 2s, 3s, 4s...
- **Custom**: Define your own delay function

## Best Practices

- Keep steps idempotent — they may re-execute
- Use short step functions — easier to debug and retry
- Set reasonable timeouts for `waitFor` steps
- Monitor workflow dashboard for stuck workflows
