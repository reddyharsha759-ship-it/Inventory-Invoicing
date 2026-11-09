/**
 * FlowStock ERP - Dashboard Analytics & Executive Overview
 */

const Dashboard = {
  topSellingChartInstance: null,
  categoryChartInstance: null,

  async load() {
    try {
      const data = await App.api('/api/dashboard/summary');
      this.renderKPIs(data);
      this.renderLowStockBoard(data.lowStockItems);
      this.renderRecentInvoices(data.recentInvoices);
      this.renderRecentMovements(data.recentMovements);
      this.renderTopSellingChart(data.topSelling);
      this.renderCategoryDistributionChart(data.categoryDistribution);

      // Update sidebar low stock badge
      const lowStockCount = data.stats.low_stock_count || 0;
      const navBadge = document.getElementById('navLowStockBadge');
      if (navBadge) {
        if (lowStockCount > 0) {
          navBadge.textContent = lowStockCount;
          navBadge.style.display = 'inline-block';
        } else {
          navBadge.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  renderKPIs(data) {
    const s = data.stats || {};
    const sym = data.currency_symbol || '$';

    document.getElementById('kpiTotalRevenue').textContent = App.formatCurrency(s.total_sales || 0);
    document.getElementById('kpiInvoicesCount').textContent = `${s.total_invoices || 0} Invoices issued`;

    const grossProfitEl = document.getElementById('kpiGrossProfit');
    if (grossProfitEl) {
      grossProfitEl.textContent = App.formatCurrency(s.gross_profit || 0);
    }
    const marginEl = document.getElementById('kpiProfitMargin');
    if (marginEl) {
      marginEl.textContent = `${s.profit_margin || 0}% Gross Margin`;
    }

    document.getElementById('kpiInventoryValuation').textContent = App.formatCurrency(s.total_inventory_retail || 0);
    document.getElementById('kpiTotalUnits').textContent = `${(s.total_units || 0).toLocaleString()} Total units on hand`;

    document.getElementById('kpiReceivables').textContent = App.formatCurrency(s.outstanding_receivables || 0);
    document.getElementById('kpiPendingCount').textContent = `${s.pending_invoices_count || 0} Pending invoices`;

    document.getElementById('kpiLowStock').textContent = s.low_stock_count || 0;
    const outOfStockEl = document.getElementById('kpiOutOfStockCount');
    if (outOfStockEl) {
      outOfStockEl.textContent = `${s.out_of_stock_count || 0} out of stock`;
    }
  },

  renderLowStockBoard(items) {
    const container = document.getElementById('dashboardLowStockList');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--accent-emerald);">
          <i class="fa-solid fa-circle-check" style="font-size: 2rem; margin-bottom: 8px;"></i>
          <p style="font-size: 0.85rem; font-weight: 600;">All inventory items are well-stocked above threshold!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid rgba(245, 158, 11, 0.2);">
        <div>
          <div style="font-weight: 600; font-size: 0.88rem; margin-bottom: 2px;">${App.escapeHtml(item.name)}</div>
          <span class="sku-badge">${App.escapeHtml(item.sku)}</span>
          <span style="font-size: 0.75rem; color: var(--accent-amber); margin-left: 6px;">Min: ${item.min_stock_alert}</span>
        </div>
        <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
          <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.1rem; color: ${item.current_stock === 0 ? 'var(--accent-rose)' : 'var(--accent-amber)'};">
            ${item.current_stock} <span style="font-size: 0.75rem;">${item.unit}</span>
          </span>
          <button class="btn btn-secondary btn-sm" onclick="Inventory.openStockAdjustModal(${item.id}, '${App.escapeHtml(item.name)}', ${item.current_stock})" style="padding: 4px 8px; font-size: 0.75rem;">
            Restock
          </button>
        </div>
      </div>
    `).join('');
  },

  renderRecentInvoices(invoices) {
    const tbody = document.getElementById('dashboardRecentInvoices');
    if (!tbody) return;

    if (!invoices || invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 20px;">No invoices created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = invoices.map(inv => `
      <tr style="cursor: pointer;" onclick="Invoices.viewInvoice(${inv.id})">
        <td style="font-family: var(--font-mono); font-weight: 600; color: var(--primary);">
          ${App.escapeHtml(inv.invoice_number)}
        </td>
        <td>${App.escapeHtml(inv.customer_name)}</td>
        <td style="font-family: var(--font-mono); font-weight: 700;">${App.formatCurrency(inv.total_amount)}</td>
        <td>
          <span class="status-pill ${inv.status}">${inv.status}</span>
        </td>
      </tr>
    `).join('');
  },

  renderRecentMovements(movements) {
    const tbody = document.getElementById('dashboardRecentMovements');
    if (!tbody) return;

    if (!movements || movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 20px;">No movements logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = movements.map(m => {
      const isPositive = m.quantity_change > 0;
      return `
        <tr>
          <td>
            <div style="font-weight: 600; font-size: 0.85rem;">${App.escapeHtml(m.product_name)}</div>
            <span class="sku-badge">${App.escapeHtml(m.sku)}</span>
          </td>
          <td><span class="status-pill ${m.transaction_type === 'sale' ? 'pending' : 'in-stock'}">${m.transaction_type}</span></td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: ${isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            ${isPositive ? '+' : ''}${m.quantity_change}
          </td>
          <td style="font-family: var(--font-mono); font-weight: 700;">${m.new_stock}</td>
        </tr>
      `;
    }).join('');
  },

  renderTopSellingChart(items) {
    const canvas = document.getElementById('topSellingChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

    const labels = (items && items.length > 0)
      ? items.map(i => i.product_name.length > 18 ? i.product_name.substring(0, 16) + '...' : i.product_name)
      : ['No sales data'];
    const dataValues = (items && items.length > 0) ? items.map(i => i.total_sold) : [0];

    if (this.topSellingChartInstance) {
      this.topSellingChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.85)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.2)');

    this.topSellingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Units Sold',
          data: dataValues,
          backgroundColor: gradient,
          borderColor: '#6366f1',
          borderWidth: 1.5,
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, precision: 0, font: { family: 'JetBrains Mono', size: 10 } }
          }
        }
      }
    });
  },

  renderCategoryDistributionChart(categories) {
    const canvas = document.getElementById('categoryDistributionChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    if (this.categoryChartInstance) {
      this.categoryChartInstance.destroy();
    }

    const labels = (categories && categories.length > 0)
      ? categories.map(c => c.category_name)
      : ['No categories'];
    const values = (categories && categories.length > 0)
      ? categories.map(c => c.total_value)
      : [1];

    const modernPalette = [
      '#6366f1', // Indigo
      '#06b6d4', // Cyan
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ec4899', // Pink
      '#8b5cf6', // Violet
      '#3b82f6'  // Blue
    ];

    const ctx = canvas.getContext('2d');
    this.categoryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: modernPalette.slice(0, labels.length),
          borderColor: isDark ? '#121a2f' : '#ffffff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 10,
              color: textColor,
              font: { family: 'Plus Jakarta Sans', size: 10 }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const val = context.raw || 0;
                return ` ${label}: ${App.formatCurrency(val)}`;
              }
            }
          }
        }
      }
    });
  },

  refreshChart() {
    this.load();
  }
};
