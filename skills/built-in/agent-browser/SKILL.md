---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
version: 1.0.0
allowed-tools: Bash(agent-browser:*)
---

# Agent Browser — Automated Browser Control

Automates browser interactions for web testing, form filling, screenshots, and data extraction.

## When to Use

- Navigate to URLs and capture page content
- Fill and submit forms programmatically
- Take screenshots of web pages
- Extract structured data from web pages
- Test web application flows end-to-end

## Capabilities

1. **Page Navigation** — Load URLs, wait for elements, handle redirects
2. **Form Interaction** — Fill inputs, select dropdowns, click buttons
3. **Screenshot Capture** — Full-page or element-level screenshots
4. **Data Extraction** — Scrape tables, lists, and structured content
5. **Authentication** — Handle login flows and session management

## Usage

```
execute_skill skills/built-in/agent-browser action=navigate url=$ARGUMENTS
execute_skill skills/built-in/agent-browser action=screenshot selector=$ARGUMENTS
execute_skill skills/built-in/agent-browser action=extract selector=$ARGUMENTS
```

## Safety

- Never use on production customer data without explicit approval
- Respect robots.txt and rate limits
- Cache results when appropriate to avoid redundant requests
