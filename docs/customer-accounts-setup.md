# Customer accounts: setup steps

For the customer quoter ("Quote your own project", `[zipkit_quote_public]`), piloting on the MVP site.
Customers get their own Supabase project, separate from the sales project that holds saved projects, invoices and payments. A customer account can never reach sales data.

Kelsey or Sven does the clicking. Never paste passwords or keys into chat. Put them in your password manager, and the publishable key straight into WordPress.

---

## Part A: create the project (about 20 minutes)

1. **Create the project.**
   - Sign in at supabase.com, then **New project**.
   - Organization: the same one as the sales project.
   - Name: `Customer accounts`.
   - Region: **West US (Oregon)**, the closest to Utah and Idaho.
   - Database password: let Supabase generate it and save it in the password manager. Nothing in the tools uses it.
   - Plan: the free plan is fine for the pilot. Pro is needed before launch: free projects pause after a week with no activity, and Pro has daily backups.
2. **Run the tables.** Open **SQL Editor**, paste all of `sql/customer-project/2026-10_customer_accounts.sql`, then **Run**.
   - It creates `customer_profiles` and `customer_quotes`, and locks them so each customer sees only their own rows.
   - It is safe to run twice.
3. **Turn on email sign-in.** Go to **Authentication > Sign In / Providers > Email**:
   - **Enable Email provider**: on.
   - **Confirm email**: on.
   - **Allow new users to sign up**: on. Customers make their account from the quoter.
   - Turn off every other provider (phone, Google, etc.).
4. **Set where the email link may return.** Go to **Authentication > URL Configuration**:
   - **Site URL**: the live quoter page, for example `https://mountainvalleyprefab.com/quote-your-project/` once that page exists.
   - **Redirect URLs**: add every page that will carry the quoter, staging included. A wildcard per site is fine, for example `https://staging.mountainvalleyprefab.com/**` and `https://mountainvalleyprefab.com/**`. Add Zip Kit's site later.
5. **Brand the sign-in emails.** Go to **Authentication > Emails**.
   - Edit **Magic Link** and **Confirm signup** the same way. Which one Supabase sends depends on whether the email already has an account, so both must look right.
   - Subject: `Your sign-in link`.
   - Body:
     ```html
     <p>Hi {{ .Data.name }},</p>
     <p>Click to sign in and price your project:</p>
     <p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
     <p>If you didn't ask for this, you can ignore this email.</p>
     ```
   - `{{ .Data.brand }}` holds `mvp` or `zipkit` (set when the account is made), so one template can name the right company once Zip Kit joins:
     `{{ if eq .Data.brand "zipkit" }}Zip Kit Homes{{ else }}Mountain Valley Prefab{{ end }}`.
6. **Copy the keys into WordPress.** Go to **Project Settings > API Keys** and copy the **Project URL** and the **publishable** key (`sb_publishable_…`).
   - In WordPress, open **WP Admin > Zip Kit Tools > Customer quoter** and paste them into **Customer Supabase URL** and **Customer publishable key**.
   - **Never** use the secret or service-role key. The settings page refuses it.
7. **Pick the brand.** In the same section, set **Runs as brand** to Mountain Valley Prefab.
8. **Turn on saving.** Tick **Save quotes to Supabase**.
9. **Give staff access.** Go to **Organization > Team** and invite Sven and whoever vets leads.
   - Leads show in **Table Editor > customer_quotes**, with names in `customer_profiles`.
   - Change `status` as you work them: new, contacted, qualified, closed.

## Part B: test on staging (before anything is live)

1. Put `[zipkit_quote_public]` on a staging page and check that page is in the Redirect URLs.
2. Make an account with your own email. The sign-in email should arrive, and the link should come back to the page signed in.
3. In Supabase, check that a `customer_profiles` row has your name, phone, ZIP and brand.
4. Price a model and send it:
   - You get "Your … estimate from Mountain Valley Prefab".
   - The sales inbox gets "New quote lead: …".
   - A `customer_quotes` row appears.
5. Sign out, then sign back in with "Already have an account?". It should work with just the email.

## Part C: real email sending (needed before launch)

Supabase's built-in email is for testing only. It sends **about 2 emails an hour** for the whole project, only to addresses on your team, and from a Supabase address. A live site needs its own email service in two places.

**1. Sign-in emails, from Supabase.**
1. Pick a sending service: **Postmark** (best delivery for sign-in emails), Resend, Amazon SES or SendGrid. Most cost $10 to $15 a month at this volume.
2. **Verify the sending domain** (for example `mountainvalleyprefab.com`) at that service. It gives you DNS records to add where the domain's DNS lives:
   - **SPF**: a TXT record allowing the service to send for the domain.
   - **DKIM**: one or more records that sign the mail.
   - **DMARC**: a TXT record at `_dmarc.`, starting with `v=DMARC1; p=none; rua=mailto:…` and tightened later.
   - If the domain already sends mail (Google Workspace or Microsoft 365), **add** the service to the existing SPF record. A domain must never have two SPF records.
3. In Supabase, go to **Project Settings > Authentication > SMTP Settings**, turn on **custom SMTP**, and enter the service's host, port, username and password.
   - Sender: `no-reply@mountainvalleyprefab.com`, name `Mountain Valley Prefab`.
4. Go to **Authentication > Rate Limits** and raise **emails sent per hour** to fit the pilot, for example 100.
5. Send yourself a sign-in link and check it isn't marked as spam (Gmail: "Show original" should say SPF, DKIM and DMARC PASS).

**2. Lead and customer-copy emails, from WordPress.** These go through `wp_mail`.
1. Install an SMTP plugin on the site, such as **WP Mail SMTP** or **FluentSMTP**.
2. Connect it to the same service and the same verified domain.
3. Send a test from the plugin, then a test quote.

**One sender for both brands?** SMTP is set once per Supabase project, so all sign-in emails come from one address. For the pilot that's MVP. When Zip Kit joins, choose one of:
- a neutral sender for both;
- the email template naming the right company (Part A step 5);
- a second customer project for Zip Kit.

**Optional before launch:** **Authentication > Attack Protection > CAPTCHA** (Cloudflare Turnstile) stops bots from making accounts. It needs a small change in the quoter to send the CAPTCHA token. Ask me when you want it.

## Part D: linking customer accounts to the client portal (later)

**Goal:** a customer signs in once and sees their own project: model, contract amount, payment schedule, which invoices are sent and paid. That data lives in the **sales** project, which customers must never touch directly.

**Recommended design: a one-way copy of customer-safe fields.**
1. **Link a project to a customer** (sales project): add two columns to `quotes`:
   - `customer_account_id`: the customer's user id from the customer project.
   - `share_with_customer`: true/false.

   A rep links them in the portal, matched by the customer's verified email.
2. **Copy, never share:** a Supabase **Edge Function** in the sales project copies only customer-safe fields into a new `customer_projects` table in the customer project, whenever a linked quote, invoice or payment changes.
   - The fields: project name, model, contract amount, stage names and amounts, invoice sent/paid status, document links.
   - The customer project's secret key lives only as an **Edge Function secret**. It never goes in WordPress, GitHub or a browser.
3. **Customer side:** `customer_projects` is read-only to the customer and limited to their own rows, using the same lock as the tables above.
4. **Portal page:** a later WordPress shortcode, for example `[zipkit_client_portal]`. It reads `customer_projects` with the customer's existing sign-in, so there's no second account.

**What we'll need to decide then:**
- exactly which fields customers see. Never internal notes, rep-only adjustments, discounts or bank numbers;
- whether customers can download invoice PDFs from the portal, or still get them by email from the rep;
- consent wording for the account ("we'll use your account to share your project status");
- who can link accounts (reps, or admins only).

**What we avoid:**
- customer logins in the sales project;
- secret keys in WordPress or the browser;
- the customer project reading the sales project directly.
