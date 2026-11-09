/**
 * FlowStock ERP - Automated Invoicing & Point of Sale (POS) Engine
 */

const Invoices = {
  currentItems: [], // array of { product_id, product_name, sku, unit, quantity, unit_price, discount, current_stock }
  allProducts: [],
  allCustomers: [],
  cachedInvoices: [],

  async initForm() {
    try {
      // Set default dates
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invDateEl = document.getElementById('invoiceDate');
      const invDueEl = document.getElementById('invoiceDueDate');
      if (invDateEl) invDateEl.value = today;
      if (invDueEl) invDueEl.value = dueDate.toISOString().split('T')[0];

      // Fetch next sequential invoice number
      const nextNumRes = await App.api('/api/invoices/next-number');
      document.getElementById('posAutoInvNum').textContent = nextNumRes.next_number;

      // Set default tax rate from settings
      if (App.state.settings && App.state.settings.default_tax_rate !== undefined) {
        document.getElementById('posTaxRateInput').value = App.state.settings.default_tax_rate;
      }

      // Preload products & customers for rapid auto-complete
      const [prods, custs] = await Promise.all([
        App.api('/api/products?filter=active'),
        App.api('/api/customers')
      ]);

      this.allProducts = prods;
      this.allCustomers = custs;

      this.populateCustomerSelect();
      this.setupProductSearchAutoFill();

      // Clear or render initial items
      if (this.currentItems.length === 0) {
        this.renderItemsTable();
      }
      this.recalculateTotals();
    } catch (err) {
      console.error('Failed to initialize invoice form:', err);
    }
  },

  populateCustomerSelect() {
    const sel = document.getElementById('invoiceCustomerSelect');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- Choose Existing Customer or Walk-in --</option>';
    this.allCustomers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      const comp = c.company ? ` (${c.company})` : '';
      opt.textContent = `${c.name}${comp}`;
      sel.appendChild(opt);
    });
  },

  handleCustomerSelect(customerId) {
    const detailsEl = document.getElementById('posSelectedCustomerDetails');
    const walkinGroup = document.getElementById('posWalkinGroup');
    if (!customerId) {
      if (detailsEl) detailsEl.style.display = 'none';
      if (walkinGroup) walkinGroup.style.display = 'block';
      return;
    }
    const cust = this.allCustomers.find(c => String(c.id) === String(customerId));
    if (cust) {
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 2px;">
            <i class="fa-solid fa-user-check" style="color: var(--accent-emerald);"></i> ${App.escapeHtml(cust.name)} ${cust.company ? `<span style="color: var(--text-muted); font-weight: normal;">(${App.escapeHtml(cust.company)})</span>` : ''}
          </div>
          <div style="color: var(--text-muted); font-size: 0.78rem;">
            ${cust.email ? `<span><i class="fa-solid fa-envelope"></i> ${App.escapeHtml(cust.email)}</span> &bull; ` : ''}
            ${cust.phone ? `<span><i class="fa-solid fa-phone"></i> ${App.escapeHtml(cust.phone)}</span> &bull; ` : ''}
            ${cust.tax_id ? `<span>Tax ID: ${App.escapeHtml(cust.tax_id)}</span>` : ''}
          </div>
          ${cust.billing_address ? `<div style="color: var(--text-dim); font-size: 0.76rem; margin-top: 2px;"><i class="fa-solid fa-location-dot"></i> ${App.escapeHtml(cust.billing_address)}</div>` : ''}
        `;
        detailsEl.style.display = 'block';
      }
      if (walkinGroup) walkinGroup.style.display = 'none';
      App.showToast(`Selected client: ${cust.name}`, 'info');
    }
  },

  // Rapid Barcode / SKU Auto-Fill Search
  setupProductSearchAutoFill() {
    const searchInput = document.getElementById('posProductSearchInput');
    const dropdown = document.getElementById('posQuickSearchResults');
    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        dropdown.style.display = 'none';
        return;
      }

      // Direct exact match on Barcode or SKU (e.g. barcode scanner input + Enter)
      const exactMatch = this.allProducts.find(p => 
        (p.barcode && p.barcode.toLowerCase() === query) ||
        (p.sku && p.sku.toLowerCase() === query)
      );

      const matches = this.allProducts.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
      ).slice(0, 6);

      if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 12px; font-size: 0.82rem; color: var(--text-dim); text-align: center;">No catalog item matches "${query}"</div>`;
        dropdown.style.display = 'block';
        return;
      }

      dropdown.innerHTML = matches.map(p => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.15s;"
             onmouseover="this.style.background='rgba(255,255,255,0.06)'"
             onmouseout="this.style.background='transparent'"
             onclick="Invoices.addProductToInvoice(${p.id})">
          <div>
            <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-main);">${App.escapeHtml(p.name)}</div>
            <span class="sku-badge">${App.escapeHtml(p.sku)}</span>
            <span style="font-size: 0.78rem; color: var(--text-dim); margin-left: 6px;">Available: ${p.current_stock} ${p.unit}</span>
          </div>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald);">
            ${App.formatCurrency(p.selling_price)}
          </div>
        </div>
      `).join('');

      dropdown.style.display = 'block';
    });

    // Handle Enter key for fast barcode scanners
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.quickAddFirstMatch();
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  },

  quickAddFirstMatch() {
    const searchInput = document.getElementById('posProductSearchInput');
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;

    const match = this.allProducts.find(p =>
      (p.barcode && p.barcode.toLowerCase() === query) ||
      (p.sku && p.sku.toLowerCase() === query) ||
      p.name.toLowerCase().includes(query)
    );

    if (match) {
      this.addProductToInvoice(match.id);
      searchInput.value = '';
      document.getElementById('posQuickSearchResults').style.display = 'none';
    } else {
      App.showToast(`No product matching "${query}"`, 'error');
    }
  },

  addProductToInvoice(productId) {
    const prod = this.allProducts.find(p => p.id === productId);
    if (!prod) return;

    // Check if item already exists in line items
    const existingIndex = this.currentItems.findIndex(i => i.product_id === prod.id);
    if (existingIndex > -1) {
      this.currentItems[existingIndex].quantity += 1;
      App.showToast(`Increased quantity for ${prod.name} (Qty: ${this.currentItems[existingIndex].quantity})`, 'info');
    } else {
      this.currentItems.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit: prod.unit || 'pcs',
        quantity: 1,
        unit_price: prod.selling_price,
        discount: 0,
        current_stock: prod.current_stock
      });
      App.showToast(`Added ${prod.name} to invoice`, 'success');
    }

    // Clear search
    const searchInput = document.getElementById('posProductSearchInput');
    if (searchInput) searchInput.value = '';
    document.getElementById('posQuickSearchResults').style.display = 'none';

    this.renderItemsTable();
    this.recalculateTotals();
  },

  addCustomLineItem() {
    this.currentItems.push({
      product_id: null,
      product_name: 'Custom Service / Consultation',
      sku: 'SRV-CUSTOM',
      unit: 'hrs',
      quantity: 1,
      unit_price: 100.00,
      discount: 0,
      current_stock: 9999
    });
    this.renderItemsTable();
    this.recalculateTotals();
  },

  updateLineItem(index, field, value) {
    if (!this.currentItems[index]) return;
    if (field === 'quantity') {
      this.currentItems[index].quantity = Math.max(1, parseInt(value, 10) || 1);
    } else if (field === 'unit_price') {
      this.currentItems[index].unit_price = Math.max(0, parseFloat(value) || 0);
    } else if (field === 'discount') {
      this.currentItems[index].discount = Math.max(0, parseFloat(value) || 0);
    } else if (field === 'product_name') {
      this.currentItems[index].product_name = value;
    }
    this.renderItemsTable();
    this.recalculateTotals();
  },

  removeLineItem(index) {
    this.currentItems.splice(index, 1);
    this.renderItemsTable();
    this.recalculateTotals();
  },

  renderItemsTable() {
    const tbody = document.getElementById('invoiceItemsTableBody');
    if (!tbody) return;

    if (this.currentItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 36px 20px;">
            <i class="fa-solid fa-cart-shopping" style="font-size: 2rem; color: var(--text-dim); margin-bottom: 8px; display: block;"></i>
            Scan a barcode, search a SKU above, or click "Add Custom Service" to begin building the invoice.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.currentItems.map((item, idx) => {
      const lineTotal = Math.max(0, (item.quantity * item.unit_price) - (item.discount || 0));
      const hasStockWarning = item.product_id && item.quantity > item.current_stock;

      return `
        <tr>
          <td>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main); margin-bottom: 2px;">
              ${item.product_id ? App.escapeHtml(item.product_name) : `<input type="text" class="form-control" value="${App.escapeHtml(item.product_name)}" onchange="Invoices.updateLineItem(${idx}, 'product_name', this.value)" style="padding: 4px 8px; height: 30px;">`}
            </div>
            <span class="sku-badge">${App.escapeHtml(item.sku || 'N/A')}</span>
            ${hasStockWarning ? `
              <span style="font-size: 0.72rem; color: var(--accent-rose); font-weight: 700; display: inline-block; margin-left: 6px;">
                ⚠️ Only ${item.current_stock} in stock!
              </span>
            ` : `
              <span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 6px;">Stock: ${item.current_stock} ${item.unit}</span>
            `}
          </td>
          <td>
            <input type="number" class="form-control" style="width: 90px; font-family: var(--font-mono); padding: 4px 8px; height: 32px;"
                   step="0.01" min="0" value="${item.unit_price}"
                   onchange="Invoices.updateLineItem(${idx}, 'unit_price', this.value)">
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" class="form-control" style="width: 70px; font-family: var(--font-mono); font-weight: 700; padding: 4px 8px; height: 32px;"
                     min="1" value="${item.quantity}"
                     onchange="Invoices.updateLineItem(${idx}, 'quantity', this.value)">
              <span style="font-size: 0.75rem; color: var(--text-dim);">${item.unit}</span>
            </div>
          </td>
          <td>
            <input type="number" class="form-control" style="width: 75px; font-family: var(--font-mono); padding: 4px 8px; height: 32px;"
                   step="0.5" min="0" value="${item.discount || 0}"
                   onchange="Invoices.updateLineItem(${idx}, 'discount', this.value)">
          </td>
          <td style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: var(--text-main);">
            ${App.formatCurrency(lineTotal)}
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-icon-only btn-sm" style="color: var(--accent-rose);" onclick="Invoices.removeLineItem(${idx})">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  recalculateTotals() {
    let subtotal = 0;
    this.currentItems.forEach(item => {
      const lineTotal = Math.max(0, (item.quantity * item.unit_price) - (item.discount || 0));
      subtotal += lineTotal;
    });

    const discountInput = document.getElementById('posDiscountInput');
    const taxRateInput = document.getElementById('posTaxRateInput');

    const overallDiscount = Math.max(0, parseFloat(discountInput ? discountInput.value : 0) || 0);
    const taxRate = Math.max(0, parseFloat(taxRateInput ? taxRateInput.value : 0) || 0);

    const taxableAmount = Math.max(0, subtotal - overallDiscount);
    const taxAmount = Math.round((taxableAmount * (taxRate / 100)) * 100) / 100;
    const grandTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

    document.getElementById('posItemsCount').textContent = `${this.currentItems.length} items (${this.currentItems.reduce((acc, i) => acc + i.quantity, 0)} units)`;
    document.getElementById('posSubtotal').textContent = App.formatCurrency(subtotal);
    document.getElementById('posTaxAmount').textContent = App.formatCurrency(taxAmount);
    document.getElementById('posGrandTotal').textContent = App.formatCurrency(grandTotal);

    return {
      subtotal,
      overallDiscount,
      taxRate,
      taxAmount,
      grandTotal
    };
  },

  async submitInvoice(openPrintImmediately = false) {
    try {
      if (this.currentItems.length === 0) {
        App.showToast('Please add at least one line item to the invoice', 'error');
        return;
      }

      const customerId = document.getElementById('invoiceCustomerSelect').value;
      let customerName = 'Walk-in Retail Client';
      let customerEmail = '';
      let customerPhone = '';
      let customerAddress = '';
      let customerTaxId = '';

      if (customerId) {
        const cust = this.allCustomers.find(c => String(c.id) === String(customerId));
        if (cust) {
          customerName = cust.name;
          customerEmail = cust.email || '';
          customerPhone = cust.phone || '';
          customerAddress = cust.billing_address || '';
          customerTaxId = cust.tax_id || '';
        }
      } else {
        const walkinInput = document.getElementById('posWalkinName');
        if (walkinInput && walkinInput.value.trim()) {
          customerName = walkinInput.value.trim();
        }
      }

      const invDate = document.getElementById('invoiceDate').value;
      const invDueDate = document.getElementById('invoiceDueDate').value;
      const paymentMethod = document.getElementById('invoicePaymentMethod').value;
      const status = document.getElementById('invoiceStatus').value;
      const notes = document.getElementById('invoiceNotes').value;
      const invNumber = document.getElementById('posAutoInvNum').textContent;

      const totals = this.recalculateTotals();

      const payload = {
        invoice_number: invNumber,
        customer_id: customerId || null,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_tax_id: customerTaxId,
        invoice_date: invDate,
        due_date: invDueDate,
        status: status,
        payment_method: paymentMethod,
        notes: notes,
        tax_rate: totals.taxRate,
        discount_amount: totals.overallDiscount,
        amount_paid: status === 'paid' ? totals.grandTotal : 0,
        items: this.currentItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          sku: i.sku,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount
        }))
      };

      let res;
      try {
        res = await App.api('/api/invoices', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch (err) {
        if (err.message && err.message.includes('Stock Shortage Warning')) {
          const proceed = confirm(`${err.message}\n\nWould you like to authorize this sale anyway and allow backorder / negative stock?`);
          if (proceed) {
            res = await App.api('/api/invoices', {
              method: 'POST',
              body: JSON.stringify({ ...payload, allow_negative_stock: true })
            });
          } else {
            return;
          }
        } else {
          throw err;
        }
      }

      App.showToast(res.message, 'success');

      const createdInvoiceId = res.invoice.id;

      // Reset form
      this.resetForm();

      // If user selected 1-Click Print / PDF, immediately show the preview modal
      if (openPrintImmediately) {
        this.viewInvoice(createdInvoiceId, true);
      } else {
        App.navigateTo('invoices');
      }

      Dashboard.load();
    } catch (err) {
      console.error(err);
    }
  },

  resetForm() {
    this.currentItems = [];
    document.getElementById('posProductSearchInput').value = '';
    const custSelect = document.getElementById('invoiceCustomerSelect');
    if (custSelect) custSelect.value = '';
    const walkinInput = document.getElementById('posWalkinName');
    if (walkinInput) walkinInput.value = '';
    const detailsEl = document.getElementById('posSelectedCustomerDetails');
    if (detailsEl) detailsEl.style.display = 'none';
    const walkinGroup = document.getElementById('posWalkinGroup');
    if (walkinGroup) walkinGroup.style.display = 'block';
    document.getElementById('posDiscountInput').value = '0.00';
    document.getElementById('invoiceNotes').value = '';
    this.initForm();
  },

  // Invoices Register list & filter
  async loadInvoices() {
    try {
      this.filterInvoices();
    } catch (err) {
      console.error('Failed to load invoices:', err);
    }
  },

  async filterInvoices() {
    try {
      const search = document.getElementById('invoiceSearchInput').value;
      const status = document.getElementById('invoiceStatusFilter').value;

      let url = '/api/invoices?';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status) params.append('status', status);

      this.cachedInvoices = await App.api(url + params.toString());
      this.renderInvoicesTable(this.cachedInvoices);
    } catch (err) {
      console.error(err);
    }
  },

  renderInvoicesTable(invoices) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    if (!invoices || invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">No invoices found.</td></tr>`;
      return;
    }

    tbody.innerHTML = invoices.map(inv => `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">
          ${App.escapeHtml(inv.invoice_number)}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${App.escapeHtml(inv.customer_name)}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${App.escapeHtml(inv.customer_email || '-')}</div>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${inv.invoice_date}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${inv.due_date}</td>
        <td style="font-size: 0.85rem; text-transform: capitalize;">${inv.payment_method ? inv.payment_method.replace('_', ' ') : 'Cash'}</td>
        <td style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem;">${App.formatCurrency(inv.total_amount)}</td>
        <td>
          <span class="status-pill ${inv.status}">${inv.status}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" onclick="Invoices.viewInvoice(${inv.id})">
              <i class="fa-solid fa-eye"></i> View & Print
            </button>
            ${inv.status !== 'paid' ? `
              <button class="btn btn-secondary btn-sm" title="Mark as Paid" onclick="Invoices.markAsPaid(${inv.id})">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  async markAsPaid(invoiceId) {
    try {
      await App.api(`/api/invoices/${invoiceId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paid' })
      });
      App.showToast('Invoice marked as Paid in full!', 'success');
      this.filterInvoices();
      Dashboard.load();
    } catch (err) {
      console.error(err);
    }
  },

  // View Printable A4 Invoice Modal
  async viewInvoice(invoiceId, autoTriggerPrint = false) {
    try {
      const data = await App.api(`/api/invoices/${invoiceId}`);
      const inv = data.invoice;
      const items = data.items || [];
      const company = data.company || {};

      // Fill header info
      document.getElementById('previewModalInvNumber').textContent = `Invoice ${inv.invoice_number}`;
      const statusBadge = document.getElementById('previewModalStatusBadge');
      statusBadge.textContent = inv.status.toUpperCase();
      statusBadge.className = `status-pill ${inv.status}`;

      // Fill Printable Sheet
      document.getElementById('invDocCompanyName').textContent = company.company_name || 'FlowStock ERP';
      document.getElementById('invDocCompanyMeta').innerHTML = `
        ${App.escapeHtml(company.address || '')}<br>
        Email: ${App.escapeHtml(company.email || '')} | Phone: ${App.escapeHtml(company.phone || '')}<br>
        Tax ID / GSTIN: ${App.escapeHtml(company.tax_id || '')}
      `;

      document.getElementById('invDocNumber').textContent = inv.invoice_number;
      document.getElementById('invDocDate').textContent = inv.invoice_date;
      document.getElementById('invDocDueDate').textContent = inv.due_date;
      document.getElementById('invDocPaymentMethod').textContent = (inv.payment_method || 'Bank Transfer').replace('_', ' ').toUpperCase();
      document.getElementById('invDocStatus').textContent = inv.status === 'paid' ? 'PAID IN FULL' : 'PAYMENT PENDING';

      // Customer Details
      document.getElementById('invDocCustomerName').textContent = inv.customer_name;
      document.getElementById('invDocCustomerDetails').innerHTML = `
        ${App.escapeHtml(inv.customer_address || '')}<br>
        Email: ${App.escapeHtml(inv.customer_email || 'N/A')} | Phone: ${App.escapeHtml(inv.customer_phone || 'N/A')}<br>
        Tax ID: ${App.escapeHtml(inv.customer_tax_id || 'N/A')}
      `;

      // Bank wire info
      document.getElementById('invDocBankDetails').innerHTML = App.escapeHtml(company.bank_details || 'Payment details on file').replace(/\n/g, '<br>');

      // Items list
      const itemsBody = document.getElementById('invDocItemsBody');
      itemsBody.innerHTML = items.map(item => `
        <tr>
          <td>
            <b>${App.escapeHtml(item.product_name)}</b><br>
            <span style="font-family: monospace; font-size: 0.75rem; color: #64748b;">SKU: ${App.escapeHtml(item.sku || '-')}</span>
          </td>
          <td class="text-right" style="font-family: monospace;">${App.formatCurrency(item.unit_price)}</td>
          <td class="text-right" style="font-family: monospace;">${item.quantity} ${item.unit || 'pcs'}</td>
          <td class="text-right" style="font-family: monospace; font-weight: 700;">${App.formatCurrency(item.total)}</td>
        </tr>
      `).join('');

      // Math calculations
      document.getElementById('invDocSubtotal').textContent = App.formatCurrency(inv.subtotal);
      if (inv.discount_amount > 0) {
        document.getElementById('invDocDiscountRow').style.display = 'flex';
        document.getElementById('invDocDiscount').textContent = `-${App.formatCurrency(inv.discount_amount)}`;
      } else {
        document.getElementById('invDocDiscountRow').style.display = 'none';
      }
      document.getElementById('invDocTaxRate').textContent = inv.tax_rate;
      document.getElementById('invDocTaxAmount').textContent = App.formatCurrency(inv.tax_amount);
      document.getElementById('invDocGrandTotal').textContent = App.formatCurrency(inv.total_amount);

      // Notes & terms
      document.getElementById('invDocTerms').textContent = inv.notes || company.terms_notes || 'Thank you for your business!';

      // Open Modal
      App.openModal('invoicePreviewModal');

      if (autoTriggerPrint) {
        setTimeout(() => {
          window.print();
        }, 300);
      }
    } catch (err) {
      console.error(err);
    }
  }
};
