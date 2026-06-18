---
title: "Installing & first-run setup"
description: "Download Chrona for Mac or Windows, get past the macOS security prompt, and finish the first-run setup wizard."
order: 2
---

This page is for **staff** setting up Chrona on their own machine. You'll download the app, open it, and walk through a short first-run wizard that adds a Gemini API key and — on macOS — grants screen-recording permission. Once that's done, Chrona is ready to track.

## Download Chrona

Open the **Chrona** section of the home page (`/#chrona-showcase`) and click the download button for your system:

- **Download for Mac** — a `.dmg` installer.
- **Download for Windows** — a `.exe` installer.

The builds are published on Chrona's GitHub releases page. Install the app the same way you would any other: open the downloaded file and follow your operating system's prompts.

### If macOS says the app is "damaged"

Because the app is distributed outside the Mac App Store, macOS may say Chrona "is damaged and can't be opened." This is the standard quarantine warning, not a real problem. To clear it:

1. Open **Terminal**.
2. Type the following, **but don't press Enter yet** (note the trailing space):
   ```
   sudo xattr -dr com.apple.quarantine 
   ```
3. Drag the Chrona app into the Terminal window — this fills in its path. For example:
   ```
   sudo xattr -dr com.apple.quarantine /Applications/Chrona.app
   ```
4. Press **Enter**, then launch Chrona again.

## Finish the first-run setup

The first time you open Chrona, the **Setup Chrona** wizard walks you through a quick first-run setup. The number of steps depends on your platform (macOS adds a permission step). You can move with **Back** and **Next**, or choose **Skip for now** and finish later.

### Step 1 — Welcome

Chrona explains that it captures periodic screenshots and turns them into a timeline of your activities, and reminds you that it's **local-first** (screenshots and your database live on your machine) and uses **Gemini** for analysis. Click **Next**.

### Step 2 — Gemini API key

Chrona uses Google Gemini to analyze your activity, so it needs an API key. The key is stored securely in your operating system's credential store.

1. Click **Get a key** to open Google's API key page and create one (it starts with `AIza…`).
2. Paste it into the key field.
3. Click **Test** to confirm it works, then **Save**.

> **Note:** You can record without a key, but analysis stays **pending** until a key is configured — so no timeline cards will be generated until you add one.

### Step 3 — Screen Recording permission (macOS only)

Chrona needs macOS Screen Recording permission to capture your screen.

1. Click **Open System Settings** (this jumps to **Privacy & Security → Screen Recording**).
2. Turn on the toggle for **Chrona**.
3. Back in Chrona, click **Check again**. macOS sometimes requires a restart for capture to start working — use **Relaunch Chrona** if prompted.

### Step 4 — Ready

The final step shows a checklist confirming your Gemini key is configured and (on macOS) capture permission is granted. From here you can:

- **Finish setup** to close the wizard, or
- **Start recording** to begin tracking right away.

## Reminders after setup

If something still needs attention, Chrona shows a banner across the top of the app:

- **"Screen capture permission required"** — recording is disabled until you enable the macOS permission. Click **Finish setup** to return to the permission step.
- **"Gemini API key missing"** — recording works, but analysis stays pending until you add a key. Click **Add key**.

## Getting around the app

A toolbar at the top of every screen switches between Chrona's main views: **Timeline**, **Review**, **Ask**, **Dashboard**, **Journal**, and **Settings**. You can reopen the setup wizard anytime from **Setup**, and open settings with **Cmd/Ctrl + ,**.

> **Tip:** To have Chrona track from the moment you log in, open **Settings → App** and turn on **Launch at login**.

Next, learn how capture works and how to fine-tune it in [Capturing your time](/docs/chrona/tracking-your-time).
