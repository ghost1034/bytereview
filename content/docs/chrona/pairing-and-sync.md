---
title: "Connecting Chrona to your firm"
description: "Pair a Chrona device to your firm: generate a code in the dashboard, enter it in the app, and manage syncing."
order: 7
---

Pairing is the bridge between the Chrona desktop app and your firm's CPAAutomation dashboard. Once a device is paired, its timeline cards sync to the firm so managers can see tracked hours. This page covers both sides — **generating a code** (for managers) and **entering it** (for staff) — plus the sync controls in the app.

## What syncs (and what doesn't)

> **Note:** Only **timeline cards** sync to your firm — titles, summaries, categories, and start/end times. Your screenshots, timelapse videos, and local database **never** leave your machine. Pairing does not give your firm access to your screen.

## For managers: generate a pairing code

1. In CPAAutomation, open **Chrona Devices** (`/dashboard/analytics/chrona/devices`).
2. Click **Generate pairing code**.
3. Enter a **Device name** that identifies who'll use it — for example, "Dana's MacBook." This name labels the device throughout the dashboard.
4. Click **Generate code**. Chrona shows a short code (for example `ABCD2345`).
5. Click **Copy code** and share it with the staff member.

> **Note:** Pairing codes are **single-use** and **expire 15 minutes** after they're generated. If a code expires before it's used, just generate a new one. You'll need a role of admin, manager, analyst, or reviewer to generate codes.

## For staff: enter the code in Chrona

1. In the Chrona desktop app, open **Settings → Sync**.
2. In the **Pairing code** field, type the code your manager sent you (it auto-capitalizes; the placeholder shows the `ABCD2345` format).
3. Click **Pair**.

Your device pairs to the firm and begins syncing on a schedule. If the code has expired or is wrong, you'll see an error — ask your manager for a fresh one and try again within 15 minutes.

## Manage syncing (Settings → Sync)

Once paired, the Sync settings show your device's status and let you control how it syncs:

- **Status line** — shows the device name, the last sync time, and how many cards are **pending**. It reads **Syncing…** during a sync, **Paired** when idle, or **Paired (sync paused)** when syncing is turned off.
- **Sync enabled** — turn syncing on or off without unpairing.
- **Sync now** — push pending cards to the firm immediately.
- **Sync interval (seconds)** — how often Chrona syncs automatically (default **300**, minimum **30**). Click **Save** after changing it.

## Unpair a device

To disconnect a device from the firm, click **Unpair…** in Sync settings, then confirm.

> **Note:** Unpairing removes the device's sync token from your keychain and stops syncing. Cards that already synced stay on the firm's dashboard until a manager revokes the device — see [Managing devices](/docs/chrona/managing-devices).

With a device paired, managers can read the results on the [firm Time Tracking dashboard](/docs/chrona/firm-time-tracking) and handle ongoing device administration in [Managing devices](/docs/chrona/managing-devices).
