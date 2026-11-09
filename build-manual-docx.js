const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType
} = require('docx');

// Colors
const COLOR_PRIMARY = '1E3A8A'; // Navy Blue
const COLOR_SECONDARY = '2563EB'; // Royal Blue
const COLOR_ACCENT = '0D9488'; // Teal
const COLOR_DARK = '1E293B'; // Slate 800
const COLOR_MUTED = '64748B'; // Slate 500
const COLOR_LIGHT_BG = 'F1F5F9'; // Slate 100
const COLOR_SUCCESS_BG = 'ECFDF5'; // Light Green
const COLOR_WARNING_BG = 'FFFBEB'; // Light Amber
const COLOR_BORDER = 'CBD5E1'; // Slate 300

function createTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        size: 52, // 26pt
        bold: true,
        color: COLOR_PRIMARY,
        font: 'Calibri'
      })
    ]
  });
}

function createSubtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 360 },
    children: [
      new TextRun({
        text,
        size: 26, // 13pt
        italics: true,
        color: COLOR_MUTED,
        font: 'Calibri'
      })
    ]
  });
}

function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [
      new TextRun({
        text,
        size: 36, // 18pt
        bold: true,
        color: COLOR_PRIMARY,
        font: 'Calibri'
      })
    ]
  });
}

function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [
      new TextRun({
        text,
        size: 28, // 14pt
        bold: true,
        color: COLOR_SECONDARY,
        font: 'Calibri'
      })
    ]
  });
}

function createHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text,
        size: 24, // 12pt
        bold: true,
        color: COLOR_DARK,
        font: 'Calibri'
      })
    ]
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 100 },
    alignment: options.alignment || AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        size: 22, // 11pt
        color: COLOR_DARK,
        font: 'Calibri',
        bold: options.bold || false,
        italics: options.italics || false
      })
    ]
  });
}

function createBullet(title, description) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 60 },
    children: [
      new TextRun({
        text: title + ': ',
        size: 22,
        bold: true,
        color: COLOR_DARK,
        font: 'Calibri'
      }),
      new TextRun({
        text: description,
        size: 22,
        color: COLOR_DARK,
        font: 'Calibri'
      })
    ]
  });
}

function createCallout(title, text, type = 'info') {
  const bgColor = type === 'success' ? COLOR_SUCCESS_BG : (type === 'warning' ? COLOR_WARNING_BG : COLOR_LIGHT_BG);
  const borderColor = type === 'success' ? '10B981' : (type === 'warning' ? 'F59E0B' : COLOR_SECONDARY);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 24, color: borderColor }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: bgColor },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: title,
                    size: 22,
                    bold: true,
                    color: borderColor,
                    font: 'Calibri'
                  })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text,
                    size: 20,
                    color: COLOR_DARK,
                    font: 'Calibri'
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function createTable(headers, rows) {
  const tableRows = [];

  // Header row
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map(h => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: COLOR_PRIMARY },
        margins: { top: 120, bottom: 120, left: 140, right: 140 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: h,
                size: 22,
                bold: true,
                color: 'FFFFFF',
                font: 'Calibri'
              })
            ]
          })
        ]
      }))
    })
  );

  // Data rows
  rows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    tableRows.push(
      new TableRow({
        children: row.map(cell => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : COLOR_LIGHT_BG },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: String(cell),
                  size: 20,
                  color: COLOR_DARK,
                  font: 'Calibri'
                })
              ]
            })
          ]
        }))
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
    },
    rows: tableRows
  });
}

async function buildDocx() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // TITLE & HEADER
          createTitle('FlowStock ERP & Invoicing Hub'),
          createSubtitle('Official User Guide, Operations Manual & Stock Checking Reference'),

          createCallout(
            'Quick System Access',
            'Local Access: http://localhost:3000\nProduction/Vercel URL: https://inventory-invoicing.vercel.app\nDefault Port: 3000 | Architecture: Node.js, Express, SQLite, Chart.js',
            'info'
          ),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 1. INTRODUCTION
          createHeading1('1. System Overview & Architecture'),
          createParagraph('FlowStock ERP is an all-in-one business management and real-time inventory control platform designed for retail, wholesale, and distribution operations. It synchronizes live stock levels with point-of-sale invoicing, automated inventory deductions, barcode scanner hardware, and spreadsheet synchronization.'),

          createHeading2('Core Functional Modules:'),
          createBullet('Executive Dashboard', 'High-level KPI cards for total revenue, inventory retail/cost valuation, pending receivables, and interactive top-selling product charts.'),
          createBullet('Real-Time Stock Checker', 'A dedicated search and scanner station for instant barcode, SKU, and model lookups with visual stock health meters.'),
          createBullet('Point-of-Sale (POS) Invoicing', '1-click rapid invoice generation with customer auto-select, barcode auto-fill, automated tax and discount calculation, and automatic stock deduction.'),
          createBullet('Product Catalog Management', 'Full SKU lifecycle tracking, wholesale vs. retail pricing, category classification, and reorder alert thresholds.'),
          createBullet('Customer Account Directory', 'Client billing profiles, contact information, tax identification numbers, and outstanding balance tracking.'),
          createBullet('Stock Audit Trail Ledger', 'An immutable record of all inventory transactions (sales, restocks, damage write-offs, physical counts).'),
          createBullet('Bulk Spreadsheet Sync', 'Bulk import products via Excel (.xlsx) and CSV, with instant one-click data export capabilities.'),
          createBullet('Company & Branding Settings', 'Customization for business name, contact info, tax ID, currency symbol, default tax rates, and bank wire details printed on invoices.'),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 2. REAL-TIME STOCK CHECKER
          createHeading1('2. How to Check Stock of Products'),
          createParagraph('The Stock Checker is the core intelligence center of FlowStock ERP. It allows warehouse workers, sales reps, and managers to instantly look up any item by scanning a barcode or typing a product name/SKU.'),

          createHeading2('Method A: Using the Dedicated Stock Checker Station'),
          createParagraph('1. Click "Check Stock" in the left sidebar menu.'),
          createParagraph('2. The high-speed search station automatically focuses the scanner input.'),
          createParagraph('3. Type any product name (e.g., "Router", "Headphones"), SKU ("SKU-1001"), or scan a product barcode with a barcode scanner gun.'),
          createParagraph('4. Pressing Enter or typing instantly filters the catalog with zero latency.'),

          createHeading2('Method B: Global Command Palette (Ctrl + K / Cmd + K)'),
          createParagraph('You can check stock from anywhere in the application without leaving your current screen:'),
          createBullet('Windows / Linux', 'Press Ctrl + K'),
          createBullet('macOS', 'Press Cmd + K'),
          createBullet('Mouse Click', 'Click the "Check Stock... [Ctrl+K]" button in the top navigation bar.'),
          createParagraph('A floating modal appears immediately. Type 1 or 2 letters to view live stock quantities, retail price, and stock status.'),

          createHeading2('Understanding Stock Health Badges & Meters'),
          createParagraph('Each product card displays a real-time status indicator and visual health meter:'),

          createTable(
            ['Status Badge', 'Condition', 'Visual Indicator', 'Recommended Action'],
            [
              ['Healthy Stock', 'Current Stock > Min Alert Threshold', 'Green Badge & Green Health Bar', 'Stock levels are optimal. No reorder required.'],
              ['Low Stock Alert', 'Current Stock <= Min Alert Threshold (Stock > 0)', 'Amber Badge & Amber Progress Bar', 'Attention needed. Reorder with supplier promptly.'],
              ['Out of Stock', 'Current Stock = 0', 'Red Badge & Red Empty Bar', 'Critical depleted status. Invoicing blocked unless overridden.']
            ]
          ),

          new Paragraph({ spacing: { before: 160, after: 160 } }),

          createHeading2('Financial Unit Economics Displayed per Item'),
          createParagraph('Every product card calculates and surfaces live financial intelligence:'),
          createBullet('Selling Price', 'The active retail or wholesale price billed to clients.'),
          createBullet('Cost Price', 'The inventory acquisition cost per unit.'),
          createBullet('Unit Margin (%)', 'Calculated profit margin percentage: ((Selling - Cost) / Selling) * 100.'),
          createBullet('Valuation on Hand', 'Total capital tied up in warehouse inventory: Current Stock * Selling Price.'),

          createHeading2('1-Click Quick Restock & Deduction Controls'),
          createParagraph('Located directly on each product card:'),
          createBullet('+5 Units', 'Instantly adds 5 units (e.g., quick carton delivery).'),
          createBullet('+20 Units', 'Instantly adds 20 units.'),
          createBullet('+50 Units', 'Instantly adds 50 units (e.g., bulk pallet arrival).'),
          createBullet('-1 Unit', 'Instantly logs a single unit deduction (e.g., walk-in cash sale or counter sample).'),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 3. PRODUCT INSPECTOR
          createHeading1('3. Deep Product Stock Inspector & Audit Ledger'),
          createParagraph('Clicking the "Inspect Stock" button on any product card or catalog row opens the comprehensive Product Stock Inspector Sheet.'),

          createHeading2('Inspector Contents:'),
          createBullet('Big Stock Display', 'Prominent current stock count and unit of measure (pcs, kg, box).'),
          createBullet('Threshold Alert', 'Displays the safety reorder threshold configured for that item.'),
          createBullet('Sales Performance', 'Total units sold across all invoices and gross revenue generated.'),
          createBullet('20-Transaction Audit Ledger', 'Chronological log showing every historical sale, restock, and manual adjustment with timestamp, quantity change (+/-), previous stock, new stock, and reference note.'),
          createBullet('Instant Replenishment Form', 'Enter any custom quantity and click "Restock Units" to update warehouse inventory immediately.'),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 4. POINT OF SALE INVOICING
          createHeading1('4. Automated Invoicing & POS Billing'),
          createParagraph('FlowStock features an integrated point-of-sale billing module with automated inventory deduction.'),

          createHeading2('Step-by-Step Invoice Creation:'),
          createParagraph('1. Navigate to "Create Invoice" in the sidebar or click "Quick Invoice" in the top bar.'),
          createParagraph('2. Select an existing client from the dropdown, or click "+ New Customer" to add a client on the fly.'),
          createParagraph('3. Verify Invoice Date, Payment Due Date, and Payment Method (Bank Wire, Cash, Credit Card, UPI, Net-30).'),
          createParagraph('4. Add Products:'),
          createBullet('Barcode / SKU Search', 'Type in the Quick Barcode box or scan an item with your barcode gun to auto-populate the line item.'),
          createBullet('Custom Line Items', 'Click "+ Add Custom Service / Item" for non-inventory billables (e.g., labor, delivery fees).'),
          createParagraph('5. Adjust Line Quantity, Unit Price, or Line Discounts as needed.'),
          createParagraph('6. Review Financial Summary: Subtotal, Overall Discount, Tax Rate (%), and Grand Total are calculated in real time.'),
          createParagraph('7. Finalize:'),
          createBullet('Generate & Save Invoice', 'Saves the invoice record and automatically deducts the stock in real time.'),
          createBullet('Generate & Print / PDF', 'Saves invoice and immediately opens the printable A4 sheet preview.'),

          createCallout(
            'Automated Inventory Synchronization & Safety Guard',
            'When an invoice is saved, the system automatically checks current stock levels. If an invoice requests more units than are in stock, FlowStock displays a Stock Shortage Warning alert to prevent negative inventory.\nUpon confirmation, units are deducted and an immutable audit record is logged with the invoice number.',
            'warning'
          ),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 5. PRINTABLE INVOICES
          createHeading1('5. Printable Invoices & PDF Export'),
          createParagraph('FlowStock includes an integrated A4 print engine with professional typography and formatting.'),
          createBullet('Company Header', 'Displays your company name, address, tax ID, phone, and billing email.'),
          createBullet('Client Card', 'Displays client company name, contact person, billing address, and tax credentials.'),
          createBullet('Banking Instructions', 'Prints your wire transfer details, IBAN/Routing, account numbers, and SWIFT codes directly on the invoice.'),
          createBullet('Terms & Legal Conditions', 'Customizable terms, late payment interest fees, and authorized signature lines.'),
          createParagraph('To print or save as PDF, open any invoice preview and press Ctrl + P or click the "Print / Save as PDF" button.'),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 6. BULK IMPORT & EXPORT
          createHeading1('6. Bulk Spreadsheet Sync (Excel & CSV)'),
          createParagraph('Easily eliminate manual product entry by syncing your inventory via Excel.'),

          createHeading2('Bulk Importing Products:'),
          createParagraph('1. Navigate to "Excel Import / Export" in the sidebar.'),
          createParagraph('2. Click "Download Sample Excel Template" to receive the pre-formatted .xlsx template.'),
          createParagraph('3. Populate the spreadsheet with your data according to the supported columns:'),

          createTable(
            ['Column Header', 'Required?', 'Example Value', 'Description'],
            [
              ['Product Name', 'Yes', 'UltraVision 34-Inch Curved Monitor', 'Descriptive name of the product'],
              ['SKU', 'Recommended', 'SKU-1003', 'Unique Stock Keeping Unit code (Auto-generated if omitted)'],
              ['Barcode', 'Optional', '890123456703', 'EAN-13, UPC, or custom barcode string'],
              ['Category', 'Optional', 'Computer Hardware', 'Auto-created if new category name is provided'],
              ['Cost Price', 'Yes', '310.00', 'Wholesale acquisition cost per unit'],
              ['Selling Price', 'Yes', '549.00', 'Retail customer price'],
              ['Current Stock', 'Yes', '25', 'Initial stock count on hand'],
              ['Min Stock Alert', 'Optional', '5', 'Reorder trigger threshold (Default: 5)'],
              ['Unit', 'Optional', 'pcs', 'Unit of measurement (pcs, box, kg, etc.)']
            ]
          ),

          new Paragraph({ spacing: { before: 160, after: 160 } }),

          createParagraph('4. Drag and drop the completed file into the upload zone and click "Process Spreadsheet Import". Existing SKUs are automatically updated, and new SKUs are inserted.'),

          createHeading2('Exporting Data:'),
          createBullet('Export Products Catalog', 'Click "Export Catalog (XLSX)" to download all product valuations, costs, barcodes, and current stock counts.'),
          createBullet('Export Invoices Register', 'Click "Export Register (XLSX)" to download complete sales history, customer totals, and payment statuses.'),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 7. KEYBOARD SHORTCUTS
          createHeading1('7. Keyboard Shortcuts Quick Reference'),
          createTable(
            ['Shortcut', 'Platform', 'Action'],
            [
              ['Ctrl + K', 'Windows / Linux', 'Open Global Quick Stock Check & Barcode Lookup Modal'],
              ['Cmd + K', 'macOS', 'Open Global Quick Stock Check & Barcode Lookup Modal'],
              ['Enter', 'All Platforms', 'Trigger instant barcode scan lookup in search field'],
              ['Esc', 'All Platforms', 'Close any active modal or search palette'],
              ['Ctrl + P', 'All Platforms', 'Print invoice or save as PDF']
            ]
          ),

          new Paragraph({ spacing: { before: 200, after: 200 } }),

          // 8. FAQ & TROUBLESHOOTING
          createHeading1('8. Troubleshooting & FAQ'),
          createBullet('Barcode scanner does not trigger automatic lookup', 'Ensure your barcode scanner is configured in "Keyboard Emulation" mode with a trailing Enter/Carriage Return suffix.'),
          createBullet('Preventing negative inventory', 'By default, the invoice builder warns you if an order exceeds warehouse units. If needed, you can check "Allow negative stock" for backorders.'),
          createBullet('Deleting products with invoice history', 'To protect accounting integrity, products with existing invoices are safely marked as "Inactive" rather than hard-deleted.'),
          createBullet('Dark / Light theme persistence', 'Your theme choice is stored in your browser LocalStorage and remains preserved across sessions.')
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, 'FlowStock_ERP_User_Manual.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document successfully written to: ${outputPath}`);
}

buildDocx().catch(err => {
  console.error('Failed to build docx:', err);
  process.exit(1);
});
