---
title: "Capturing your time"
description: "How Chrona turns screen activity into a timeline, how to start and stop recording, and how to tune capture, storage, and analysis."
order: 3
---

Once Chrona is set up, tracking is mostly hands-off: you start recording and let it run. This page (for **staff**) explains how capture works, how to start and stop it, and which settings you can adjust. Most people can leave the defaults alone.

## How capture works

Chrona builds your timeline in a pipeline that keeps your screen private:

1. **Capture** — Chrona saves a screenshot on a set interval, stored locally on your machine.
2. **Batch & analyze** — screenshots are grouped into short, compressed videos and sent to Google Gemini for analysis.
3. **Generate cards** — Gemini's observations are synthesized into structured **timeline cards**, each with a title, category, optional subcategory, a summary, details, and any websites it detected.

> **Note:** Screenshots never leave your machine except to be analyzed by Gemini, and they are never sent to your firm. Only the finished timeline cards can sync.

## Start and stop recording

The recording control is in **Settings → Capture** and also in the **Quick capture** panel beside the in-app Dashboard.

- Click **Start recording** to begin, **Stop recording** to pause capture.
- A status line tells you what's happening, for example `Recording · display=1 · last=2:45 PM`. You may also see:
  - **Idle** — not currently recording.
  - **System paused (sleep/lock)** — Chrona automatically pauses while your computer is asleep or locked.
  - A **Last capture error** message if something went wrong (for example, if screen-recording permission was revoked).

## Capture settings

Open **Settings → Capture** to control how Chrona records:

| Setting | What it does |
| --- | --- |
| **Interval (seconds)** | How often a screenshot is taken. Lower = more detail and more storage; higher = lighter. Enter a value and click **Save**. |
| **Capture display** | Which monitor to capture: **Auto (cursor)** follows the display your cursor is on, or pick a specific display by resolution. |

## The logical day (4 AM to 4 AM)

Chrona organizes your timeline into a **logical day** that runs from **4 AM to 4 AM** rather than midnight to midnight. This keeps a late-night work session on the same "day" it started, instead of splitting it in two.

> **Note:** The 4 AM boundary is fixed. In practice it means activity at, say, 1 AM is counted as part of the previous calendar day's timeline.

## Storage

Chrona stores recordings on your machine and cleans up automatically as limits are reached. Open **Settings → Storage** to manage this:

- The header shows current usage for **Recordings** and **Timelapses**.
- Set **Recordings limit (GB)** and **Timelapses limit (GB)**, then click **Save limits**.
- **Purge now** runs cleanup immediately; **Open recordings** opens the storage folder in your file browser.
- Turn on **Generate timelapses** (and set **Timelapse FPS**) if you want short timelapse videos attached to your timeline cards. This is off by default.

## Advanced settings & tuning

These settings change how aggressively Chrona analyzes activity and which AI model it uses. **Most people can leave these at their defaults** — adjust them only if you want faster updates, lighter resource use, or a different model.

### Analysis (Settings → Analysis)

Pick a **preset** to fill in sensible values, then click **Save**:

| Preset | Best for |
| --- | --- |
| **Balanced** | The recommended default. |
| **Faster updates** | More frequent analysis in smaller batches. |
| **Low resource** | Less frequent analysis in larger batches. |
| **Catch-up** | A longer lookback to process a backlog after downtime. |

The scheduler and batching fields beneath the presets (check interval, lookback window, batch durations, and the card-generation window) let you tune things further, with on-screen explanations for each. **Run analysis tick** forces one analysis pass immediately if you don't want to wait for the scheduler.

### AI (Settings → AI (Gemini))

Here you can re-enter or update your **API key**, choose the **Model** (for example `gemini-3-flash-preview`, `gemini-2.5-flash`, or `gemini-2.5-pro` from the presets), and adjust runtime options such as request timeout and retry attempts. Click **Save Gemini settings** when done.

### Prompts (Settings → Prompts)

Add short instructions that Chrona inserts into its default prompts for transcription, card generation, the Ask chat, and journal drafts — for example, "Prefer naming apps and websites when clear." Keep them brief, then click **Save prompt settings**.

Once Chrona is capturing, head to [Exploring your timeline](/docs/chrona/your-timeline) to see and refine your day.
