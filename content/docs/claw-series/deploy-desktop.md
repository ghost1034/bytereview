---
title: "Deploy on your desktop"
description: "Install the Hermes Desktop app and add the AccountingClaw skills with one command — everything runs locally, no Docker required."
order: 4
---

Running AccountingClaw as a **desktop digital worker** keeps everything on your own machine — no Docker needed. You install the official Hermes Desktop app, then add the AccountingClaw skills with a single command and your activation key. Hermes Desktop includes a chat UI, so you can brief the worker without touching a terminal afterward. This is the best option for an individual running everything locally.

## Before you start

| Requirement | Where to get it |
| --- | --- |
| **Hermes Desktop** (installed in Step 1) | Download links below |
| **Your activation key** (`cpaa_live_…`) | [Activate AccountingClaw](/docs/claw-series/activation) |

You don't need an OpenRouter key for the desktop install — Hermes Desktop walks you through connecting your AI model provider during its onboarding.

## Step 1 — Install Hermes Desktop

Download the app for your platform and install it like any other application:

- **[Hermes Desktop for Mac](https://hermes-assets.nousresearch.com/Hermes-Setup.dmg)** — a `.dmg` installer.
- **[Hermes Desktop for Windows](https://hermes-assets.nousresearch.com/Hermes-Setup.exe)** — an `.exe` installer.

On **Linux**, install Hermes with the official one-liner:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

Launch the app and complete its onboarding — this is where you connect your AI model provider. No environment variables required.

## Step 2 — Add the AccountingClaw skills

With Hermes Desktop installed, run the AccountingClaw installer for your platform. It verifies your key with CPAAutomation, downloads the skills, and installs them into your local Hermes home. Replace `cpaa_live_...` with your own activation key.

**macOS / Linux:**

```bash
curl -fsSL https://cpaautomation.ai/install-accountingclaw.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash
```

**Windows (PowerShell):**

```powershell
$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/install-accountingclaw.ps1 -UseBasicParsing | iex
```

> **Tip:** The [Activation page](/dashboard/activation) generates both commands with your key already filled in — copy the one for your platform.

## Step 3 — Verify the install

Open the **Skills** pane in Hermes Desktop and confirm the AccountingClaw skills are listed. If you prefer the command line, run:

```bash
hermes skills list
```

You should see the AccountingClaw skills — see the full [Skills catalog](/docs/claw-series/skills-catalog). You're ready to start briefing the worker; see [Working with AccountingClaw](/docs/claw-series/using-accountingclaw).

## Where your data lives

Your skills, sessions, and configuration stay in your local Hermes home:

| Platform | Location |
| --- | --- |
| macOS / Linux | `~/.hermes` |
| Windows | `%LOCALAPPDATA%\hermes` |

## Good to know

- **One key, both modes.** The same activation key works for desktop and cloud — you can run a desktop worker now and a cloud worker later with the same key.
- **Everything is local.** On the desktop, the agent and your data run entirely on your machine; only your chosen AI model is called over the network.

Next: [Working with AccountingClaw](/docs/claw-series/using-accountingclaw).
