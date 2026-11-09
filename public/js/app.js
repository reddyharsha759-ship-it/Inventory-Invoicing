/**
 * FlowStock ERP & Invoicing Hub - Core App Controller & Navigation
 */

const App = {
  state: {
    settings: {},
    categories: [],
    products: [],
    customers: [],
    currentTab: 'dashboard'
  },

  init() {
    this.setupTheme();
    this.setupNavigation();
    this.setupGlobalShortcuts();
    this.loadInitialData();
  },

  // Global Keyboard Shortcuts (e.g. Ctrl+K for Instant Stock Checker)
  setupGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openQuickStockModal();
      }
    });
  },

  // Theme Management (Dark / Light)
  setupTheme() {
    const savedTheme = localStorage.getItem('flowstock_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeButton(savedTheme);

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const nextTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('flowstock_theme', nextTheme);
        this.updateThemeButton(nextTheme);
        // Refresh charts on theme change
        if (typeof Dashboard !== 'undefined' && Dashboard.refreshChart) {
          Dashboard.refreshChart();
        }
      });
    }
  },

  updateThemeButton(theme) {
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === 'dark'
        ? '<i class="fa-solid fa-sun"></i><span>Light</span>'
        : '<i class="fa-solid fa-moon"></i><span>Dark</span>';
    }
  },

  // Tab Navigation
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab) {
          this.navigateTo(tab);
        }
      });
    });
  },

  navigateTo(tabId) {
    this.state.currentTab = tabId;

    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Show selected view, hide others
    document.querySelectorAll('.app-view').forEach(view => {
      view.style.display = 'none';
    });

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) {
      targetView.style.display = 'block';
    }

    // Update Topbar Title
    const titles = {
      'dashboard': { title: 'Executive Dashboard', subtitle: 'Real-time inventory levels, revenue analytics, and billing queue' },
      'stock-checker': { title: 'Real-Time Stock Checker', subtitle: 'Instant barcode verification, live inventory levels, and rapid replenishment' },
      'new-invoice': { title: 'Create Automated Invoice', subtitle: 'Rapid POS billing with barcode scanner, auto-fill, and instant stock deduction' },
      'invoices': { title: 'Invoices Register', subtitle: 'Browse, print, search, and manage customer sales invoices' },
      'inventory': { title: 'Inventory & Stock Management', subtitle: 'Track SKU levels, low-stock warnings, and warehouse movements' },
      'customers': { title: 'Customer Accounts Directory', subtitle: 'Manage client billing profiles, tax credentials, and balances' },
      'audit-log': { title: 'Stock Movement Audit Log', subtitle: 'Complete traceability of sales, restocks, and manual adjustments' },
      'import-export': { title: 'Bulk Data Sync & Excel', subtitle: 'Import and export inventory spreadsheets to eliminate manual entry' },
      'settings': { title: 'Company & Invoicing Settings', subtitle: 'Configure tax IDs, currency, invoice styling, and payment instructions' }
    };

    const header = titles[tabId] || { title: 'FlowStock ERP', subtitle: '' };
    document.getElementById('topBarTitle').textContent = header.title;
    document.getElementById('topBarSubtitle').textContent = header.subtitle;

    // Tab-specific lifecycle activations
    if (tabId === 'dashboard') Dashboard.load();
    if (tabId === 'stock-checker') {
      if (typeof StockChecker !== 'undefined' && StockChecker.load) {
        StockChecker.load();
      }
    }
    if (tabId === 'new-invoice') Invoices.initForm();
    if (tabId === 'invoices') Invoices.loadInvoices();
    if (tabId === 'inventory') Inventory.load();
    if (tabId === 'customers') Customers.load();
    if (tabId === 'audit-log') this.loadAuditLog();
    if (tabId === 'settings') this.loadSettingsForm();
  },

  // Central API Helper
  async api(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Network error occurred' }));
        throw new Error(errData.error || `HTTP error: ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      this.showToast(err.message, 'error');
      throw err;
    }
  },

  // Initial Data Fetch
  async loadInitialData() {
    try {
      const [settings, categories] = await Promise.all([
        this.api('/api/settings'),
        this.api('/api/categories')
      ]);

      this.state.settings = settings;
      this.state.categories = categories;

      this.populateCategoryDropdowns();
      Dashboard.load();
      if (typeof StockChecker !== 'undefined' && StockChecker.init) {
        StockChecker.init();
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  },

  populateCategoryDropdowns() {
    const selects = ['inventoryCategoryFilter', 'prodCategory'];
    selects.forEach(selId => {
      const el = document.getElementById(selId);
      if (!el) return;
      const currentVal = el.value;
      const isFilter = selId.includes('Filter');
      el.innerHTML = isFilter ? '<option value="">All Categories</option>' : '<option value="">-- Select Category --</option>';

      this.state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        el.appendChild(opt);
      });

      if (currentVal) el.value = currentVal;
    });
  },

  // Settings view loader & saver
  async loadSettingsForm() {
    try {
      const s = await this.api('/api/settings');
      this.state.settings = s;
      document.getElementById('settingCompanyName').value = s.company_name || '';
      document.getElementById('settingTagline').value = s.tagline || '';
      document.getElementById('settingEmail').value = s.email || '';
      document.getElementById('settingPhone').value = s.phone || '';
      document.getElementById('settingAddress').value = s.address || '';
      document.getElementById('settingTaxId').value = s.tax_id || '';
      document.getElementById('settingCurrency').value = s.currency_symbol || '$';
      document.getElementById('settingPrefix').value = s.invoice_prefix || 'INV-';
      document.getElementById('settingTaxRate').value = s.default_tax_rate || 8.5;
      document.getElementById('settingBankDetails').value = s.bank_details || '';
      document.getElementById('settingTerms').value = s.terms_notes || '';
    } catch (err) {
      console.error(err);
    }
  },

  async saveSettings() {
    try {
      const payload = {
        company_name: document.getElementById('settingCompanyName').value,
        tagline: document.getElementById('settingTagline').value,
        email: document.getElementById('settingEmail').value,
        phone: document.getElementById('settingPhone').value,
        address: document.getElementById('settingAddress').value,
        tax_id: document.getElementById('settingTaxId').value,
        currency_symbol: document.getElementById('settingCurrency').value,
        invoice_prefix: document.getElementById('settingPrefix').value,
        default_tax_rate: document.getElementById('settingTaxRate').value,
        bank_details: document.getElementById('settingBankDetails').value,
        terms_notes: document.getElementById('settingTerms').value
      };

      const updated = await this.api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      this.state.settings = updated;
      this.showToast('Company settings successfully updated!', 'success');
    } catch (err) {
      console.error(err);
    }
  },

  // Audit Log Loader
  async loadAuditLog() {
    try {
      const rows = await this.api('/api/transactions');
      const tbody = document.getElementById('auditLogTableBody');
      if (!tbody) return;

      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">No inventory movements recorded yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const isPositive = r.quantity_change > 0;
        const changeClass = isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)';
        const changeSign = isPositive ? '+' : '';
        const dateStr = new Date(r.created_at).toLocaleString();

        return `
          <tr>
            <td style="font-size: 0.82rem; color: var(--text-muted);">${dateStr}</td>
            <td>
              <b>${this.escapeHtml(r.product_name)}</b><br>
              <span class="sku-badge">${this.escapeHtml(r.sku)}</span>
            </td>
            <td>
              <span class="status-pill ${r.transaction_type === 'sale' ? 'pending' : 'in-stock'}">
                ${r.transaction_type}
              </span>
            </td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: ${changeClass};">
              ${changeSign}${r.quantity_change} ${r.unit || 'pcs'}
            </td>
            <td style="font-family: var(--font-mono);">${r.previous_stock}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">${r.new_stock}</td>
            <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--primary);">${this.escapeHtml(r.reference_id || '-')}</td>
            <td style="font-size: 0.82rem; color: var(--text-muted);">${this.escapeHtml(r.notes || '')}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  },

  // Modal helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  openQuickStockModal() {
    this.openModal('quickStockModal');
    const input = document.getElementById('globalStockSearchInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
      if (typeof StockChecker !== 'undefined' && StockChecker.handleGlobalModalSearch) {
        StockChecker.handleGlobalModalSearch('');
      }
    }
  },

  inspectStock(productId) {
    if (typeof StockChecker !== 'undefined' && StockChecker.inspectProduct) {
      StockChecker.inspectProduct(productId);
    }
  },

  openAddProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('prodEditId').value = '';
    document.getElementById('productModalTitle').textContent = 'Add New Product';
    document.getElementById('prodStockGroup').style.display = 'block';
    this.openModal('productModal');
  },

  openAddCustomerModal(isQuickFromInvoice = false) {
    document.getElementById('customerForm').reset();
    document.getElementById('custEditId').value = '';
    document.getElementById('customerModalTitle').textContent = isQuickFromInvoice ? 'Quick Add Customer for Invoice' : 'Add New Customer';
    this.openModal('customerModal');
  },

  exportProducts(format = 'xlsx') {
    window.location.href = `/api/export/products?format=${format}`;
  },

  exportInvoices(format = 'xlsx') {
    window.location.href = `/api/export/invoices?format=${format}`;
  },

  exportCustomers(format = 'xlsx') {
    window.location.href = `/api/export/customers?format=${format}`;
  },

  exportAuditLog(format = 'xlsx') {
    window.location.href = `/api/export/audit-log?format=${format}`;
  },

  async promptNewCategory() {
    const catName = prompt('Enter new category name:');
    if (!catName || !catName.trim()) return;

    try {
      const created = await this.api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName.trim() })
      });

      this.state.categories.push(created);
      this.populateCategoryDropdowns();
      const prodCatEl = document.getElementById('prodCategory');
      if (prodCatEl) prodCatEl.value = created.id;
      this.showToast(`Category "${created.name}" created!`, 'success');
    } catch (err) {
      console.error(err);
    }
  },

  // Currency & Formatting utilities
  formatCurrency(amount) {
    const sym = (this.state.settings && this.state.settings.currency_symbol) || '$';
    const num = Number(amount) || 0;
    return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Toast System
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// Global startup
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
