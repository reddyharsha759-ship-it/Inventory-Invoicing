/**
 * FlowStock ERP - Real-Time Product Stock Checker & Warehouse Intelligence
 */

const StockChecker = {
  products: [],
  filteredProducts: [],
  activeFilter: 'all', // 'all', 'in_stock', 'low_stock', 'out_of_stock'
  activeCategory: '',
  searchQuery: '',
  currentViewMode: 'cards', // 'cards' or 'table'
  selectedProduct: null,

  async init() {
    this.setupListeners();
    await this.load();
  },

  setupListeners() {
    // Search input handler with instant debounce
    const searchInput = document.getElementById('stockCheckerSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.applyFilters();
      });

      // Quick barcode scanner detection (enter key press from hardware scanners)
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleBarcodeScan(this.searchQuery);
        }
      });
    }

    // Modal search input handler (Ctrl+K)
    const modalSearch = document.getElementById('globalStockSearchInput');
    if (modalSearch) {
      modalSearch.addEventListener('input', (e) => {
        this.handleGlobalModalSearch(e.target.value.trim());
      });

      modalSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          App.closeModal('quickStockModal');
        }
      });
    }
  },

  async load() {
    try {
      this.products = await App.api('/api/products');
      this.populateCategoryFilter();
      this.updateMetrics();
      this.applyFilters();
    } catch (err) {
      console.error('Failed to load stock checker data:', err);
    }
  },

  populateCategoryFilter() {
    const catSelect = document.getElementById('stockCheckerCategorySelect');
    if (!catSelect || !App.state.categories) return;

    catSelect.innerHTML = '<option value="">All Categories</option>';
    App.state.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });
  },

  updateMetrics() {
    const totalProducts = this.products.length;
    let totalUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalRetailVal = 0;
    let totalCostVal = 0;

    this.products.forEach(p => {
      const stock = Number(p.current_stock) || 0;
      const minAlert = Number(p.min_stock_alert) || 5;
      const cost = Number(p.cost_price) || 0;
      const retail = Number(p.selling_price) || 0;

      totalUnits += stock;
      totalCostVal += (stock * cost);
      totalRetailVal += (stock * retail);

      if (stock === 0) {
        outOfStockCount++;
      } else if (stock <= minAlert) {
        lowStockCount++;
      }
    });

    const healthyCount = Math.max(0, totalProducts - lowStockCount - outOfStockCount);

    // Update Stock Station Metrics
    this.safeSetText('scMetricTotalSkus', totalProducts);
    this.safeSetText('scMetricTotalUnits', totalUnits.toLocaleString());
    this.safeSetText('scMetricHealthy', healthyCount);
    this.safeSetText('scMetricLowStock', lowStockCount);
    this.safeSetText('scMetricOutOfStock', outOfStockCount);
    this.safeSetText('scMetricRetailVal', App.formatCurrency(totalRetailVal));
    this.safeSetText('scMetricCostVal', App.formatCurrency(totalCostVal));
    this.safeSetText('scMetricProfitPotential', App.formatCurrency(totalRetailVal - totalCostVal));

    // Update Filter Pill Counters
    this.safeSetText('scFilterCountAll', totalProducts);
    this.safeSetText('scFilterCountHealthy', healthyCount);
    this.safeSetText('scFilterCountLow', lowStockCount);
    this.safeSetText('scFilterCountOut', outOfStockCount);

    // Update Inventory page metrics too
    this.safeSetText('invMetricTotalProducts', totalProducts);
    this.safeSetText('invMetricTotalUnits', totalUnits.toLocaleString());
    this.safeSetText('invMetricLowStock', lowStockCount);
    this.safeSetText('invMetricOutOfStock', outOfStockCount);
    this.safeSetText('invMetricValuation', App.formatCurrency(totalRetailVal));
  },

  safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  setFilter(filterType) {
    this.activeFilter = filterType;
    document.querySelectorAll('.stock-filter-pill').forEach(btn => {
      if (btn.getAttribute('data-filter') === filterType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.applyFilters();
  },

  setCategory(catId) {
    this.activeCategory = catId ? String(catId) : '';
    this.applyFilters();
  },

  setViewMode(mode) {
    this.currentViewMode = mode;
    const cardsContainer = document.getElementById('stockCardsContainer');
    const tableContainer = document.getElementById('stockTableContainer');
    const btnCards = document.getElementById('btnViewCards');
    const btnTable = document.getElementById('btnViewTable');

    if (mode === 'cards') {
      if (cardsContainer) cardsContainer.style.display = 'grid';
      if (tableContainer) tableContainer.style.display = 'none';
      if (btnCards) btnCards.classList.add('active');
      if (btnTable) btnTable.classList.remove('active');
    } else {
      if (cardsContainer) cardsContainer.style.display = 'none';
      if (tableContainer) tableContainer.style.display = 'block';
      if (btnCards) btnCards.classList.remove('active');
      if (btnTable) btnTable.classList.add('active');
    }
  },

  applyFilters() {
    const q = this.searchQuery.toLowerCase();
    const cat = this.activeCategory;
    const filter = this.activeFilter;

    this.filteredProducts = this.products.filter(p => {
      // Category filter
      if (cat && String(p.category_id) !== cat) return false;

      // Status filter
      const stock = Number(p.current_stock) || 0;
      const minAlert = Number(p.min_stock_alert) || 5;

      if (filter === 'healthy' && (stock <= minAlert || stock === 0)) return false;
      if (filter === 'low_stock' && (stock > minAlert || stock === 0)) return false;
      if (filter === 'out_of_stock' && stock > 0) return false;

      // Query search
      if (q) {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        const category = (p.category_name || '').toLowerCase();
        return name.includes(q) || sku.includes(q) || barcode.includes(q) || category.includes(q);
      }

      return true;
    });

    this.render();
  },

  render() {
    this.renderCards(this.filteredProducts);
    this.renderTable(this.filteredProducts);
  },

  renderCards(products) {
    const container = document.getElementById('stockCardsContainer');
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="empty-stock-state">
          <i class="fa-solid fa-boxes-stacked" style="font-size: 3rem; color: var(--text-dim); margin-bottom: 12px;"></i>
          <h3>No matching products found</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Try adjusting your search query, barcode, or category filter.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(p => {
      const stock = Number(p.current_stock) || 0;
      const minAlert = Number(p.min_stock_alert) || 5;
      const costPrice = Number(p.cost_price) || 0;
      const sellPrice = Number(p.selling_price) || 0;
      const margin = sellPrice > 0 ? Math.round(((sellPrice - costPrice) / sellPrice) * 100) : 0;
      const totalStockVal = stock * sellPrice;

      // Stock status styling & calculation
      let statusClass = 'healthy';
      let statusLabel = 'In Stock';
      let statusIcon = 'fa-circle-check';
      let progressColor = 'var(--accent-emerald)';

      if (stock === 0) {
        statusClass = 'out-of-stock';
        statusLabel = 'Out of Stock';
        statusIcon = 'fa-circle-xmark';
        progressColor = 'var(--accent-rose)';
      } else if (stock <= minAlert) {
        statusClass = 'low-stock';
        statusLabel = `Low Stock Warning (${stock} left)`;
        statusIcon = 'fa-triangle-exclamation';
        progressColor = 'var(--accent-amber)';
      }

      // Visual target gauge: stock vs target level (3x min alert is 100%)
      const targetStock = Math.max(minAlert * 3, 20);
      const stockPercentage = Math.min(100, Math.round((stock / targetStock) * 100));

      return `
        <div class="stock-item-card ${statusClass}">
          <!-- Card Header -->
          <div class="stock-card-top">
            <div class="stock-card-titles">
              <span class="stock-category-badge">${App.escapeHtml(p.category_name || 'General')}</span>
              <h3 class="stock-product-name" title="${App.escapeHtml(p.name)}">${App.escapeHtml(p.name)}</h3>
              <div class="stock-identifiers">
                <span class="sku-badge"><i class="fa-solid fa-tag"></i> ${App.escapeHtml(p.sku)}</span>
                ${p.barcode ? `<span class="barcode-badge"><i class="fa-solid fa-barcode"></i> ${App.escapeHtml(p.barcode)}</span>` : ''}
              </div>
            </div>
            
            <!-- Big Stock Badge -->
            <div class="stock-badge-large ${statusClass}">
              <div class="stock-big-num">${stock}</div>
              <div class="stock-unit-label">${App.escapeHtml(p.unit || 'pcs')}</div>
              <div class="stock-status-pill ${statusClass}">
                <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
              </div>
            </div>
          </div>

          <!-- Stock Progress Meter -->
          <div class="stock-meter-wrap">
            <div class="stock-meter-info">
              <span>Threshold: <b>${minAlert} ${p.unit || 'pcs'}</b></span>
              <span>Stock Health: <b>${stockPercentage}%</b></span>
            </div>
            <div class="stock-meter-bar">
              <div class="stock-meter-fill" style="width: ${stockPercentage}%; background: ${progressColor};"></div>
            </div>
          </div>

          <!-- Financial Snapshot -->
          <div class="stock-finance-grid">
            <div class="finance-cell">
              <span class="cell-label">Selling Price</span>
              <span class="cell-value retail">${App.formatCurrency(sellPrice)}</span>
            </div>
            <div class="finance-cell">
              <span class="cell-label">Cost Price</span>
              <span class="cell-value">${App.formatCurrency(costPrice)}</span>
            </div>
            <div class="finance-cell">
              <span class="cell-label">Unit Margin</span>
              <span class="cell-value margin">+${margin}%</span>
            </div>
            <div class="finance-cell">
              <span class="cell-label">Valuation on Hand</span>
              <span class="cell-value valuation">${App.formatCurrency(totalStockVal)}</span>
            </div>
          </div>

          <!-- Quick Actions & 1-Click Restock Controls -->
          <div class="stock-card-actions">
            <div class="quick-restock-btns">
              <span class="restock-label">Quick Restock:</span>
              <button class="btn btn-sm btn-quick-add" title="Restock +5 units" onclick="StockChecker.quickAdjust(${p.id}, 'add', 5, 'Quick +5 Restock')">+5</button>
              <button class="btn btn-sm btn-quick-add" title="Restock +20 units" onclick="StockChecker.quickAdjust(${p.id}, 'add', 20, 'Quick +20 Restock')">+20</button>
              <button class="btn btn-sm btn-quick-add" title="Restock +50 units" onclick="StockChecker.quickAdjust(${p.id}, 'add', 50, 'Quick +50 Restock')">+50</button>
              ${stock > 0 ? `<button class="btn btn-sm btn-quick-sub" title="Quick Sale / Deduct 1 unit" onclick="StockChecker.quickAdjust(${p.id}, 'subtract', 1, 'Quick Over-the-counter Deduction')">-1</button>` : ''}
            </div>

            <div class="stock-primary-actions">
              <button class="btn btn-secondary btn-sm" onclick="StockChecker.openAdjustModal(${p.id}, '${App.escapeHtml(p.name)}', ${stock})">
                <i class="fa-solid fa-sliders"></i> Adjust
              </button>
              <button class="btn btn-primary btn-sm" onclick="StockChecker.inspectProduct(${p.id})">
                <i class="fa-solid fa-chart-line"></i> Inspect Stock
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderTable(products) {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    if (!products || products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">No matching products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const stock = Number(p.current_stock) || 0;
      const minAlert = Number(p.min_stock_alert) || 5;
      const costPrice = Number(p.cost_price) || 0;
      const sellPrice = Number(p.selling_price) || 0;
      const totalVal = stock * sellPrice;

      let statusPill = `<span class="status-pill in-stock">Healthy</span>`;
      let dotClass = 'green';
      if (stock === 0) {
        statusPill = `<span class="status-pill out-of-stock">Depleted</span>`;
        dotClass = 'red';
      } else if (stock <= minAlert) {
        statusPill = `<span class="status-pill low-stock">Low Stock (${stock})</span>`;
        dotClass = 'yellow';
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${App.escapeHtml(p.name)}</div>
            <span style="font-size: 0.78rem; color: var(--text-muted);">${App.escapeHtml(p.category_name || 'Uncategorized')}</span>
          </td>
          <td>
            <span class="sku-badge">${App.escapeHtml(p.sku)}</span>
            ${p.barcode ? `<div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">${App.escapeHtml(p.barcode)}</div>` : ''}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="stock-indicator-dot ${dotClass}"></span>
              <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.15rem; color: ${stock === 0 ? 'var(--accent-rose)' : stock <= minAlert ? 'var(--accent-amber)' : 'var(--text-main)'};">
                ${stock}
              </span>
              <span style="font-size: 0.78rem; color: var(--text-dim);">${App.escapeHtml(p.unit || 'pcs')}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">Threshold: ${minAlert}</div>
          </td>
          <td>${statusPill}</td>
          <td style="font-family: var(--font-mono); font-size: 0.88rem;">${App.formatCurrency(costPrice)}</td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald); font-size: 0.95rem;">${App.formatCurrency(sellPrice)}</td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">${App.formatCurrency(totalVal)}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="StockChecker.quickAdjust(${p.id}, 'add', 10, 'Quick +10 Restock')" title="Quick +10">+10</button>
              <button class="btn btn-secondary btn-sm" onclick="StockChecker.openAdjustModal(${p.id}, '${App.escapeHtml(p.name)}', ${stock})" title="Adjust Stock">Adjust</button>
              <button class="btn btn-primary btn-sm" onclick="StockChecker.inspectProduct(${p.id})" title="Inspect Stock">Inspect</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async handleBarcodeScan(code) {
    if (!code) return;
    try {
      const res = await App.api(`/api/products/check-stock/${encodeURIComponent(code)}`);
      if (res && res.products && res.products.length > 0) {
        if (res.match === 'exact' || res.products.length === 1) {
          const matchedProd = res.products[0];
          App.showToast(`Found exact match: "${matchedProd.name}" - ${matchedProd.current_stock} ${matchedProd.unit} in stock!`, 'success');
          this.inspectProduct(matchedProd.id);
        } else {
          App.showToast(`Found ${res.products.length} matches for "${code}"`, 'info');
        }
      } else {
        App.showToast(`No product found with barcode/SKU "${code}"`, 'error');
      }
    } catch (err) {
      console.error(err);
    }
  },

  async quickAdjust(productId, adjustmentType, quantity, reason) {
    try {
      const res = await App.api(`/api/products/${productId}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify({
          adjustment_type: adjustmentType,
          quantity: quantity,
          reason: reason
        })
      });

      App.showToast(res.message, 'success');
      await this.load();
      if (typeof Dashboard !== 'undefined' && Dashboard.load) {
        Dashboard.load();
      }
      if (typeof Inventory !== 'undefined' && Inventory.filterProducts) {
        Inventory.filterProducts();
      }

      // If inspect modal is open for this product, refresh it
      if (this.selectedProduct && this.selectedProduct.id === productId) {
        this.inspectProduct(productId);
      }
    } catch (err) {
      console.error(err);
    }
  },

  openAdjustModal(productId, productName, currentQty) {
    Inventory.openStockAdjustModal(productId, productName, currentQty);
  },

  async inspectProduct(productId) {
    try {
      const data = await App.api(`/api/products/${productId}`);
      const p = data.product;
      const transactions = data.transactions || [];
      const sales = data.salesStats || { total_sold: 0, total_revenue: 0 };
      this.selectedProduct = p;

      const stock = Number(p.current_stock) || 0;
      const minAlert = Number(p.min_stock_alert) || 5;
      const cost = Number(p.cost_price) || 0;
      const retail = Number(p.selling_price) || 0;
      const totalVal = stock * retail;
      const profitPerUnit = retail - cost;
      const marginPct = retail > 0 ? Math.round((profitPerUnit / retail) * 100) : 0;

      // Populate Modal Fields
      this.safeSetText('inspModalName', p.name);
      this.safeSetText('inspModalSku', p.sku);
      this.safeSetText('inspModalBarcode', p.barcode || 'None');
      this.safeSetText('inspModalCategory', p.category_name || 'General');
      this.safeSetText('inspModalDescription', p.description || 'No description provided');

      // Big Stock Counter
      this.safeSetText('inspModalStockQty', stock);
      this.safeSetText('inspModalStockUnit', p.unit || 'pcs');
      this.safeSetText('inspModalThreshold', `${minAlert} ${p.unit || 'pcs'}`);
      
      const badgeEl = document.getElementById('inspModalStatusBadge');
      if (badgeEl) {
        if (stock === 0) {
          badgeEl.className = 'status-pill out-of-stock';
          badgeEl.textContent = 'Out of Stock / Depleted';
        } else if (stock <= minAlert) {
          badgeEl.className = 'status-pill low-stock';
          badgeEl.textContent = 'Low Stock Alert';
        } else {
          badgeEl.className = 'status-pill in-stock';
          badgeEl.textContent = 'Healthy Stock Level';
        }
      }

      // Financial Metrics
      this.safeSetText('inspModalCostPrice', App.formatCurrency(cost));
      this.safeSetText('inspModalSellingPrice', App.formatCurrency(retail));
      this.safeSetText('inspModalProfitPerUnit', `${App.formatCurrency(profitPerUnit)} (${marginPct}%)`);
      this.safeSetText('inspModalValuation', App.formatCurrency(totalVal));

      // Sales Metrics
      this.safeSetText('inspModalTotalSold', `${sales.total_sold || 0} ${p.unit || 'pcs'}`);
      this.safeSetText('inspModalTotalRevenue', App.formatCurrency(sales.total_revenue || 0));

      // Render Transaction Movement History
      const tbody = document.getElementById('inspModalMovementsBody');
      if (tbody) {
        if (transactions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 18px;">No stock movements recorded yet.</td></tr>`;
        } else {
          tbody.innerHTML = transactions.map(t => {
            const isPos = t.quantity_change > 0;
            const changeColor = isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)';
            const changePrefix = isPos ? '+' : '';
            return `
              <tr>
                <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(t.created_at).toLocaleString()}</td>
                <td><span class="status-pill ${t.transaction_type === 'sale' ? 'pending' : 'in-stock'}">${t.transaction_type}</span></td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: ${changeColor};">${changePrefix}${t.quantity_change}</td>
                <td style="font-family: var(--font-mono);">${t.previous_stock}</td>
                <td style="font-family: var(--font-mono); font-weight: 700;">${t.new_stock}</td>
                <td style="font-size: 0.8rem; color: var(--text-dim);">${App.escapeHtml(t.notes || t.reference_id || '-')}</td>
              </tr>
            `;
          }).join('');
        }
      }

      // Quick restock input
      const restockInput = document.getElementById('inspQuickRestockQty');
      if (restockInput) restockInput.value = '10';

      App.openModal('stockInspectModal');
    } catch (err) {
      console.error(err);
    }
  },

  async submitInspectorRestock(e) {
    if (e) e.preventDefault();
    if (!this.selectedProduct) return;
    const qtyInput = document.getElementById('inspQuickRestockQty');
    const qty = Number(qtyInput ? qtyInput.value : 0);
    if (!qty || qty <= 0) {
      App.showToast('Please enter a valid restock quantity', 'error');
      return;
    }
    await this.quickAdjust(this.selectedProduct.id, 'add', qty, `Quick inspector restock of +${qty}`);
  },

  // Global Ctrl+K Modal Live Search Handler
  async handleGlobalModalSearch(query) {
    const resultsContainer = document.getElementById('globalStockSearchResults');
    if (!resultsContainer) return;

    if (!query) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-dim);">
          <i class="fa-solid fa-barcode" style="font-size: 2rem; margin-bottom: 8px;"></i>
          <p>Scan a barcode or type a product name / SKU to instantly check stock</p>
        </div>
      `;
      return;
    }

    try {
      const res = await App.api(`/api/products/check-stock/${encodeURIComponent(query)}`);
      const list = res.products || [];

      if (list.length === 0) {
        resultsContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-dim);">
            <i class="fa-solid fa-circle-question" style="font-size: 1.8rem; margin-bottom: 6px;"></i>
            <p>No products match "${App.escapeHtml(query)}"</p>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = list.map(p => {
        const stock = Number(p.current_stock) || 0;
        const minAlert = Number(p.min_stock_alert) || 5;
        let badgeClass = 'in-stock';
        let badgeText = 'In Stock';
        if (stock === 0) {
          badgeClass = 'out-of-stock';
          badgeText = 'Out of Stock';
        } else if (stock <= minAlert) {
          badgeClass = 'low-stock';
          badgeText = 'Low Stock';
        }

        return `
          <div class="global-stock-result-item" onclick="StockChecker.selectFromGlobalSearch(${p.id})">
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${App.escapeHtml(p.name)}</div>
              <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                <span class="sku-badge">${App.escapeHtml(p.sku)}</span>
                ${p.barcode ? `<span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">${App.escapeHtml(p.barcode)}</span>` : ''}
                <span style="font-size: 0.78rem; color: var(--text-muted);">${App.escapeHtml(p.category_name || '')}</span>
              </div>
            </div>

            <div style="text-align: right; display: flex; align-items: center; gap: 14px;">
              <div>
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.2rem; color: ${stock === 0 ? 'var(--accent-rose)' : stock <= minAlert ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">
                  ${stock} <span style="font-size: 0.75rem;">${App.escapeHtml(p.unit || 'pcs')}</span>
                </div>
                <span class="status-pill ${badgeClass}" style="padding: 2px 8px; font-size: 0.7rem;">${badgeText}</span>
              </div>
              <div style="font-family: var(--font-mono); font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
                ${App.formatCurrency(p.selling_price)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  },

  selectFromGlobalSearch(productId) {
    App.closeModal('quickStockModal');
    this.inspectProduct(productId);
  }
};
