---
title: "Templates"
description: "Use the built-in request-list library, or build and maintain your own reusable request lists."
order: 4
---

A template is a reusable request list. When you create an engagement from a template, its requests are copied in — titles, instructions, categories, priorities, and evidence expectations included — and then belong to that engagement, so edits there never change the template.

Open **Templates** from the PBC workspace (`/dashboard/pbc/templates`). Creating and editing templates requires an admin or manager role; everyone can browse them and use them.

## The built-in library

Every firm starts with 17 canonical templates. They are added automatically the first time PBC loads, and any that are missing are restored later — but templates your firm has created or edited are never overwritten.

| Type | Templates |
| --- | --- |
| **Audit** | Annual financial statement audit · Employee benefit plan audit · Nonprofit financial statement audit |
| **Other** | Financial statement review · Financial statement compilation |
| **Tax** | Individual income tax return · Partnership and S corporation tax return · C corporation income tax return · Trust, estate, and gift tax return · Nonprofit Form 990 · Sales and use tax compliance · Payroll and information return compliance |
| **Bookkeeping** | Monthly bookkeeping and close · Year-end bookkeeping cleanup · Client accounting services onboarding |
| **Advisory** | Budgeting and cash-flow advisory · Financial due diligence and quality of earnings |

They are written as comprehensive starting points. Tailor the list to the entity and your assessed risks before publishing an engagement built from one.

## Create or edit a template

Click **New template**, or **Configure** on an existing card. Use the copy icon to duplicate a template — handy for making a firm variant of a built-in list without changing the original.

The editor has template details at the top and a two-pane request builder below.

| Template field | Notes |
| --- | --- |
| **Template name** | Shown in the template picker when creating an engagement. |
| **Engagement type** | Audit, Tax, Bookkeeping, Advisory, or Other. Sets the type of engagements created from this template. |
| **Description** | When your team should reach for this list. |

In the request pane, click **Add** to append a request, then configure it on the right:

- **Request number** (optional — leave as *Auto* to number engagements sequentially) and **Category**
- **Title** and **Client instructions**
- **Priority**, **Expected formats**, **Expected filename**
- **GL account**, **Expected GL balance**, **External source ID**
- **Sensitive evidence** and **Redaction required**

Use the arrow buttons to move a request up or down, the copy button to duplicate it, and the trash button to remove it. The order here becomes the order in new engagements.

Every request needs a title, and any request numbers you set must be unique within the template. Click **Save changes** or **Create template** when you are done.

## Using a template

Pick it in the **Request-list template** field when you create an engagement. The engagement inherits the template's type, and each copied request gets:

- the engagement's **default due date**;
- the engagement's **period end**;
- **you** as the internal owner.

So the usual next step after creating from a template is a pass over the list to reassign owners and adjust due dates — see [Building the request list](/docs/prepared-by-client/building-the-request-list).

Continue to [Client access and the portal](/docs/prepared-by-client/client-access-and-the-portal).
