/**
 * FlowStock ERP - Customers Directory & Account Balances Controller
 */

const Customers = {
  customers: [],

  async load() {
    try {
      this.filterCustomers();
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  },

  async filterCustomers() {
    try {
      const search = document.getElementById('customerSearchInput').value;
      let url = '/api/customers';
      if (search) {
        url += `?search=${encodeURIComponent(search)}`;
      }
      this.customers = await App.api(url);
      this.renderTable(this.customers);
    } catch (err) {
      console.error(err);
    }
  },

  renderTable(customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (!customers || customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">No customers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr>
        <td>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${App.escapeHtml(c.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${App.escapeHtml(c.company || 'Individual Client')}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem;"><i class="fa-solid fa-envelope" style="color: var(--text-dim); width: 16px;"></i> ${App.escapeHtml(c.email || '-')}</div>
          <div style="font-size: 0.85rem;"><i class="fa-solid fa-phone" style="color: var(--text-dim); width: 16px;"></i> ${App.escapeHtml(c.phone || '-')}</div>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-dim);">
          ${App.escapeHtml(c.tax_id || '-')}
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 240px;">
          ${App.escapeHtml(c.billing_address || '-')}
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.95rem; color: ${c.outstanding_balance > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">
            ${App.formatCurrency(c.outstanding_balance || 0)}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm btn-icon-only" title="Edit Customer" onclick="Customers.openEditModal(${c.id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-icon-only" title="Delete Customer" onclick="Customers.deleteCustomer(${c.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  async openEditModal(customerId) {
    try {
      const data = await App.api(`/api/customers/${customerId}`);
      const c = data.customer;

      document.getElementById('custEditId').value = c.id;
      document.getElementById('customerModalTitle').textContent = 'Edit Customer Details';
      document.getElementById('custName').value = c.name;
      document.getElementById('custCompany').value = c.company || '';
      document.getElementById('custEmail').value = c.email || '';
      document.getElementById('custPhone').value = c.phone || '';
      document.getElementById('custTaxId').value = c.tax_id || '';
      document.getElementById('custAddress').value = c.billing_address || '';
      document.getElementById('custNotes').value = c.notes || '';

      App.openModal('customerModal');
    } catch (err) {
      console.error(err);
    }
  },

  async saveCustomer(e) {
    e.preventDefault();
    try {
      const editId = document.getElementById('custEditId').value;
      const payload = {
        name: document.getElementById('custName').value,
        company: document.getElementById('custCompany').value,
        email: document.getElementById('custEmail').value,
        phone: document.getElementById('custPhone').value,
        tax_id: document.getElementById('custTaxId').value,
        billing_address: document.getElementById('custAddress').value,
        notes: document.getElementById('custNotes').value
      };

      if (editId) {
        await App.api(`/api/customers/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        App.showToast('Customer record updated successfully!', 'success');
      } else {
        const created = await App.api('/api/customers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        App.showToast(`Customer "${created.name}" created!`, 'success');

        // If user was on the invoice creation view, update customer selector and select new client
        if (App.state.currentTab === 'new-invoice') {
          Invoices.allCustomers.push(created);
          Invoices.populateCustomerSelect();
          document.getElementById('invoiceCustomerSelect').value = created.id;
        }
      }

      App.closeModal('customerModal');
      this.filterCustomers();
    } catch (err) {
      console.error(err);
    }
  },

  async deleteCustomer(customerId) {
    if (!confirm('Are you sure you want to delete this customer record?')) return;
    try {
      const res = await App.api(`/api/customers/${customerId}`, { method: 'DELETE' });
      App.showToast(res.message, 'info');
      this.filterCustomers();
    } catch (err) {
      console.error(err);
    }
  }
};
