# Monipack Full Stack CRM
**Morooj Nizwa International LLC (شركة مروج نزوى العالمية ش.م.م)**
*Manufacturer and Distributor of Packaging, Cleaning, and Food Products in the Sultanate of Oman*

---

## 🌟 Overview
Monipack Full Stack CRM is an enterprise-grade customer relationship management system tailored specifically for Monipack's commercial and sales operations across Oman.

### ✨ Key Features
- **Executive Sales Dashboard**: High-level KPIs, live pipeline value in OMR (`OMR 0.000`), conversion rates, category breakdown charts, and regional Oman branch metrics.
- **Leads & Pipeline Management**:
  - Interactive **Kanban Pipeline** (`New Lead` ➔ `Contacted` ➔ `Quotation Sent` ➔ `Sample Delivered` ➔ `Won / Closed` ➔ `Lost`).
  - Searchable **Table View** with live search, filters (Category, Oman Branch, Pipeline Stage), and CSV export.
  - Stage history tracking with full audit trail on every transition.
  - Soft-delete data protection (`archived_at`).
- **WhatsApp 1-Click Action**:
  - Direct integration with WhatsApp Web & mobile app (`wa.me/+968...`).
  - Pre-composed bilingual templates (HORECA Follow-up in Arabic & English, Quotation Dispatch, Sample Tracking).
  - Automatically logs customer engagement to the lead's activity timeline.
- **Official Monipack Quotation Generator**:
  - Exact reproduction of Monipack's official quote layout (`MNI-ITS-...`).
  - Concurrent-safe unique quotation numbering via PostgreSQL database sequence.
  - Decimal quantity support (`NUMERIC(14,3)` for units like KG, ROLL, etc.).
  - Real-time OMR calculations (Subtotal and Grand Total with 3 decimal places).
  - Built-in **Print to PDF** generator with clean A4 layout.
- **Multi-Brand Product Catalog**:
  - **Monipack**: Clear PET Cups, Double-wall Kraft Cups, Paper Bags, Burger Boxes, Aluminium Containers, Cling Film.
  - **Moniclean**: 5L Disinfectants, Industrial Floor Cleaners, Luxury Foaming Hand Wash, Blue Centrefeed Towel Rolls.
  - **Monifood**: FO Mojito flavored syrup, FO Blue Curacao, FO Fruit Purees.
  - **Kohe**: Commercial Chef Knives, Paring Knives, Stainless Kitchen Shears.
- **Oman Branches & Salesmen Hubs**:
  - Dedicated `branches` and `salesmen` relational models.
  - Multi-branch salesman assignments (e.g., covering Ghala HQ and Musannah) with `default_salesman_id` routing.

---

## 🗄️ Database Setup (PostgreSQL)

### 1. Prerequisites
- **PostgreSQL 14+** running locally or accessible via network.
- Create development and test databases:
```sql
CREATE DATABASE monipack_dev;
CREATE DATABASE monipack_test;
```

### 2. Configure Environment (.env)
Create or update `.env` in the project root:
```env
PORT=5000
JWT_SECRET=your-secure-jwt-secret-at-least-32-chars-long
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/monipack_dev
DATABASE_URL_TEST=postgresql://<username>:<password>@localhost:5432/monipack_test
```

### 3. Run Database Migrations
Executes all SQL migrations in `server/migrations/` sequentially inside transactions:
```bash
npm run migrate
```
Migrations are idempotent and safe to execute multiple times.

### 4. Run Setup Data Import
Imports setup data (users with existing bcrypt password hashes, branches, salesmen, categories, pipeline stages, products, settings) from the historical JSON file into PostgreSQL:
```bash
npm run import-json
```
*(Note: Old test leads, quotes, and activity logs are not imported; the source JSON file is kept intact as a backup).*

### 5. (Optional) Seed Sample Products
Populates sample product catalog if the products table is empty:
```bash
npm run seed
```

---

## 🧪 Testing

Run the automated test suite (runs against `DATABASE_URL_TEST` with safety guards):
```bash
npm test
```
All tests verify feature integrity, security RBAC, rate limiting, and PostgreSQL transactions/soft-deletes.

---

## 🚀 Running the Application

### Development Mode (Backend + Frontend with Hot Reload)
```bash
npm run dev
```
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:5000`

### Production Server
```bash
npm run build
npm start
```

---

## 🛠 Tech Stack
- **Frontend**: React 19, Tailwind CSS v4, Lucide React icons, Plus Jakarta Sans & Cairo typography.
- **Backend**: Node.js, Express REST API, CORS, Helmet security headers.
- **Database**: PostgreSQL with connection pooling (`pg`), SQL migrations, database sequences, and ACID transactions.
- **Testing**: Vitest, Supertest.

## Users & roles

Every person has their own login. Permissions are enforced on the server (`server/auth/permissions.js`); the screens only hide what a role cannot use.

| Role | Can do |
|---|---|
| Super Admin | Everything: users, settings, backups, exports, audit log |
| Manager | All leads (create, assign, archive, import), all quotations, product catalog, audit log. CSV export only if "Allow export" is ticked |
| Customer Care | All leads: create, qualify, assign, import. Create quotations. No delete, export, products or settings |
| Salesman | Only leads assigned to his own salesman record: update stage, log calls, create/update quotations. New enquiries he adds are assigned to himself |

- A salesman login must be linked to a record in the salesmen table (Settings → Staff Accounts → Add Staff User).
- New users and admin password resets get a **temporary password**; the person must choose a new one (min. 10 characters) at first login.
- Deactivating a user, changing their role or resetting their password signs them out immediately.
- Users are never deleted, only deactivated, so history and the audit log stay complete.

## Customer data collection (salesman links)

Super Admin opens **Customer Data** in the menu.

1. **Salesman links**: switch on a link for each salesman, then copy it or send it by WhatsApp. Each salesman is either **Branch** (may tick "No CR" with a reason) or **Route / B2B** (CR always required). **Reset** makes the old link stop working at once. An optional 4–6 digit **PIN** adds protection.
2. **Import**: upload a CSV with the columns `Customer Name` and `Salesman` (plus optional Mobile, CR Number, VAT Number, Route, Segment, Address…). Google Sheets: File → Download → CSV. Excel: Save As → CSV UTF-8. Customers that are already in the CRM are skipped.
3. The salesman opens his link (`/c/<name>-<token>`). He sees **only his customers** and a counter of how many remain. He fills in mobile + CR (required) and the optional details, takes photos of the CR, the VAT certificate and the shop front, and can add customers who are missing from his list. Those new customers wait for approval.
4. **Progress** shows each salesman's numbers and which details are missing. **Customers** lets you filter, edit (Super Admin only), approve, transfer, archive, download each photo as a PDF or all photos as one PDF, and print the profile.

Notes:
- After a customer is submitted, the salesman cannot change it. Only the Super Admin can.
- If a mobile, CR or VAT number already belongs to another customer, the customer goes to **Pending approval** and shows a note about the possible duplicate.
- Uploaded files are saved in a private folder (`UPLOAD_DIR`, default `./uploads`). The web server never shares this folder directly. Back it up together with the database.
- Fields: add new fields, choose which ones are required for each salesman type, hide fields, and edit the dropdown options. Mobile and CR are always required.
