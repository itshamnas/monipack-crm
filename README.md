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
  - Pre-seeded with **541+ verified leads** from the HORECA Oman 2026 expo and Meta campaigns.
- **WhatsApp 1-Click Action**:
  - Direct integration with WhatsApp Web & mobile app (`wa.me/+968...`).
  - Pre-composed bilingual templates (HORECA Follow-up in Arabic & English, Quotation Dispatch, Sample Tracking).
  - Automatically logs customer engagement to the lead's activity timeline.
- **Official Monipack Quotation Generator**:
  - Exact pixel-perfect reproduction of Monipack's official quote layout (`MNI-ITS-...`).
  - Supports Morooj Nizwa header, Moniclean, Monifood, Monipack, and Kohe brand badges.
  - Real-time OMR calculations (Subtotal and Grand Total with 3 decimal places).
  - Built-in **Print to PDF** generator with clean A4 layout.
- **Multi-Brand Product Catalog**:
  - **Monipack**: Clear PET Cups, Double-wall Kraft Cups, Paper Bags, Burger Boxes, Aluminium Containers, Cling Film.
  - **Moniclean**: 5L Disinfectants, Industrial Floor Cleaners, Luxury Foaming Hand Wash, Blue Centrefeed Towel Rolls.
  - **Monifood**: FO Mojito flavored syrup, FO Blue Curacao, FO Fruit Purees.
  - **Kohe**: Commercial Chef Knives, Paring Knives, Stainless Kitchen Shears.
- **10 Oman Branches Hubs**:
  - Ghala (HQ), Al Khoud, Mabela, Amarath, Musannah, Nizwa, Ibri, Ibra, Bahla, Jalan Bani Buali.

---

## 🚀 Quick Start

### 1. Launch with One Click
Double-click `start-crm.bat` in the project root. It will automatically initialize the database, launch the server, and open your browser at:
```
http://localhost:5000
```

### 2. Manual Command Line
```powershell
# In PowerShell:
$env:PATH = "$env:LOCALAPPDATA\Programs\nodejs;" + $env:PATH
cd "c:\Users\retai\Downloads\monipack fullstack crm"

# Run Production Server (serves UI + API on port 5000):
node server/index.js

# Or Run Development Mode with Hot Reload:
npm run dev
```

---

## 🛠 Tech Stack
- **Frontend**: React 19, Tailwind CSS v4, Lucide React icons, Plus Jakarta Sans & Cairo typography.
- **Backend**: Node.js, Express REST API, CORS.
- **Storage**: ACID atomic JSON database (`server/data/monipack_crm.json`) with zero external DB configuration.
- **Data Ingestion**: Custom CSV parser that ingested `monipack_leads_2026-09-22.csv`.
