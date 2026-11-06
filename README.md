# Cargo System — React + Supabase

A React cargo receipt system that preserves the existing 80mm receipt design and adds:

- Supabase email/password staff authentication
- Receipt editor and cargo history restricted to active, signed-in staff
- Cargo shipment records and searchable recent history
- Shipment status updates and payment ledger entries
- Random public tracking links that expose status and route only
- A searchable local receipt archive, QR code with an optional uploaded logo, Code 128 barcode, and 80mm printing
- Staff profiles and administrator-managed staff invitations

## Requirements

- Node.js 18 or newer
- A Supabase project
- Chrome or Edge recommended

## Run locally

```bash
npm install
npm run dev
```

Receipt editing and printing work without Supabase. To enable authentication and database features:

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project's URL and publishable/anon key from Supabase.
3. Restart the Vite development server after changing environment variables.
4. In the Supabase SQL Editor, run `supabase/migrations/20261106000000_phase1_cargo.sql`, then `supabase/migrations/20261106000001_accounts_and_profiles.sql`.

The publishable/anon key is intended for browser use. Never put a Supabase `service_role` or secret key in a `VITE_` variable or frontend source.

## Set up the first administrator

The migration creates a `MAIN` branch and an inactive staff profile when an Auth user is created. Keep public sign-up disabled in Supabase Auth and invite only staff accounts.

1. Create/invite your own account in Supabase **Authentication → Users**.
2. In the SQL Editor, promote that account to the first administrator, replacing the email:

   ```sql
   update public.profiles p
   set role = 'admin', is_active = true, branch_id = b.id
   from public.branches b
   join auth.users u on u.email = 'admin@example.com'
   where p.id = u.id and b.code = 'MAIN';
   ```

3. Deploy the administrator-only invitation function:

   ```bash
   npx supabase functions deploy admin-invite-user
   ```

   The function uses Supabase's configured Auth Site URL for invite redirects; set the `APP_SITE_URL` function secret only if you need to override it. Supabase provides the service-role secret in the function's server-side runtime. Never add that secret to Vercel `VITE_` variables or client code. In the app, an administrator can use **Account → Invite an account**, then assign the new account a branch and activate it in the staff list. Supabase sends the invited user a secure password setup link.

The receipt editor and cargo history are shown only to signed-in staff with an active profile and assigned branch. The **Account** page lets staff update their name, phone, and profile photo; administrators can invite and manage staff. Public tracking links remain accessible without signing in and show status and route only; they do not expose customer contact details or payment information, and do not link back to the staff app. Cargo history shows shipment creators, customer/contact details, payment history, status history, and public tracking actions only to authorized staff. The migration enables RLS on all cargo tables and restricts profile edits to safe fields.

## Deploy to Vercel

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Vercel project's environment variables, then redeploy. Apply SQL migrations to the Supabase project separately; the frontend build does not run database migrations.

## Print on an 80mm thermal printer

1. Click **Print receipt**.
2. Select your 80mm thermal printer.
3. Set paper width to 80mm and margins to None / 0 if available.
4. Disable browser headers and footers.
5. Set scale to 100% or Default.

To create a PDF, choose **Save as PDF** in the print destination list.

## Notes

- Receipt edits are collected in **Local receipts** in this browser's local storage; loading a Supabase shipment into the editor does not replace the server record until **Update cargo** is selected.
- The optional QR logo is stored only in this browser and embedded into generated QR images. Keep the uploaded logo under 200 KB; high QR error correction is enabled to preserve scan reliability.
- Profile photos are stored in the `profile-avatars` Supabase Storage bucket created by the account migration.
- Receipt currency totals remain editable, as in the original receipt generator. Recorded payments are checked against the outstanding MMK balance.
- The QR code contains only the receipt number and route until a shipment is saved. After saving, it opens the privacy-limited public tracking page.
