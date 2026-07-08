---
title: "Deploy in the cloud (Docker)"
description: "Pull the AccountingClaw or LegalClaw Docker image and run it on any server or cloud with your activation key and OpenRouter key."
order: 3
---

Running a Claw as a **cloud digital worker** means pulling its Docker image and running it as a container — on your laptop, a server, or any cloud (AWS, GCP, Azure, or your own VPC). Each image ships its skills encrypted inside it; they decrypt and install on first start once you provide your activation key. This is the best option for always-on workers and shared team servers.

The steps below are identical for AccountingClaw and LegalClaw — only the image, container name, volume, and port differ:

| | AccountingClaw | LegalClaw |
| --- | --- | --- |
| **Image** | `cpaautomation/accountingclaw-hermes:latest` | `cpaautomation/legalclaw-hermes:latest` |
| **Container name** | `accountingclaw` | `legalclaw` |
| **Data volume** | `~/.accountingclaw` | `~/.legalclaw` |
| **Local API port** | `8642` | `8643` |

The ports differ on the host side only, so you can run both workers side by side on one machine.

## Before you start

You'll need three things:

| Requirement | Where to get it |
| --- | --- |
| **Docker** installed and running | [docker.com](https://www.docker.com/) |
| **Your activation key** (`cpaa_live_…`) | [Activate your Claw](/docs/claw-series/activation) — one key unlocks both products |
| **An OpenRouter API key** (`sk-or-…`) | [openrouter.ai](https://openrouter.ai/) — Hermes uses OpenRouter to reach your AI model |

## Step 1 — Pull the image

Pull the public Hermes image for the worker you're deploying. The `--platform linux/amd64` flag lets it run on Apple Silicon and other ARM hosts through Docker's emulation.

```bash
# AccountingClaw
docker pull --platform linux/amd64 cpaautomation/accountingclaw-hermes:latest

# LegalClaw
docker pull --platform linux/amd64 cpaautomation/legalclaw-hermes:latest
```

## Step 2 — Run the container

Run the image with your two keys. Replace `cpaa_live_...` with your activation key and `sk-or-...` with your OpenRouter key, and change `change-this-api-key` to a secret of your own.

**AccountingClaw:**

```bash
docker run -d \
  --platform linux/amd64 \
  --name accountingclaw \
  --restart unless-stopped \
  -v ~/.accountingclaw:/opt/data \
  -e CPAA_ACTIVATION_KEY="cpaa_live_..." \
  -e OPENROUTER_API_KEY="sk-or-..." \
  -e API_SERVER_ENABLED=true \
  -e API_SERVER_HOST=0.0.0.0 \
  -e API_SERVER_KEY="change-this-api-key" \
  -p 127.0.0.1:8642:8642 \
  cpaautomation/accountingclaw-hermes:latest gateway run
```

**LegalClaw:**

```bash
docker run -d \
  --platform linux/amd64 \
  --name legalclaw \
  --restart unless-stopped \
  -v ~/.legalclaw:/opt/data \
  -e CPAA_ACTIVATION_KEY="cpaa_live_..." \
  -e OPENROUTER_API_KEY="sk-or-..." \
  -e API_SERVER_ENABLED=true \
  -e API_SERVER_HOST=0.0.0.0 \
  -e API_SERVER_KEY="change-this-api-key" \
  -p 127.0.0.1:8643:8642 \
  cpaautomation/legalclaw-hermes:latest gateway run
```

> **Tip:** The [Activation page](/dashboard/activation) generates these exact commands with your key already filled in — copy them from there to skip the manual edit.

### What each setting does

| Setting | Purpose |
| --- | --- |
| `--name accountingclaw` / `--name legalclaw` | Names the container so the `docker exec` commands below can find it. |
| `--restart unless-stopped` | Keeps your worker running across reboots and crashes. |
| `-v ~/.accountingclaw:/opt/data` (or `~/.legalclaw`) | Persists the installed skills, sessions, and config so they survive restarts. Keep this volume. |
| `-e CPAA_ACTIVATION_KEY` | Your personal activation key — unlocks the bundled skills on first start. |
| `-e OPENROUTER_API_KEY` | Your OpenRouter key — gives Hermes access to your AI model. |
| `-e API_SERVER_ENABLED=true` | Turns on the local HTTP API (optional — leave off if you only use the CLI). |
| `-e API_SERVER_HOST=0.0.0.0` | Binds the API inside the container so the published port can reach it. |
| `-e API_SERVER_KEY` | The secret callers must present to use the local API. **Change it.** |
| `-p 127.0.0.1:8642:8642` (or `:8643:8642`) | Publishes the API on localhost only, not your network. |

## Step 3 — What happens on first start

The first time the container runs, it exchanges your activation key with CPAAutomation, decrypts the bundled skills, and installs them into the `/opt/data` volume. This happens once; later restarts reuse the installed skills. Watch it happen with:

```bash
docker logs -f accountingclaw   # or: docker logs -f legalclaw
```

## Step 4 — Verify and start working

The `hermes` command lives inside the container, so reach it through `docker exec` (substitute `legalclaw` for a LegalClaw worker):

```bash
docker exec -it accountingclaw hermes status
docker exec -it accountingclaw hermes skills list
docker exec -it accountingclaw hermes chat
```

- `hermes status` confirms the worker is healthy.
- `hermes skills list` shows the installed skills (see the [AccountingClaw skills catalog](/docs/claw-series/skills-catalog) and the [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog)).
- `hermes chat` opens an interactive session — this is how you brief the worker. See [Working with AccountingClaw](/docs/claw-series/using-accountingclaw) or [Working with LegalClaw](/docs/claw-series/using-legalclaw).

### Optional: a shorter command

If you'd rather type `hermes …` directly from your host while the container runs, add a shell alias:

```bash
alias hermes='docker exec -it accountingclaw hermes'
# or, for a LegalClaw worker:
alias hermes='docker exec -it legalclaw hermes'
```

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `hermes: command not found` | The `hermes` command runs *inside* the container. Use `docker exec -it <container> hermes …`, or add the alias above. |
| **"AccountingClaw activation required."** / **"LegalClaw activation required."** in the logs | No key was passed. Set `CPAA_ACTIVATION_KEY` from your [Activation page](/dashboard/activation) and re-run. |
| **"Activation failed: invalid or revoked CPAA_ACTIVATION_KEY."** | The key is wrong or has been revoked. Re-check it, or [re-activate](/docs/claw-series/activation) to issue a new one. |
| **"Activation server unreachable"** | The container can't reach CPAAutomation. Check the host's network/firewall and try again. |
| The local API doesn't respond on `127.0.0.1:8642` (or `:8643`) | The API is only available when `API_SERVER_ENABLED`, `API_SERVER_HOST`, and `API_SERVER_KEY` are all set, and the port is published. |

Next: [Working with AccountingClaw](/docs/claw-series/using-accountingclaw) or [Working with LegalClaw](/docs/claw-series/using-legalclaw).
