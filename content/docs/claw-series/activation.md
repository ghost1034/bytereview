---
title: "Activating your Claw"
description: "Redeem your six-digit code for a personal activation key that unlocks AccountingClaw and LegalClaw, save it safely, and understand key status and recovery."
order: 2
---

Activation is a one-time step that turns a six-digit code into your **personal activation key**. That key — it looks like `cpaa_live_…` — is what unlocks the encrypted skills when you deploy, in the cloud or on your desktop. **One key unlocks both AccountingClaw and LegalClaw.** You'll do this once, save the key, and reuse it for every install.

## Step 1 — Get a six-digit activation code

Activation codes are issued by CPAAutomation. If you don't have one yet, [contact us](/contact) and we'll send you a six-digit code. The code is short-lived proof that you're entitled to activate; you exchange it for your own key in the next step.

## Step 2 — Open the Activation page

In the CPAAutomation sidebar, open **Claw Activation** (`/dashboard/activation`). You'll see a card titled **Enter your activation code** with six input boxes.

## Step 3 — Enter the code and activate

1. Type your six digits into the boxes.
2. Click **Activate**.

If the code is valid, your personal key is issued right away.

> **Note:** If you mistype the code you'll see *"Invalid activation code."* — double-check the six digits. If you try too many times in a row you'll be asked to *wait a few minutes and try again* (activation is rate-limited to protect your account).

## Step 4 — Save your key (it's shown only once)

After a successful activation, a **Your personal activation key** panel appears with your full `cpaa_live_…` key and a warning:

> **Save this now.** For your security it will not be shown again. If you lose it, revoke and re-activate.

Click **Copy key** and store it somewhere safe — a password manager is ideal. You'll paste this key into your deployment:

- **Cloud (Docker):** pass it as the `CPAA_ACTIVATION_KEY` environment variable when you run the AccountingClaw or LegalClaw image.
- **Desktop:** run the AccountingClaw or LegalClaw installer with it to add the skills to Hermes Desktop.

The same panel gives you ready-to-run **Cloud (Docker)** and **Desktop** commands for each product with your key already filled in, so you can jump straight to deployment. Continue to [Deploy in the cloud](/docs/claw-series/deploy-cloud) or [Deploy on your desktop](/docs/claw-series/deploy-desktop).

## Checking your activation status

When you return to the Activation page later, it reflects your current state instead of the code form:

| What you see | What it means |
| --- | --- |
| **Claw Series activated**, with a key shown as `cpaa_live_AbCd…` | You have an active key. Only the prefix is displayed — the full key is never shown again. |
| **Last used by your cloud (Docker) install** / **your desktop install**, with a date | The most recent time a deployment used your key, and how it was deployed. |
| A red **Your activation key was revoked** banner | Your previous key is no longer valid. Enter a code to issue a new one. |

You can hold **one active key at a time**. If you activate again while you already have an active key, the page simply confirms you're already activated rather than minting a second key. There's no separate key per product — the same key works for every Claw install you run.

## If you lose your key

Because the full key is only ever shown once, there's no way to look it up later. If you lose it, [contact us](/contact) to **revoke** the old key, then return to the Activation page and **re-activate** with a code to issue a fresh one. Revoking immediately stops the lost key from working anywhere — for all products.

Once you have your key, head to [Deploy in the cloud (Docker)](/docs/claw-series/deploy-cloud) or [Deploy on your desktop](/docs/claw-series/deploy-desktop).
