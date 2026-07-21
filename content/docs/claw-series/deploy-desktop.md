---
title: "Deploy on your desktop"
description: "Install the Hermes Desktop app and add the AccountingClaw or LegalClaw skills with one command — everything runs locally, no Docker required."
order: 4
---

Running a Claw as a **desktop digital worker** keeps everything on your own machine — no Docker needed. You install the official Hermes Desktop app, then add the AccountingClaw or LegalClaw skills with a single command and your activation key. Hermes Desktop includes a chat UI, so you can brief the worker without touching a terminal afterward. This is the best option for an individual running everything locally.

## Before you start

| Requirement | Where to get it |
| --- | --- |
| **Hermes Desktop** (installed in Step 1) | Download links below |
| **Your activation key** (`cpaa_live_…`) | [Activate your Claw](/docs/claw-series/activation) — one key unlocks both products |

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

## Step 2 — Add the skills

With Hermes Desktop installed, run the installer for the worker you want and your platform. It verifies your key with CPAAutomation, downloads the skills, installs them into your local Hermes home, and securely connects the worker for CPAAutomation platform and integration access. Replace `cpaa_live_...` with your own activation key.

**AccountingClaw — macOS / Linux:**

```bash
curl -fsSL https://cpaautomation.ai/install-accountingclaw.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash
```

**AccountingClaw — Windows (PowerShell):**

```powershell
$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/install-accountingclaw.ps1 -UseBasicParsing | iex
```

**LegalClaw — macOS / Linux:**

```bash
curl -fsSL https://cpaautomation.ai/install-legalclaw.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash
```

**LegalClaw — Windows (PowerShell):**

```powershell
$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/install-legalclaw.ps1 -UseBasicParsing | iex
```

> **Tip:** The [Activation page](/dashboard/activation) generates all of these commands with your key already filled in — copy the one for your worker and platform.

## Step 3 — Verify the install

Open the **Skills** pane in Hermes Desktop and confirm the skills are listed. If you prefer the command line, run:

```bash
hermes skills list
```

You should see the installed skills. Integrations connected on your [Integrations page](/dashboard/integrations) are also available to the worker and stay current as you connect or disconnect apps. See the [AccountingClaw skills catalog](/docs/claw-series/skills-catalog) or the [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog). You're ready to start briefing the worker; see [Working with AccountingClaw](/docs/claw-series/using-accountingclaw) or [Working with LegalClaw](/docs/claw-series/using-legalclaw).

## Where your data lives

Your skills, sessions, and configuration stay in your local Hermes home:

| Platform | Location |
| --- | --- |
| macOS / Linux | `~/.hermes` |
| Windows | `%LOCALAPPDATA%\hermes` |

## Good to know

- **One key, both modes, both products.** The same activation key works for desktop and cloud, and for AccountingClaw and LegalClaw — you can run a desktop worker now and a cloud worker later with the same key.
- **One desktop profile at a time.** Both installers write into the same Hermes home, and the profile files (`SOUL.md`, `config.yaml`) define the agent's persona — so pick the worker that matches your role for a given machine. (The installer backs up any profile files it overwrites.)
- **Local runtime, connected services.** Skills, sessions, and agent configuration stay on your machine. Hermes calls your chosen AI model provider, and integration actions use CPAAutomation's authenticated gateway to reach the apps you connected on CPAAutomation.ai.

Next: [Working with AccountingClaw](/docs/claw-series/using-accountingclaw) or [Working with LegalClaw](/docs/claw-series/using-legalclaw).
