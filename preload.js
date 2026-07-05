const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pos', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  // Categories
  getCategories: () => ipcRenderer.invoke('get-categories'),
  addCategory: (name) => ipcRenderer.invoke('add-category', name),
  deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),
  // Products
  getProducts: () => ipcRenderer.invoke('get-products'),
  getProductByBarcode: (bc) => ipcRenderer.invoke('get-product-by-barcode', bc),
  addProduct: (p) => ipcRenderer.invoke('add-product', p),
  updateProduct: (p) => ipcRenderer.invoke('update-product', p),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  updateStock: (data) => ipcRenderer.invoke('update-stock', data),
  getLowStock: () => ipcRenderer.invoke('get-low-stock'),
  // Sales
  completeSale: (data) => ipcRenderer.invoke('complete-sale', data),
  getSales: (range) => ipcRenderer.invoke('get-sales', range),
  getSaleDetail: (id) => ipcRenderer.invoke('get-sale-detail', id),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  // Expenses
  addExpense: (e) => ipcRenderer.invoke('add-expense', e),
  getExpenses: (range) => ipcRenderer.invoke('get-expenses', range),
  // Utilities
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  exportSalesCSV: (range) => ipcRenderer.invoke('export-sales-csv', range),
  printerDiagnostic: () => ipcRenderer.invoke('printer-diagnostic'),
  printerRawTest: () => ipcRenderer.invoke('printer-raw-test'),
  // Cash Drawer
  kickDrawer: () => ipcRenderer.invoke('kick-drawer'),
  testDrawer: () => ipcRenderer.invoke('test-drawer'),
  // Repair History
  getRepairSales: (opts) => ipcRenderer.invoke('get-repair-sales', opts),
  updateSale:        (data)  => ipcRenderer.invoke('update-sale', data),
deleteSale:        (id)    => ipcRenderer.invoke('delete-sale', id),
generateReportPDF: (opts)         => ipcRenderer.invoke('generate-report-pdf', opts),
  deleteAllSales: () => ipcRenderer.invoke('delete-all-sales'),

});