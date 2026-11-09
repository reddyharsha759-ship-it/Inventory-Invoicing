const express = require('express');
const cors = require('cors');
const path = require('node:path');
const multer = require('multer');
const XLSX = require('xlsx');
const { db, initDatabase, cleanData } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload middleware in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database tables & seed data
initDatabase();

// ==========================================
// 1. SETTINGS ENDPOINTS
// ==========================================
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(cleanData(settings));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const {
      company_name, tagline, email, phone, address, tax_id,
      currency_symbol, invoice_prefix, default_tax_rate, bank_details, terms_notes
    } = req.body;

    db.prepare(`
      UPDATE settings SET
        company_name = ?, tagline = ?, email = ?, phone = ?, address = ?,
        tax_id = ?, currency_symbol = ?, invoice_prefix = ?,
        default_tax_rate = ?, bank_details = ?, terms_notes = ?
      WHERE id = 1
    `).run(
      company_name, tagline, email, phone, address, tax_id,
      currency_symbol, invoice_prefix, Number(default_tax_rate) || 0, bank_details, terms_notes
    );

    const updated = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(cleanData(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. DASHBOARD / KPI METRICS
// ==========================================
app.get('/api/dashboard/summary', (req, res) => {
  try {
    const settings = db.prepare('SELECT currency_symbol FROM settings WHERE id = 1').get() || { currency_symbol: '$' };

    // Total products & stock calculations
    const stockStats = db.prepare(`
      SELECT 
        COUNT(*) as total_products,
        COALESCE(SUM(current_stock), 0) as total_units,
        COALESCE(SUM(current_stock * cost_price), 0) as total_inventory_cost,
        COALESCE(SUM(current_stock * selling_price), 0) as total_inventory_retail,
        COALESCE(SUM(CASE WHEN current_stock <= min_stock_alert THEN 1 ELSE 0 END), 0) as low_stock_count,
        COALESCE(SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END), 0) as out_of_stock_count
      FROM products
      WHERE status = 'active'
    `).get();

    // Invoice and revenue stats
    const invoiceStats = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paid ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'pending' OR status = 'overdue' THEN (total_amount - amount_paid) ELSE 0 END), 0) as outstanding_receivables,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_invoices_count
      FROM invoices
    `).get();

    // Customer count
    const customerStats = db.prepare('SELECT COUNT(*) as total_customers FROM customers').get();

    // Category distribution breakdown
    const categoryDistribution = db.prepare(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        COUNT(p.id) as product_count,
        COALESCE(SUM(p.current_stock), 0) as total_units,
        COALESCE(SUM(p.current_stock * p.selling_price), 0) as total_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'active'
      GROUP BY c.name
      ORDER BY total_value DESC
    `).all();

    // Gross profit and margin calculations
    const profitStats = db.prepare(`
      SELECT 
        COALESCE(SUM(ii.quantity * ii.unit_price), 0) as total_revenue,
        COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0) as total_cogs
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE i.status != 'cancelled'
    `).get();

    const grossProfit = Math.round((profitStats.total_revenue - profitStats.total_cogs) * 100) / 100;
    const profitMargin = profitStats.total_revenue > 0 
      ? Math.round(((grossProfit / profitStats.total_revenue) * 100) * 10) / 10 
      : 0;

    // Sales Trend (recent days/invoices)
    const salesTrend = db.prepare(`
      SELECT 
        invoice_date,
        COUNT(*) as invoice_count,
        SUM(total_amount) as daily_total
      FROM invoices
      WHERE status != 'cancelled'
      GROUP BY invoice_date
      ORDER BY invoice_date ASC
      LIMIT 14
    `).all();

    // Low stock items list (for immediate action)
    const lowStockItems = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.current_stock <= p.min_stock_alert AND p.status = 'active'
      ORDER BY p.current_stock ASC
      LIMIT 6
    `).all();

    // Top selling items
    const topSelling = db.prepare(`
      SELECT 
        ii.product_id,
        ii.product_name,
        ii.sku,
        SUM(ii.quantity) as total_sold,
        SUM(ii.total) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status != 'cancelled'
      GROUP BY ii.product_id, ii.product_name, ii.sku
      ORDER BY total_sold DESC
      LIMIT 5
    `).all();

    // Recent 5 invoices
    const recentInvoices = db.prepare(`
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 5
    `).all();

    // Recent 5 inventory movements
    const recentMovements = db.prepare(`
      SELECT t.*, p.name as product_name, p.sku
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      ORDER BY t.created_at DESC
      LIMIT 5
    `).all();

    res.json(cleanData({
      currency_symbol: settings.currency_symbol,
      stats: {
        ...stockStats,
        ...invoiceStats,
        ...customerStats,
        gross_profit: grossProfit,
        profit_margin: profitMargin,
        total_cogs: profitStats.total_cogs
      },
      categoryDistribution,
      salesTrend,
      lowStockItems,
      topSelling,
      recentInvoices,
      recentMovements
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. CATEGORIES ENDPOINTS
// ==========================================
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    res.json(cleanData(categories));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const stmt = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
    const result = stmt.run(name.trim(), description || '');
    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json(cleanData(created));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. PRODUCTS & INVENTORY ENDPOINTS
// ==========================================
app.get('/api/products', (req, res) => {
  try {
    const { search, category_id, filter, sort } = req.query;
    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (category_id) {
      query += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (filter === 'low_stock') {
      query += ` AND p.current_stock <= p.min_stock_alert AND p.current_stock > 0`;
    } else if (filter === 'out_of_stock') {
      query += ` AND p.current_stock = 0`;
    } else if (filter === 'active') {
      query += ` AND p.status = 'active'`;
    }

    if (sort === 'stock_asc') {
      query += ` ORDER BY p.current_stock ASC`;
    } else if (sort === 'stock_desc') {
      query += ` ORDER BY p.current_stock DESC`;
    } else if (sort === 'price_desc') {
      query += ` ORDER BY p.selling_price DESC`;
    } else {
      query += ` ORDER BY p.created_at DESC`;
    }

    const rows = db.prepare(query).all(...params);
    res.json(cleanData(rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get product transaction history
    const transactions = db.prepare(`
      SELECT * FROM inventory_transactions
      WHERE product_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(req.params.id);

    // Get product sales performance
    const salesStats = db.prepare(`
      SELECT 
        COALESCE(SUM(quantity), 0) as total_sold,
        COALESCE(SUM(total), 0) as total_revenue
      FROM invoice_items
      WHERE product_id = ?
    `).get(req.params.id);

    res.json(cleanData({ product, transactions, salesStats }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dedicated Fast Stock Checker Lookup (Exact Barcode / SKU or Keyword)
app.get('/api/products/check-stock/:query', (req, res) => {
  try {
    const q = req.params.query ? req.params.query.trim() : '';
    if (!q) {
      return res.status(400).json({ error: 'Search query or barcode is required' });
    }

    // Check exact barcode or SKU first
    const exact = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE LOWER(p.sku) = LOWER(?) OR LOWER(p.barcode) = LOWER(?)
    `).get(q, q);

    if (exact) {
      return res.json(cleanData({ match: 'exact', products: [exact] }));
    }

    // Fallback to substring search
    const partials = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?
      ORDER BY p.name ASC
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);

    res.json(cleanData({ match: 'partial', products: partials }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    let { sku, barcode, name, description, category_id, cost_price, selling_price, current_stock, min_stock_alert, unit } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    // Auto-generate SKU if not provided
    if (!sku || !sku.trim()) {
      const count = db.prepare('SELECT COUNT(*) as count FROM products').get().count + 1;
      sku = 'SKU-' + String(1000 + count);
    } else {
      sku = sku.trim().toUpperCase();
    }

    cost_price = Number(cost_price) || 0;
    selling_price = Number(selling_price) || 0;
    current_stock = Number(current_stock) || 0;
    min_stock_alert = Number(min_stock_alert) || 5;
    unit = (unit && unit.trim()) || 'pcs';

    const insertStmt = db.prepare(`
      INSERT INTO products (sku, barcode, name, description, category_id, cost_price, selling_price, current_stock, min_stock_alert, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      sku, barcode || null, name.trim(), description || '',
      category_id ? Number(category_id) : null,
      cost_price, selling_price, current_stock, min_stock_alert, unit
    );

    const newId = Number(result.lastInsertRowid);

    // Record initial inventory movement if stock > 0
    if (current_stock > 0) {
      db.prepare(`
        INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, reference_id, notes)
        VALUES (?, 'initial', ?, 0, ?, 'NEW-PRODUCT', 'Initial stock entry upon creation')
      `).run(newId, current_stock, current_stock);
    }

    const created = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(newId);

    res.status(201).json(cleanData(created));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { sku, barcode, name, description, category_id, cost_price, selling_price, min_stock_alert, unit, status } = req.body;
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.prepare(`
      UPDATE products SET
        sku = ?, barcode = ?, name = ?, description = ?, category_id = ?,
        cost_price = ?, selling_price = ?, min_stock_alert = ?, unit = ?,
        status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      sku || existing.sku, barcode || existing.barcode, name || existing.name,
      description !== undefined ? description : existing.description,
      category_id !== undefined ? (category_id ? Number(category_id) : null) : existing.category_id,
      cost_price !== undefined ? Number(cost_price) : existing.cost_price,
      selling_price !== undefined ? Number(selling_price) : existing.selling_price,
      min_stock_alert !== undefined ? Number(min_stock_alert) : existing.min_stock_alert,
      unit || existing.unit, status || existing.status, id
    );

    const updated = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(id);

    res.json(cleanData(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const id = req.params.id;
    // Check if product is in invoices
    const usedInInvoices = db.prepare('SELECT COUNT(*) as count FROM invoice_items WHERE product_id = ?').get(id).count;
    if (usedInInvoices > 0) {
      // Soft delete by marking inactive to preserve historical records
      db.prepare("UPDATE products SET status = 'inactive' WHERE id = ?").run(id);
      return res.json({ message: 'Product has invoice history, marked as inactive to protect transaction integrity' });
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick stock adjustment (e.g., physical count recount, manual in/out)
app.post('/api/products/:id/adjust-stock', (req, res) => {
  try {
    const id = req.params.id;
    const { adjustment_type, quantity, reason } = req.body;
    const qty = Number(quantity);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Valid positive quantity required' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let newStock = product.current_stock;
    let qtyChange = 0;

    if (adjustment_type === 'add' || adjustment_type === 'purchase') {
      qtyChange = qty;
      newStock += qty;
    } else if (adjustment_type === 'subtract' || adjustment_type === 'damage') {
      qtyChange = -qty;
      newStock = Math.max(0, newStock - qty);
    } else if (adjustment_type === 'set') {
      qtyChange = qty - product.current_stock;
      newStock = qty;
    } else {
      return res.status(400).json({ error: 'Invalid adjustment type' });
    }

    // Update product stock
    db.prepare('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStock, id);

    // Record transaction
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, reference_id, notes)
      VALUES (?, 'adjustment', ?, ?, ?, 'MANUAL-ADJUST', ?)
    `).run(id, qtyChange, product.current_stock, newStock, reason || 'Manual stock adjustment');

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(cleanData({
      product: updated,
      previous_stock: product.current_stock,
      new_stock: newStock,
      message: `Stock updated successfully from ${product.current_stock} to ${newStock}`
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. CUSTOMERS ENDPOINTS
// ==========================================
app.get('/api/customers', (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers';
    const params = [];
    if (search && search.trim()) {
      query += ' WHERE name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    query += ' ORDER BY name ASC';
    const rows = db.prepare(query).all(...params);
    res.json(cleanData(rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const invoices = db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY invoice_date DESC').all(req.params.id);
    res.json(cleanData({ customer, invoices }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const { name, company, email, phone, tax_id, billing_address, shipping_address, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    const result = db.prepare(`
      INSERT INTO customers (name, company, email, phone, tax_id, billing_address, shipping_address, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(), company || '', email || '', phone || '',
      tax_id || '', billing_address || '', shipping_address || '', notes || ''
    );
    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json(cleanData(created));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/customers/:id', (req, res) => {
  try {
    const { name, company, email, phone, tax_id, billing_address, shipping_address, notes } = req.body;
    const id = req.params.id;
    db.prepare(`
      UPDATE customers SET
        name = ?, company = ?, email = ?, phone = ?, tax_id = ?,
        billing_address = ?, shipping_address = ?, notes = ?
      WHERE id = ?
    `).run(
      name, company || '', email || '', phone || '',
      tax_id || '', billing_address || '', shipping_address || '', notes || '', id
    );
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json(cleanData(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. INVOICES & AUTOMATED BILLING WORKFLOW
// ==========================================
app.get('/api/invoices/next-number', (req, res) => {
  try {
    const settings = db.prepare('SELECT invoice_prefix FROM settings WHERE id = 1').get() || { invoice_prefix: 'INV-' };
    const currentYear = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count + 1;
    const nextNumber = `${settings.invoice_prefix}${currentYear}-${String(count).padStart(4, '0')}`;
    res.json({ next_number: nextNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices', (req, res) => {
  try {
    const { search, status, from_date, to_date } = req.query;
    let query = 'SELECT * FROM invoices WHERE 1=1';
    const params = [];

    if (search && search.trim()) {
      query += ' AND (invoice_number LIKE ? OR customer_name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (from_date) {
      query += ' AND invoice_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND invoice_date <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY created_at DESC';
    const invoices = db.prepare(query).all(...params);
    res.json(cleanData(invoices));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    res.json(cleanData({
      invoice,
      items,
      company: settings
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CORE AUTOMATION: CREATE INVOICE + AUTO-CALCULATE + AUTO-DEDUCT INVENTORY
app.post('/api/invoices', (req, res) => {
  try {
    const {
      invoice_number,
      customer_id,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      customer_tax_id,
      invoice_date,
      due_date,
      status,
      items, // array of { product_id, product_name, sku, unit, quantity, unit_price, discount }
      tax_rate,
      discount_amount,
      amount_paid,
      payment_method,
      notes
    } = req.body;

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    // Generate invoice number if not passed
    let finalInvNum = invoice_number;
    if (!finalInvNum || !finalInvNum.trim()) {
      const settings = db.prepare('SELECT invoice_prefix FROM settings WHERE id = 1').get() || { invoice_prefix: 'INV-' };
      const currentYear = new Date().getFullYear();
      const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count + 1;
      finalInvNum = `${settings.invoice_prefix}${currentYear}-${String(count).padStart(4, '0')}`;
    }

    // Verify stock availability for items with product_id
    const stockErrors = [];
    for (const item of items) {
      if (item.product_id) {
        const prod = db.prepare('SELECT id, name, current_stock FROM products WHERE id = ?').get(item.product_id);
        if (prod && prod.current_stock < Number(item.quantity)) {
          stockErrors.push(`"${prod.name}" only has ${prod.current_stock} in stock (requested ${item.quantity})`);
        }
      }
    }

    // If override_stock_warning is not set and there are stock issues, send warning
    if (stockErrors.length > 0 && !req.body.allow_negative_stock) {
      return res.status(400).json({
        error: 'Stock Shortage Warning: ' + stockErrors.join('; '),
        shortages: stockErrors,
        can_override: true
      });
    }

    // Calculate line items and subtotal
    let subtotal = 0;
    const computedItems = items.map(item => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;
      const itemDisc = Number(item.discount) || 0;
      const lineTotal = Math.max(0, (qty * price) - itemDisc);
      subtotal += lineTotal;
      return {
        product_id: item.product_id ? Number(item.product_id) : null,
        product_name: item.product_name,
        sku: item.sku || '',
        unit: item.unit || 'pcs',
        quantity: qty,
        unit_price: price,
        discount: itemDisc,
        total: Math.round(lineTotal * 100) / 100
      };
    });

    const parsedTaxRate = Number(tax_rate) >= 0 ? Number(tax_rate) : 0;
    const parsedDiscount = Number(discount_amount) || 0;
    const taxableAmount = Math.max(0, subtotal - parsedDiscount);
    const taxAmount = Math.round((taxableAmount * (parsedTaxRate / 100)) * 100) / 100;
    const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;
    const paid = status === 'paid' ? totalAmount : (Number(amount_paid) || 0);

    // Save Invoice Record
    const insertInv = db.prepare(`
      INSERT INTO invoices (
        invoice_number, customer_id, customer_name, customer_email, customer_phone,
        customer_address, customer_tax_id, invoice_date, due_date, status,
        subtotal, tax_rate, tax_amount, discount_amount, total_amount,
        amount_paid, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const invResult = insertInv.run(
      finalInvNum,
      customer_id ? Number(customer_id) : null,
      customer_name.trim(),
      customer_email || '',
      customer_phone || '',
      customer_address || '',
      customer_tax_id || '',
      invoice_date || new Date().toISOString().split('T')[0],
      due_date || new Date().toISOString().split('T')[0],
      status || (paid >= totalAmount ? 'paid' : 'pending'),
      subtotal,
      parsedTaxRate,
      taxAmount,
      parsedDiscount,
      totalAmount,
      paid,
      payment_method || 'cash',
      notes || ''
    );

    const invoiceId = Number(invResult.lastInsertRowid);

    // Insert Invoice Items and AUTOMATICALLY DEDUCT INVENTORY
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, product_id, product_name, sku, unit, quantity, unit_price, discount, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateProductStock = db.prepare(`
      UPDATE products SET 
        current_stock = current_stock - ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const recordMovement = db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, transaction_type, quantity_change, previous_stock, new_stock, reference_id, notes
      ) VALUES (?, 'sale', ?, ?, ?, ?, ?)
    `);

    for (const item of computedItems) {
      insertItem.run(
        invoiceId,
        item.product_id,
        item.product_name,
        item.sku,
        item.unit,
        item.quantity,
        item.unit_price,
        item.discount,
        item.total
      );

      // Auto-deduct inventory if product exists in catalog
      if (item.product_id) {
        const prod = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(item.product_id);
        if (prod) {
          const prevStock = prod.current_stock;
          const newStock = prevStock - item.quantity;
          updateProductStock.run(item.quantity, item.product_id);
          recordMovement.run(
            item.product_id,
            -item.quantity,
            prevStock,
            newStock,
            finalInvNum,
            `Automated deduction for Invoice ${finalInvNum}`
          );
        }
      }
    }

    // Update customer outstanding balance if not fully paid
    if (customer_id && paid < totalAmount) {
      const unpaidBalance = totalAmount - paid;
      db.prepare(`
        UPDATE customers SET outstanding_balance = outstanding_balance + ? WHERE id = ?
      `).run(unpaidBalance, customer_id);
    }

    const createdInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);

    res.status(201).json(cleanData({
      invoice: createdInvoice,
      items: invoiceItems,
      message: `Invoice ${finalInvNum} created successfully and inventory automatically deducted!`
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/invoices/:id/status', (req, res) => {
  try {
    const id = req.params.id;
    const { status, amount_paid } = req.body;
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    let finalPaid = invoice.amount_paid;
    if (status === 'paid') {
      finalPaid = invoice.total_amount;
    } else if (amount_paid !== undefined) {
      finalPaid = Number(amount_paid);
    }

    db.prepare('UPDATE invoices SET status = ?, amount_paid = ? WHERE id = ?').run(status, finalPaid, id);
    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    res.json(cleanData(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. INVENTORY AUDIT LOG / TRANSACTIONS
// ==========================================
app.get('/api/transactions', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as product_name, p.sku, p.unit
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all();
    res.json(cleanData(rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 8. BULK IMPORT & EXPORT (EXCEL / CSV)
// ==========================================
// Helper for Excel/CSV file generation
function sendSpreadsheetResponse(res, data, sheetName, defaultFilename, format) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const isCsv = format && format.toLowerCase() === 'csv';
  if (isCsv) {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader('Content-Disposition', `attachment; filename="${defaultFilename}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvContent);
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${defaultFilename}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buffer);
}

// Export Products Catalog
app.get('/api/export/products', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        p.sku as "SKU",
        p.barcode as "Barcode",
        p.name as "Product Name",
        c.name as "Category",
        p.cost_price as "Cost Price",
        p.selling_price as "Selling Price",
        p.current_stock as "Current Stock",
        p.min_stock_alert as "Min Stock Alert",
        p.unit as "Unit",
        p.status as "Status"
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.name ASC
    `).all();

    sendSpreadsheetResponse(res, rows, 'Products_Inventory', 'FlowStock_Products_Catalog', req.query.format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export Invoices Register
app.get('/api/export/invoices', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        invoice_number as "Invoice Number",
        customer_name as "Customer Name",
        invoice_date as "Invoice Date",
        due_date as "Due Date",
        status as "Status",
        payment_method as "Payment Method",
        subtotal as "Subtotal",
        tax_rate as "Tax Rate %",
        tax_amount as "Tax Amount",
        discount_amount as "Discount",
        total_amount as "Total Amount",
        amount_paid as "Amount Paid"
      FROM invoices
      ORDER BY created_at DESC
    `).all();

    sendSpreadsheetResponse(res, rows, 'Invoices_Register', 'FlowStock_Invoices_Register', req.query.format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export Customers Directory
app.get('/api/export/customers', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        name as "Customer Name",
        company as "Company",
        email as "Email",
        phone as "Phone",
        tax_id as "Tax ID / EIN",
        billing_address as "Billing Address",
        shipping_address as "Shipping Address",
        outstanding_balance as "Outstanding Balance",
        notes as "Notes",
        created_at as "Created Date"
      FROM customers
      ORDER BY name ASC
    `).all();

    sendSpreadsheetResponse(res, rows, 'Customers_Directory', 'FlowStock_Customers_Directory', req.query.format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export Inventory Audit Trail
app.get('/api/export/audit-log', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        t.created_at as "Timestamp",
        p.name as "Product Name",
        p.sku as "SKU",
        t.transaction_type as "Transaction Type",
        t.quantity_change as "Quantity Change",
        p.unit as "Unit",
        t.previous_stock as "Previous Stock",
        t.new_stock as "New Stock",
        t.reference_id as "Reference ID",
        t.notes as "Notes"
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      ORDER BY t.created_at DESC
    `).all();

    sendSpreadsheetResponse(res, rows, 'Stock_Audit_Log', 'FlowStock_Stock_Audit_Log', req.query.format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download sample Excel template for bulk product import
app.get('/api/export/template/products', (req, res) => {
  try {
    const sampleData = [
      {
        "SKU": "SKU-2001",
        "Barcode": "890987654321",
        "Product Name": "Sample Wireless Mouse",
        "Category": "Computer Hardware",
        "Cost Price": 15.00,
        "Selling Price": 34.99,
        "Current Stock": 50,
        "Min Stock Alert": 10,
        "Unit": "pcs"
      },
      {
        "SKU": "SKU-2002",
        "Barcode": "890987654322",
        "Product Name": "Sample 4K HDMI Cable",
        "Category": "Cables & Networking",
        "Cost Price": 4.50,
        "Selling Price": 14.99,
        "Current Stock": 120,
        "Min Stock Alert": 25,
        "Unit": "pcs"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template_Products');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Product_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Import Products from Excel / CSV
app.post('/api/import/products', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx/.xls) or CSV file' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file contains no rows' });
    }

    let insertedCount = 0;
    let updatedCount = 0;

    const findCat = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)');
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const findProduct = db.prepare('SELECT id, current_stock FROM products WHERE sku = ? OR (barcode = ? AND barcode IS NOT NULL)');
    const insertProd = db.prepare(`
      INSERT INTO products (sku, barcode, name, description, category_id, cost_price, selling_price, current_stock, min_stock_alert, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateProd = db.prepare(`
      UPDATE products SET
        name = ?, cost_price = ?, selling_price = ?, current_stock = ?, min_stock_alert = ?, unit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const row of rows) {
      // Map possible header names
      const name = row['Product Name'] || row['name'] || row['Name'] || row['Item Name'];
      if (!name) continue;

      let sku = row['SKU'] || row['sku'] || row['Item Code'];
      const barcode = row['Barcode'] || row['barcode'] || row['UPC'] || null;
      const catName = row['Category'] || row['category'];
      const costPrice = Number(row['Cost Price'] || row['cost_price'] || row['Cost'] || 0);
      const sellingPrice = Number(row['Selling Price'] || row['selling_price'] || row['Price'] || 0);
      const stock = Number(row['Current Stock'] || row['current_stock'] || row['Stock'] || row['Quantity'] || 0);
      const minAlert = Number(row['Min Stock Alert'] || row['min_stock_alert'] || row['Alert'] || 5);
      const unit = row['Unit'] || row['unit'] || 'pcs';

      if (!sku) {
        sku = 'SKU-' + Math.floor(100000 + Math.random() * 900000);
      }

      // Handle category
      let categoryId = null;
      if (catName && catName.trim()) {
        const catRow = findCat.get(catName.trim());
        if (catRow) {
          categoryId = catRow.id;
        } else {
          const newCat = insertCat.run(catName.trim());
          categoryId = Number(newCat.lastInsertRowid);
        }
      }

      // Check if product exists by SKU or Barcode
      const existing = findProduct.get(sku, barcode);
      if (existing) {
        updateProd.run(name, costPrice, sellingPrice, stock, minAlert, unit, existing.id);
        updatedCount++;
      } else {
        const res = insertProd.run(sku, barcode, name, '', categoryId, costPrice, sellingPrice, stock, minAlert, unit);
        const newId = Number(res.lastInsertRowid);
        if (stock > 0) {
          db.prepare(`
            INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, reference_id, notes)
            VALUES (?, 'initial', ?, 0, ?, 'EXCEL-IMPORT', 'Bulk spreadsheet import')
          `).run(newId, stock, stock);
        }
        insertedCount++;
      }
    }

    res.json({
      message: `Bulk import completed! ${insertedCount} new products added, ${updatedCount} products updated.`,
      inserted: insertedCount,
      updated: updatedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, () => {
  console.log(`FlowStock ERP & Invoicing Server running at http://localhost:${PORT}`);
});
