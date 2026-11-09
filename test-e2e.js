/**
 * FlowStock ERP - Comprehensive Automated End-to-End Test Suite
 * Tests all core workflows: stock checking, barcode scanning,
 * stock adjustments, automated invoicing stock deductions, audit logging, and exports.
 */

const BASE_URL = 'http://localhost:3000';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING FLOWSTOCK ERP AUTOMATED SYSTEM TEST SUITE');
  console.log('======================================================\n');

  try {
    // ----------------------------------------------------------------
    // TEST 1: Server Health & Static SPA Frontend Delivery
    // ----------------------------------------------------------------
    console.log('▶ TEST SUITE 1: Server Health & Frontend Assets');
    const rootRes = await request('/');
    assert(rootRes.status === 200, 'Frontend index.html loads with HTTP 200');
    assert(typeof rootRes.data === 'string' && rootRes.data.includes('FlowStock'), 'Frontend contains FlowStock branding');
    assert(rootRes.data.includes('view-stock-checker'), 'Frontend contains Real-Time Stock Checker view');
    assert(rootRes.data.includes('quickStockModal'), 'Frontend contains Global Ctrl+K Stock Check modal');
    assert(rootRes.data.includes('stockInspectModal'), 'Frontend contains Product Stock Inspector modal');

    // ----------------------------------------------------------------
    // TEST 2: Executive Dashboard Metrics API
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 2: Dashboard & Inventory Valuation API');
    const dashRes = await request('/api/dashboard/summary');
    assert(dashRes.status === 200, 'Dashboard summary returns HTTP 200');
    const stats = dashRes.data.stats;
    assert(stats && typeof stats.total_products === 'number', 'Summary contains total_products count', `Found: ${stats.total_products}`);
    assert(typeof stats.total_units === 'number', 'Summary contains total_units count', `Found: ${stats.total_units}`);
    assert(typeof stats.low_stock_count === 'number', 'Summary contains low_stock_count', `Found: ${stats.low_stock_count}`);
    assert(Array.isArray(dashRes.data.lowStockItems), 'Summary includes lowStockItems array');

    // ----------------------------------------------------------------
    // TEST 3: Dedicated Real-Time Stock Checker Endpoint
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 3: Real-Time Stock Checker & Barcode Lookup');
    
    // Test 3.1: Exact SKU lookup
    const skuRes = await request('/api/products/check-stock/SKU-1001');
    assert(skuRes.status === 200, 'Check stock by SKU-1001 returns HTTP 200');
    assert(skuRes.data.match === 'exact', 'SKU lookup returns exact match');
    assert(skuRes.data.products[0].sku === 'SKU-1001', 'Matched product SKU is SKU-1001');
    const p1 = skuRes.data.products[0];
    assert(typeof p1.current_stock === 'number', `Current stock for SKU-1001 is a valid number: ${p1.current_stock}`);

    // Test 3.2: Exact Barcode lookup
    const barcodeRes = await request('/api/products/check-stock/890123456708');
    assert(barcodeRes.status === 200, 'Check stock by barcode returns HTTP 200');
    assert(barcodeRes.data.match === 'exact', 'Barcode lookup returns exact match');
    assert(barcodeRes.data.products[0].barcode === '890123456708', 'Matched barcode is 890123456708');

    // Test 3.3: Partial keyword query
    const searchRes = await request('/api/products/check-stock/Headphones');
    assert(searchRes.status === 200, 'Check stock by keyword "Headphones" returns HTTP 200');
    assert(searchRes.data.products.length >= 1, 'Search returns at least 1 matching headphone product');

    // ----------------------------------------------------------------
    // TEST 4: Deep Product Stock Inspection API
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 4: Deep Product Stock Inspector & Audit Ledger');
    const inspectRes = await request('/api/products/1');
    assert(inspectRes.status === 200, 'Inspect product #1 returns HTTP 200');
    assert(inspectRes.data.product && inspectRes.data.product.id === 1, 'Product payload includes complete product details');
    assert(Array.isArray(inspectRes.data.transactions), 'Product inspection returns transaction history ledger');
    assert(inspectRes.data.salesStats && typeof inspectRes.data.salesStats.total_sold === 'number', 'Product returns historical total_sold count');

    // ----------------------------------------------------------------
    // TEST 5: Stock Adjustment Workflow (Add, Deduct, Recount)
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 5: Stock Adjustment & Audit Trail Logging');
    const initialProduct = (await request('/api/products/1')).data.product;
    const initialStock = initialProduct.current_stock;

    // 5.1: Add stock (+10 restock)
    const addRes = await request('/api/products/1/adjust-stock', {
      method: 'POST',
      body: JSON.stringify({
        adjustment_type: 'add',
        quantity: 10,
        reason: 'Automated Test Shipment Arrival'
      })
    });
    assert(addRes.status === 200, 'Stock adjustment "add" returns HTTP 200');
    assert(addRes.data.new_stock === initialStock + 10, `Stock increased accurately: was ${initialStock}, now ${addRes.data.new_stock}`);

    // 5.2: Deduct stock (-5 write-off)
    const subRes = await request('/api/products/1/adjust-stock', {
      method: 'POST',
      body: JSON.stringify({
        adjustment_type: 'subtract',
        quantity: 5,
        reason: 'Automated Test Sample Write-off'
      })
    });
    assert(subRes.status === 200, 'Stock adjustment "subtract" returns HTTP 200');
    assert(subRes.data.new_stock === initialStock + 5, `Stock decreased accurately: now ${subRes.data.new_stock}`);

    // 5.3: Verify audit log recorded both transactions
    const auditRes = await request('/api/transactions');
    assert(auditRes.status === 200, 'Transactions audit trail returns HTTP 200');
    const recentLogs = auditRes.data.slice(0, 2);
    assert(recentLogs.some(log => log.notes === 'Automated Test Shipment Arrival'), 'Audit log records shipment reason');
    assert(recentLogs.some(log => log.notes === 'Automated Test Sample Write-off'), 'Audit log records write-off reason');

    // ----------------------------------------------------------------
    // TEST 6: Invoicing & Automatic Stock Deduction
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 6: Automated Invoicing & Inventory Synchronous Deduction');

    // 6.1: Check stock before invoicing
    const stockBefore = (await request('/api/products/1')).data.product.current_stock;

    // 6.2: Attempt invoicing with excessive quantity to test shortage prevention
    const failInvRes = await request('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: 'Test Excess Buyer',
        items: [{
          product_id: 1,
          product_name: 'ProSonic ANC Wireless Headphones',
          sku: 'SKU-1001',
          quantity: stockBefore + 9999, // Exceeds available stock
          unit_price: 249.99
        }]
      })
    });
    assert(failInvRes.status === 400, 'Prevented invoice creation when stock was insufficient (HTTP 400)');
    assert(failInvRes.data.can_override === true, 'Response offers explicit stock shortage warning');

    // 6.3: Create valid invoice ordering exactly 2 units
    const invoiceOrderQty = 2;
    const invRes = await request('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: 'Acme Test Corp',
        customer_email: 'billing@acme.com',
        customer_phone: '+1 555-0199',
        status: 'paid',
        items: [{
          product_id: 1,
          product_name: 'ProSonic ANC Wireless Headphones',
          sku: 'SKU-1001',
          unit: 'pcs',
          quantity: invoiceOrderQty,
          unit_price: 249.99
        }],
        tax_rate: 8.5
      })
    });

    assert(invRes.status === 201, 'Valid invoice created successfully with HTTP 201');
    const createdInvoice = invRes.data.invoice;
    assert(createdInvoice && createdInvoice.invoice_number, `Invoice generated with number: ${createdInvoice.invoice_number}`);

    // 6.4: Verify stock was AUTOMATICALLY deducted by exactly 2 units
    const stockAfter = (await request('/api/products/1')).data.product.current_stock;
    assert(stockAfter === stockBefore - invoiceOrderQty, `Inventory automatically deducted: was ${stockBefore}, now ${stockAfter}`);

    // 6.5: Verify invoice shows up in recent invoices
    const allInvoices = await request('/api/invoices');
    assert(allInvoices.status === 200, 'Invoices register loads successfully');
    assert(allInvoices.data.some(i => i.id === createdInvoice.id), 'Newly created invoice exists in Invoices register');

    // ----------------------------------------------------------------
    // TEST 7: Customer Management API
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 7: Customer Management');
    const custCreateRes = await request('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Samantha Reed',
        company: 'Reed Logistics Group',
        email: 'samantha@reedlogistics.com',
        phone: '+1 555-9821',
        billing_address: '500 Harbor Dr, Seattle, WA 98101'
      })
    });
    assert(custCreateRes.status === 201, 'Customer created with HTTP 201');
    const custId = custCreateRes.data.id;

    const custGetRes = await request(`/api/customers/${custId}`);
    assert(custGetRes.status === 200, 'Customer retrieved with HTTP 200');
    assert(custGetRes.data.customer.company === 'Reed Logistics Group', 'Customer details match creation payload');

    // ----------------------------------------------------------------
    // TEST 8: Spreadsheet Export Services
    // ----------------------------------------------------------------
    console.log('\n▶ TEST SUITE 8: Bulk Excel & Template Exports');
    const exportProdRes = await request('/api/export/products');
    assert(exportProdRes.status === 200, 'Export products (.xlsx) returns HTTP 200');
    assert(exportProdRes.headers.get('content-type').includes('spreadsheetml'), 'Export products has valid Excel spreadsheet content-type');

    const templateRes = await request('/api/export/template/products');
    assert(templateRes.status === 200, 'Sample product import template (.xlsx) returns HTTP 200');

    console.log('\n======================================================');
    console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================\n');

    if (failedTests === 0) {
      console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! SYSTEM IS 100% OPERATIONAL.\n');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('💥 Test execution error:', err);
    process.exitCode = 1;
  }
}

runTests();
