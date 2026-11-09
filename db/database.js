const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (err) {
  console.error('CRITICAL: node:sqlite module could not be loaded. Ensure Node.js 22.x or newer is configured on Vercel.', err);
}

// In Vercel / serverless environments, the filesystem is read-only except /tmp
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
const dbPath = isServerless
  ? path.join(os.tmpdir(), 'inventory.db')
  : path.join(__dirname, '..', 'inventory.db');

// If a bundled database exists on cold start, copy to writable /tmp
if (isServerless) {
  const localDb = path.join(__dirname, '..', 'inventory.db');
  if (fs.existsSync(localDb) && !fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(localDb, dbPath);
    } catch (e) {
      console.warn('Could not copy bundled inventory.db to /tmp, will initialize fresh:', e.message);
    }
  }
}

const db = DatabaseSync ? new DatabaseSync(dbPath) : null;

// Enable foreign keys
if (db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
  `);
}

// Initialize Database Tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Apex Global Trading Co.',
      tagline TEXT DEFAULT 'Wholesale & Retail Distribution Specialists',
      email TEXT DEFAULT 'contact@apexglobal.com',
      phone TEXT DEFAULT '+1 (555) 234-5678',
      address TEXT DEFAULT '742 Evergreen Terrace, Suite 400, Springfield, IL 62704',
      tax_id TEXT DEFAULT 'US-TAX-88392019',
      currency_symbol TEXT DEFAULT '$',
      invoice_prefix TEXT DEFAULT 'INV-',
      default_tax_rate REAL DEFAULT 8.5,
      bank_details TEXT DEFAULT 'Bank: JPMorgan Chase | A/C: 4892-0012-9842 | Routing: 021000021 | SWIFT: CHASUS33',
      terms_notes TEXT DEFAULT 'Thank you for your business! Payment is due within 30 days of invoice date. Late payments are subject to a 1.5% monthly interest fee.'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      cost_price REAL NOT NULL DEFAULT 0.0,
      selling_price REAL NOT NULL DEFAULT 0.0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 5,
      unit TEXT DEFAULT 'pcs',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      tax_id TEXT,
      billing_address TEXT,
      shipping_address TEXT,
      outstanding_balance REAL DEFAULT 0.0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      customer_tax_id TEXT,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
      subtotal REAL NOT NULL DEFAULT 0.0,
      tax_rate REAL NOT NULL DEFAULT 0.0,
      tax_amount REAL NOT NULL DEFAULT 0.0,
      discount_amount REAL NOT NULL DEFAULT 0.0,
      total_amount REAL NOT NULL DEFAULT 0.0,
      amount_paid REAL NOT NULL DEFAULT 0.0,
      payment_method TEXT DEFAULT 'bank_transfer',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      unit TEXT DEFAULT 'pcs',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0.0,
      discount REAL DEFAULT 0.0,
      total REAL NOT NULL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'purchase', 'adjustment', 'return', 'initial')),
      quantity_change INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reference_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure initial settings exist
  const checkSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!checkSettings) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }

  // Seed initial demo data if products table is empty
  const checkProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (checkProducts.count === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  console.log('Seeding initial inventory and customer data...');

  // Seed Categories
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
  insertCat.run('Electronics & Audio', 'Smartphones, audio gear, and personal computing accessories');
  insertCat.run('Computer Hardware', 'Monitors, mechanical keyboards, docking hubs, and storage');
  insertCat.run('Office Furniture', 'Ergonomic seating, motorized standing desks, and monitor arms');
  insertCat.run('Cables & Networking', 'Thunderbolt cables, Wi-Fi 7 routers, and Cat6 patch cables');

  const catRows = db.prepare('SELECT id, name FROM categories').all();
  const catMap = {};
  for (const c of catRows) {
    catMap[c.name] = c.id;
  }

  // Seed Products
  const insertProd = db.prepare(`
    INSERT INTO products (sku, barcode, name, description, category_id, cost_price, selling_price, current_stock, min_stock_alert, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialProducts = [
    ['SKU-1001', '890123456701', 'ProSonic ANC Wireless Headphones', 'Studio-grade noise cancelling bluetooth 5.4 over-ear headphones with 45h battery', catMap['Electronics & Audio'], 120.00, 249.99, 42, 10, 'pcs'],
    ['SKU-1002', '890123456702', 'ApexMech RGB Mechanical Keyboard', 'Hot-swappable Gateron Red linear switches, CNC aluminum chassis, wireless triple-mode', catMap['Computer Hardware'], 55.00, 119.50, 28, 8, 'pcs'],
    ['SKU-1003', '890123456703', 'UltraVision 34-Inch Curved Monitor', 'UWQHD 165Hz IPS 1ms HDR400 display with 90W USB-C power delivery', catMap['Computer Hardware'], 310.00, 549.00, 14, 5, 'pcs'],
    ['SKU-1004', '890123456704', 'ThunderDock Pro 14-in-1 Hub', 'Dual 4K HDMI, 2.5G Ethernet, 100W PD charging, SD 4.0 card reader', catMap['Computer Hardware'], 48.00, 109.99, 3, 10, 'pcs'], // Low stock trigger
    ['SKU-1005', '890123456705', 'ErgoComfort Executive Mesh Chair', 'Dynamic lumbar support, 4D adjustable armrests, breathable Korean mesh', catMap['Office Furniture'], 160.00, 329.00, 18, 6, 'pcs'],
    ['SKU-1006', '890123456706', 'AeroLift Dual-Motor Standing Desk', 'Solid bamboo desktop 60x30 inch, anti-collision sensor, 4 memory presets', catMap['Office Furniture'], 210.00, 479.00, 7, 5, 'pcs'],
    ['SKU-1007', '890123456707', 'HyperBraided Thunderbolt 4 Cable (2m)', '40Gbps data transfer, 240W EPR fast charging, military nylon braiding', catMap['Cables & Networking'], 8.50, 29.99, 85, 20, 'pcs'],
    ['SKU-1008', '890123456708', 'Enterprise Wi-Fi 7 Tri-Band Router', 'BE19000 speeds, 10Gbps WAN/LAN port, dual multi-core processors', catMap['Cables & Networking'], 180.00, 389.00, 2, 8, 'pcs'] // Low stock trigger
  ];

  for (const p of initialProducts) {
    const res = insertProd.run(...p);
    const prodId = Number(res.lastInsertRowid);
    // Add initial inventory transaction
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, reference_id, notes)
      VALUES (?, 'initial', ?, 0, ?, 'INITIAL-SETUP', 'Opening inventory balance')
    `).run(prodId, p[7], p[7]);
  }

  // Seed Customers
  const insertCust = db.prepare(`
    INSERT INTO customers (name, company, email, phone, tax_id, billing_address, shipping_address, outstanding_balance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCust.run(
    'Marcus Vance',
    'Vance Tech Solutions LLC',
    'marcus@vancetech.io',
    '+1 (555) 782-9912',
    'US-EIN-9482103',
    '100 Innovation Way, Suite 800, Austin, TX 78701',
    '100 Innovation Way, Suite 800, Austin, TX 78701',
    0.0,
    'Enterprise client with recurring quarterly IT hardware purchase agreements'
  );

  insertCust.run(
    'Elena Rostova',
    'Horizon Digital Media',
    'elena@horizondigital.com',
    '+1 (555) 612-4433',
    'US-EIN-5520194',
    '450 Creative Blvd, Floor 4, Los Angeles, CA 90028',
    '450 Creative Blvd, Floor 4, Los Angeles, CA 90028',
    1249.50,
    'Creative production studio. Net-30 payment terms.'
  );

  insertCust.run(
    'David Chen',
    'Chen & Associates Architecture',
    'dchen@chenarchitects.com',
    '+1 (555) 439-8801',
    'US-EIN-8812940',
    '220 Market Street, Suite 300, San Francisco, CA 94105',
    '220 Market Street, Suite 300, San Francisco, CA 94105',
    0.0,
    'Premium ergonomic office furniture buyer'
  );

  // Seed a sample completed invoice and pending invoice to show immediate data & charts
  const customer1 = db.prepare("SELECT * FROM customers WHERE name = 'Marcus Vance'").get();
  const prod1 = db.prepare("SELECT * FROM products WHERE sku = 'SKU-1001'").get();
  const prod2 = db.prepare("SELECT * FROM products WHERE sku = 'SKU-1002'").get();
  const prod7 = db.prepare("SELECT * FROM products WHERE sku = 'SKU-1007'").get();

  const inv1Date = new Date();
  inv1Date.setDate(inv1Date.getDate() - 3);
  const inv1Due = new Date();
  inv1Due.setDate(inv1Due.getDate() + 27);

  const subtotal1 = (prod1.selling_price * 2) + (prod2.selling_price * 3) + (prod7.selling_price * 5);
  const taxRate = 8.5;
  const taxAmt1 = Math.round(subtotal1 * 0.085 * 100) / 100;
  const total1 = Math.round((subtotal1 + taxAmt1) * 100) / 100;

  const invRes = db.prepare(`
    INSERT INTO invoices (
      invoice_number, customer_id, customer_name, customer_email, customer_phone, customer_address, customer_tax_id,
      invoice_date, due_date, status, subtotal, tax_rate, tax_amount, discount_amount, total_amount, amount_paid, payment_method, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, 0.0, ?, ?, 'bank_transfer', ?)
  `).run(
    'INV-2026-0001',
    customer1.id,
    customer1.name,
    customer1.email,
    customer1.phone,
    customer1.billing_address,
    customer1.tax_id,
    inv1Date.toISOString().split('T')[0],
    inv1Due.toISOString().split('T')[0],
    subtotal1,
    taxRate,
    taxAmt1,
    total1,
    total1,
    'Quarterly engineering workstation audio and peripherals order'
  );

  const invId = Number(invRes.lastInsertRowid);

  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, product_name, sku, unit, quantity, unit_price, discount, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?)
  `);

  insertItem.run(invId, prod1.id, prod1.name, prod1.sku, prod1.unit, 2, prod1.selling_price, prod1.selling_price * 2);
  insertItem.run(invId, prod2.id, prod2.name, prod2.sku, prod2.unit, 3, prod2.selling_price, prod2.selling_price * 3);
  insertItem.run(invId, prod7.id, prod7.name, prod7.sku, prod7.unit, 5, prod7.selling_price, prod7.selling_price * 5);

  console.log('Seed data successfully populated!');
}

// Helper to convert any BigInt values in objects or arrays to standard Numbers
function cleanData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'bigint') return Number(data);
  if (Array.isArray(data)) return data.map(cleanData);
  if (typeof data === 'object') {
    const res = {};
    for (const key of Object.keys(data)) {
      res[key] = cleanData(data[key]);
    }
    return res;
  }
  return data;
}

module.exports = {
  db,
  initDatabase,
  cleanData
};
