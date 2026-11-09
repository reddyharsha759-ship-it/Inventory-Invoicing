/**
 * FlowStock ERP - Inventory Management Controller
 */

const Inventory = {
  products: [],

  async load() {
    try {
      this.filterProducts();
    } catch (err) {
      console.error('Failed to load inventory:', err);
    }
  },

  async filterProducts() {
    try {
      const search = document.getElementById('inventorySearchInput').value;
      const categoryId = document.getElementById('inventoryCategoryFilter').value;
      const filter = document.getElementById('inventoryStockFilter').value;

      let url = '/api/products?';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryId) params.append('category_id', categoryId);
      if (filter) params.append('filter', filter);

      this.products = await App.api(url + params.toString());
      this.renderTable(this.products);
      if (typeof StockChecker !== 'undefined' && StockChecker.updateMetrics) {
        StockChecker.updateMetrics();
      }
    } catch (err) {
      console.error(err);
    }
  },

  renderTable(products) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    if (!products || products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">No matching products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      let stockStatusClass = 'in-stock';
      let stockStatusText = 'In Stock';
      let dotClass = 'green';

      if (p.current_stock === 0) {
        stockStatusClass = 'out-of-stock';
        stockStatusText = 'Out of Stock';
        dotClass = 'red';
      } else if (p.current_stock <= p.min_stock_alert) {
        stockStatusClass = 'low-stock';
        stockStatusText = 'Low Stock';
        dotClass = 'yellow';
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main);">${App.escapeHtml(p.name)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${App.escapeHtml(p.description || 'No description provided')}
            </div>
          </td>
          <td>
            <span class="sku-badge">${App.escapeHtml(p.sku)}</span><br>
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">${App.escapeHtml(p.barcode || '-')}</span>
          </td>
          <td>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${App.escapeHtml(p.category_name || 'Uncategorized')}</span>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.88rem; color: var(--text-dim);">${App.formatCurrency(p.cost_price)}</td>
          <td style="font-family: var(--font-mono); font-weight: 700; font-size: 0.95rem; color: var(--accent-emerald);">${App.formatCurrency(p.selling_price)}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="stock-indicator-dot ${dotClass}"></span>
              <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem;">${p.current_stock}</span>
              <span style="font-size: 0.78rem; color: var(--text-dim);">${p.unit}</span>
            </div>
          </td>
          <td>
            <span class="status-pill ${stockStatusClass}">${stockStatusText}</span>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn btn-primary btn-sm btn-icon-only" title="Inspect Stock & Movements" onclick="App.inspectStock(${p.id})">
                <i class="fa-solid fa-chart-line"></i>
              </button>
              <button class="btn btn-secondary btn-sm" title="Quick Adjust Stock" onclick="Inventory.openStockAdjustModal(${p.id}, '${App.escapeHtml(p.name)}', ${p.current_stock})">
                <i class="fa-solid fa-layer-group"></i> Adjust
              </button>
              <button class="btn btn-secondary btn-sm btn-icon-only" title="Edit Product" onclick="Inventory.openEditModal(${p.id})">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn btn-danger btn-sm btn-icon-only" title="Delete Product" onclick="Inventory.deleteProduct(${p.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async openEditModal(productId) {
    try {
      const data = await App.api(`/api/products/${productId}`);
      const p = data.product;

      document.getElementById('prodEditId').value = p.id;
      document.getElementById('productModalTitle').textContent = 'Edit Product Details';
      document.getElementById('prodName').value = p.name;
      document.getElementById('prodSku').value = p.sku;
      document.getElementById('prodBarcode').value = p.barcode || '';
      document.getElementById('prodCategory').value = p.category_id || '';
      document.getElementById('prodUnit').value = p.unit || 'pcs';
      document.getElementById('prodCostPrice').value = p.cost_price;
      document.getElementById('prodSellingPrice').value = p.selling_price;
      document.getElementById('prodMinAlert').value = p.min_stock_alert;
      document.getElementById('prodDescription').value = p.description || '';

      // Hide initial stock field when editing existing product (use adjust modal instead)
      document.getElementById('prodStockGroup').style.display = 'none';

      App.openModal('productModal');
    } catch (err) {
      console.error(err);
    }
  },

  async saveProduct(e) {
    e.preventDefault();
    try {
      const editId = document.getElementById('prodEditId').value;
      const payload = {
        name: document.getElementById('prodName').value,
        sku: document.getElementById('prodSku').value,
        barcode: document.getElementById('prodBarcode').value,
        category_id: document.getElementById('prodCategory').value || null,
        unit: document.getElementById('prodUnit').value || 'pcs',
        cost_price: document.getElementById('prodCostPrice').value,
        selling_price: document.getElementById('prodSellingPrice').value,
        current_stock: document.getElementById('prodCurrentStock').value || 0,
        min_stock_alert: document.getElementById('prodMinAlert').value || 5,
        description: document.getElementById('prodDescription').value
      };

      if (editId) {
        await App.api(`/api/products/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        App.showToast('Product updated successfully!', 'success');
      } else {
        await App.api('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        App.showToast('New product added to catalog!', 'success');
      }

      App.closeModal('productModal');
      this.filterProducts();
      Dashboard.load();
    } catch (err) {
      console.error(err);
    }
  },

  openStockAdjustModal(productId, productName, currentQty) {
    document.getElementById('adjustProdId').value = productId;
    document.getElementById('adjustProdName').textContent = productName;
    document.getElementById('adjustCurrentQty').textContent = currentQty;
    document.getElementById('adjustQty').value = '';
    document.getElementById('adjustReason').value = '';
    App.openModal('stockAdjustModal');
  },

  async submitStockAdjustment(e) {
    e.preventDefault();
    try {
      const id = document.getElementById('adjustProdId').value;
      const payload = {
        adjustment_type: document.getElementById('adjustType').value,
        quantity: document.getElementById('adjustQty').value,
        reason: document.getElementById('adjustReason').value
      };

      const res = await App.api(`/api/products/${id}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      App.showToast(res.message, 'success');
      App.closeModal('stockAdjustModal');
      this.filterProducts();
      Dashboard.load();
    } catch (err) {
      console.error(err);
    }
  },

  async deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await App.api(`/api/products/${productId}`, { method: 'DELETE' });
      App.showToast(res.message, 'info');
      this.filterProducts();
      Dashboard.load();
    } catch (err) {
      console.error(err);
    }
  }
};
