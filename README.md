# FlowStock ERP & Inventory Invoicing Hub

An automated Business Management & Real-Time Product Stock Checking Web Application with 1-click POS invoicing, barcode scanner support, and Excel spreadsheet bulk sync.

---

## 🌟 Key Features

### 1. Real-Time Product Stock Checker & Scanner Station
- **Hardware Barcode Scanner & SKU Support**: Connect any USB or Bluetooth barcode scanner or type SKU / model names for live detection.
- **Stock Status Indicators & Visual Health Meters**:
  - 🟢 **Healthy Stock**: Items comfortably above safety reorder thresholds.
  - 🟡 **Low Stock Alerts**: Real-time warnings for depleted or low stock items.
  - 🔴 **Out of Stock**: Red status tags for empty inventory.
- **Financial Analytics per SKU**: Wholesale cost price, retail selling price, profit margin `%`, and current warehouse asset valuation.
- **1-Click Quick Replenishment Controls**: Restock `+5`, `+20`, `+50` units or record instant deduction (`-1`) with a single click.

### 2. Global Quick Stock Lookup Modal (`Ctrl + K` / `Cmd + K`)
- Press `Ctrl + K` (or `Cmd + K` on macOS) from anywhere in the application to trigger a floating command search palette with instant stock counts.

### 3. Deep Product Stock Inspector & Audit Trail
- Click **"Inspect Stock"** on any product to view:
  - Unit economics and profit margin percentage.
  - Total historical units sold and revenue generated.
  - Complete 20-entry stock movement audit ledger (timestamp, change, previous/new stock, reference note).
  - On-the-fly restock replenishment form.

### 4. Automated POS Invoicing & Inventory Deductions
- Quick client selection or on-the-fly customer creation.
- Instant product auto-fill via barcode scanner or search.
- **Automatic Stock Deduction**: Synchronously updates warehouse counts and logs an audit movement when invoices are issued.
- **Stock Shortage Prevention**: Alerts if requested quantity exceeds available warehouse units.
- **Printable A4 Invoices & PDF**: Generates professional invoices with bank wire instructions and company tax credentials.

### 5. Bulk Excel & CSV Import/Export
- Bulk import products using `.xlsx` or `.csv` files.
- Export inventory catalogs, invoice registers, and audit trails to Excel anytime.
- Downloadable sample Excel import templates.

### 6. Company Customization & Themes
- Dark and Light theme toggle.
- Customizable business name, tax ID / EIN, currency symbol, default tax rates, and payment notes.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (version 18 or newer)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/reddyharsha759-ship-it/Inventory-Invoicing.git
cd Inventory-Invoicing

# Install dependencies
npm install

# Start the application
npm start
```

Open your browser and visit:
```
http://localhost:3000
```

---

## 🧪 Automated Testing

To run the built-in end-to-end integration test suite:
```bash
node test-e2e.js
```
The test suite verifies:
- Frontend asset delivery & modals
- Dashboard KPI & valuation calculations
- Exact barcode and SKU stock lookups
- Deep stock inspection & sales performance
- Quick stock adjustments and audit ledger persistence
- Automated invoicing with stock shortage prevention & inventory deduction
- Customer directory and Excel export services

---

## 🛠️ Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: SQLite (`node:sqlite` high-performance local database)
- **Data Processing**: XLSX (SheetJS) for spreadsheet import & export, Multer for file uploads
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 Custom Properties (Dark/Light mode)
- **Icons & Charts**: Font Awesome 6, Chart.js

---

## 📄 License
MIT License
