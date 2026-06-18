---
title: "Integrations"
description: "Connect Google Drive to import files and export results, and use the email address that powers automations."
order: 4
---

Integrations connect Universal Document Analysis to the tools you already use — so you can pull documents in and send results out without manual downloads and uploads. Manage them from **Integrations** in the sidebar (`/dashboard/integrations`).

## Connect Google Drive

Connecting Google Drive lets you import files directly into a job and export your results to a Drive folder.

1. Open **Integrations**.
2. In the **Google services** card, click **Connect Google Drive**.
3. Sign in with Google and approve access in the consent screen.

Once connected, the card shows a **Connected** badge and lists **Google Drive** under your connected services.

> **Note:** Google Drive access is limited to files you explicitly select — CPAAutomation cannot browse your personal files. All access tokens are encrypted and stored securely.

After connecting, you'll be able to:

- **Import from Google Drive** when uploading files to a job.
- **Export to Google Drive** from a job's results, and as the destination for [Automations](/docs/universal-document-analysis/automations).

## Disconnect or reconnect

From the connected **Google services** card you can:

- **Reconnect** — re-run the authorization, for example to refresh permissions.
- **Disconnect** — remove the connection. Import and export to Google Drive will stop working until you reconnect.

## Email automation address

Universal Document Analysis includes a central email address that powers [Automations](/docs/universal-document-analysis/automations):

> **document@cpaautomation.ai**

Send or forward emails with attachments to this address to trigger your automations. Here's how it works:

1. You send an email with attachments to `document@cpaautomation.ai`.
2. The system matches your **sender email** to your user account.
3. The email is checked against your automation's filters.
4. Matching attachments are processed automatically.
5. Results are delivered to the destination you configured.

> **Important:** Send from the **same email address as your account**, or the system won't be able to match the email to you and the automation won't run.

You don't need to connect a personal email account — this shared address handles incoming documents through a secure service account.

## Microsoft 365 (coming soon)

OneDrive, Outlook, and SharePoint integration is planned for a future update. The Microsoft 365 card is shown on the Integrations page but isn't available yet.

## Security

All OAuth tokens are encrypted and stored securely. CPAAutomation requests only the minimum permissions needed and cannot access your data without your explicit authorization for each service.
