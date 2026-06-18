---
title: "Managing devices"
description: "Generate pairing codes, see paired devices and their status, rename them, and revoke access when someone leaves."
order: 9
---

The **Chrona Devices** page is where managers handle the lifecycle of every Chrona install at the firm — pairing new devices, keeping an eye on their sync status, renaming them, and revoking access. Open it from the sidebar under **Chrona Devices** (`/dashboard/analytics/chrona/devices`), or from **Manage devices** on the Time Tracking dashboard.

## Roles

What you can do depends on your role:

- **Admin, manager, analyst, and reviewer** can generate pairing codes and rename or revoke devices.
- **Viewers** have read-only access — they can see the device list but not change it, and are prompted to "Ask an admin, manager, or analyst" to generate a code.

## Pair a new device

Click **Generate pairing code**, name the device, and share the code with the staff member to enter in their app. For the full two-sided walkthrough, see [Connecting Chrona to your firm](/docs/chrona/pairing-and-sync).

### Active pairing codes

Codes that have been generated but not yet used appear under **Active pairing codes**, each with its device name and an **Expires in Xm** countdown. Use **Copy** to copy a code again.

> **Note:** Codes are single-use and expire **15 minutes** after they're generated. Once a code is used or expires, it disappears from this list.

## Paired devices

The **Paired devices** table shows every device syncing into the firm:

| Column | Meaning |
| --- | --- |
| **Device** | The device name, with an **Active** or **Revoked** badge. |
| **Platform** | The operating system and app version. |
| **Last seen** | When the device last contacted the firm. |
| **Last sync** | When it last synced timeline cards. |
| **Syncs** | How many times it has synced. |
| **Token** | A masked prefix of the device's sync token, for identification. |

Use the search box to find a device by name.

## Rename a device

Click the **pencil** icon on a device row, enter a new name, and click **Save**. The new name appears everywhere the device shows up — the time tracking dashboard and this list.

## Revoke a device

To cut off a device's access (for example, when someone leaves or replaces a machine), click the **revoke** (ban) icon on an active device, then confirm in the **Revoke <name>?** dialog.

- The device's sync token **stops working immediately** — it can't sync again until it's re-paired with a new code.
- Optionally tick **Also delete this device's synced timeline cards** to permanently remove that device's data from the dashboard. Leave it unticked to keep the already-synced history.

> **Note:** Revoking is immediate and a revoked device can't be reactivated — to bring it back, generate a fresh pairing code and pair it again. See [Connecting Chrona to your firm](/docs/chrona/pairing-and-sync).
