---
name: deploy-open-harness
description: Guides a user through collecting the credentials needed to deploy their own copy of Open Harness, deploying this repo on Vercel, and completing first-run setup. Use for requests about deploying, self-hosting, configuring credentials, or getting started with a fork of this app.
version: 1.0.0
---

# Deploy Open Harness — Self-Hosting Guide

Guides users through deploying their own copy of Open Harness on Vercel.

## When to Use

- Deploying a fork of the app
- Self-hosting setup
- Configuring credentials for first run
- Getting started with a new deployment

## Prerequisites Checklist

1. **Vercel Account** — Free tier works for personal use
2. **GitHub Account** — For repository hosting
3. **API Keys** — Provider keys for AI models (Anthropic, OpenAI, etc.)
4. **Domain** (optional) — Custom domain for production

## Deployment Steps

1. Fork the repository on GitHub
2. Import to Vercel via dashboard or CLI
3. Configure environment variables:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY` (optional)
   - `SANDBOX_PROVIDER` (e2b or codesandbox)
4. Deploy and verify health endpoint

## Post-Deployment

- Set up OAuth for GitHub integration
- Configure Slack bot if needed
- Customize the landing page
- Set up monitoring and alerts

## Troubleshooting

- **Build fails**: Check Node.js version (requires 20+)
- **Auth errors**: Verify API keys in environment variables
- **Sandbox timeout**: Increase sandbox timeout in configuration
