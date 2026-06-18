---
title: "Overview"
description: "What Chrona is, how the desktop app and the firm dashboard fit together, and how to get started as staff or as a manager."
order: 1
---

Chrona is automatic, AI-powered time tracking. A small desktop app runs quietly on each person's machine, takes periodic screenshots, and uses AI to reconstruct the workday into a clear, searchable timeline — no timers to start and no end-of-week timesheet to piece together. Each person's tracked hours then sync into your firm's CPAAutomation dashboard, where managers see where time goes across the whole team.

## The two parts of Chrona

Chrona has two pieces that work together:

| Part | Where it runs | What it does |
| --- | --- | --- |
| **Chrona desktop app** | On each person's Mac or Windows machine | Captures activity, builds a personal timeline, and offers review, an Ask chat, an in-app dashboard, and a journal. |
| **CPAAutomation Time Tracking dashboard** | In your CPAAutomation web app | Pairs and manages devices and shows firm-wide hours, per-device timelines, and CSV exports. |

The link between them is **pairing**: a manager generates a one-time code in the web dashboard, the staff member enters it in the desktop app, and from then on the device syncs its timeline to the firm.

## Privacy: local-first by design

Chrona is built to keep your screen private.

> **Note:** Screenshots and the local database stay on your own machine. They are only sent to Google Gemini for analysis, and they are **never** uploaded to your firm. The only thing that syncs to CPAAutomation is the finished timeline — card titles, summaries, categories, and start/end times.

## Who does what

- **Staff** install the desktop app, let it track their time, and pair it to the firm. Everything they capture lives on their machine; they review and explore it locally.
- **Managers** generate pairing codes, manage devices, and read firm-wide reports in CPAAutomation. Whether you can generate codes and revoke devices depends on your role — **admin, manager, analyst, and reviewer** can manage devices, while **viewers** have read-only access to the reports.

## Where to find it

- **Download the desktop app** from the Chrona section of the marketing home page (`/#chrona-showcase`) — there are buttons for Mac and Windows.
- **Firm reports** live in the CPAAutomation sidebar:
  - **Time Tracking** — the firm-wide dashboard (`/dashboard/analytics/chrona`)
  - **Chrona Devices** — pair and manage devices (`/dashboard/analytics/chrona/devices`)

## First steps

**If you're staff**, get tracking in four steps:

1. [Install Chrona](/docs/chrona/installing-chrona) and finish the first-run setup (add a Gemini API key and, on macOS, grant screen-recording permission).
2. Click **Start recording** and let Chrona build your timeline. See [Capturing your time](/docs/chrona/tracking-your-time).
3. [Explore your timeline](/docs/chrona/your-timeline), and [review, ask, and journal](/docs/chrona/insights-and-review) to make sense of your day.
4. [Pair your device](/docs/chrona/pairing-and-sync) with a code from your manager so your hours reach the firm.

**If you're a manager**, get your team set up:

1. Open **Chrona Devices** and [generate a pairing code](/docs/chrona/pairing-and-sync) for each person.
2. Share each code with the staff member to enter in their app.
3. Watch hours roll in on the [Time Tracking dashboard](/docs/chrona/firm-time-tracking), and [manage devices](/docs/chrona/managing-devices) over time.
