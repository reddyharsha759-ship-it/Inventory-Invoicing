/**
 * FlowStock ERP - Bulk Excel / CSV Import & Export Controller
 */

const ImportExport = {
  selectedFile: null,

  init() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'rgba(99, 102, 241, 0.08)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = 'var(--border-subtle)';
        dropZone.style.background = 'transparent';
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        this.processFile(files[0]);
      }
    });
  },

  onFileSelected(input) {
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  },

  processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      App.showToast('Please upload an Excel (.xlsx, .xls) or CSV file only', 'error');
      return;
    }

    this.selectedFile = file;
    const dropText = document.getElementById('dropZoneFileName');
    dropText.innerHTML = `<b style="color: var(--accent-emerald);"><i class="fa-solid fa-file-excel"></i> ${App.escapeHtml(file.name)}</b> (${(file.size / 1024).toFixed(1)} KB ready)`;
    document.getElementById('btnUploadSubmit').disabled = false;
  },

  async handleProductImport(e) {
    e.preventDefault();
    if (!this.selectedFile) {
      App.showToast('Please select a spreadsheet file first', 'error');
      return;
    }

    const btn = document.getElementById('btnUploadSubmit');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Spreadsheet...';

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      const res = await fetch('/api/import/products', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      App.showToast(data.message, 'success');

      // Reset file input
      this.selectedFile = null;
      document.getElementById('importFileInput').value = '';
      document.getElementById('dropZoneFileName').textContent = 'Supports .xlsx, .xls, .csv';
      btn.disabled = true;

      // Refresh Inventory, Categories, and Dashboard
      await App.loadInitialData();
      if (typeof Inventory !== 'undefined') {
        Inventory.filterProducts();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      btn.innerHTML = originalText;
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  ImportExport.init();
});
