const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// ─── Database Setup ───────────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'pos.db');
let db;

function initDatabase() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      barcode     TEXT    UNIQUE,
      category_id INTEGER,
      price       REAL    NOT NULL DEFAULT 0,
      cost        REAL    NOT NULL DEFAULT 0,
      stock       INTEGER NOT NULL DEFAULT 0,
      low_stock   INTEGER NOT NULL DEFAULT 5,
      created_at  TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no   TEXT    NOT NULL UNIQUE,
      subtotal     REAL    NOT NULL,
      discount     REAL    NOT NULL DEFAULT 0,
      tax          REAL    NOT NULL DEFAULT 0,
      total        REAL    NOT NULL,
      payment_method TEXT  DEFAULT 'cash',
      amount_paid  REAL    NOT NULL DEFAULT 0,
      change_due   REAL    NOT NULL DEFAULT 0,
      sale_type    TEXT    DEFAULT 'sale',
      customer_name TEXT   DEFAULT '',
      customer_phone TEXT  DEFAULT '',
      customer_imei TEXT   DEFAULT '',
      customer_fault TEXT  DEFAULT '',
      customer_model TEXT  DEFAULT '',
      created_at   TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id    INTEGER NOT NULL,
      product_id INTEGER,
      name       TEXT    NOT NULL,
      price      REAL    NOT NULL,
      quantity   INTEGER NOT NULL,
      subtotal   REAL    NOT NULL,
      FOREIGN KEY (sale_id)    REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT    NOT NULL,
      amount      REAL    NOT NULL,
      category    TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  // Migrate: make product_id nullable in sale_items for repair charge support
  // SQLite can't ALTER COLUMN, so we recreate the table if product_id is NOT NULL
  try {
    const colInfo = db.pragma('table_info(sale_items)');
    const prodCol = colInfo.find(c => c.name === 'product_id');
    if (prodCol && prodCol.notnull === 1) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE sale_items_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id    INTEGER NOT NULL,
          product_id INTEGER,
          name       TEXT    NOT NULL,
          price      REAL    NOT NULL,
          quantity   INTEGER NOT NULL,
          subtotal   REAL    NOT NULL,
          FOREIGN KEY (sale_id)    REFERENCES sales(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        INSERT INTO sale_items_new SELECT * FROM sale_items;
        DROP TABLE sale_items;
        ALTER TABLE sale_items_new RENAME TO sale_items;
        PRAGMA foreign_keys = ON;
      `);
      console.log('[DB] Migrated sale_items: product_id now nullable');
    }
  } catch(e) {
    console.error('[DB] sale_items migration error:', e.message);
  }

  // Migrate: add new columns to existing sales tables if they don't exist
  const salesCols = db.pragma('table_info(sales)').map(c => c.name);
  if (!salesCols.includes('sale_type'))       db.exec(`ALTER TABLE sales ADD COLUMN sale_type TEXT DEFAULT 'sale'`);
  if (!salesCols.includes('customer_name'))   db.exec(`ALTER TABLE sales ADD COLUMN customer_name TEXT DEFAULT ''`);
  if (!salesCols.includes('customer_phone'))  db.exec(`ALTER TABLE sales ADD COLUMN customer_phone TEXT DEFAULT ''`);
  if (!salesCols.includes('customer_imei'))   db.exec(`ALTER TABLE sales ADD COLUMN customer_imei TEXT DEFAULT ''`);
  if (!salesCols.includes('customer_fault'))  db.exec(`ALTER TABLE sales ADD COLUMN customer_fault TEXT DEFAULT ''`);
  if (!salesCols.includes('customer_model'))  db.exec(`ALTER TABLE sales ADD COLUMN customer_model TEXT DEFAULT ''`);

  // Default settings
  const defaults = {
    shop_name: 'Little Ireland Gadgets',
    shop_address: "10 William St, Prior's-Land, Limerick, V94 FD73",
    shop_phone: '(061) 596 679',
    tax_rate: '0',
    currency: '€',
    receipt_footer: 'Thank you for your purchase!',
    printer_enabled: 'false',
    printer_port: '',
    drawer_enabled: 'true',
    drawer_port: 'COM1'
  };
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

  // Force-update shop name/address/phone in case the DB already existed with old values
  db.prepare(`UPDATE settings SET value = ? WHERE key = 'shop_name'`).run('Little Ireland Gadgets');
  db.prepare(`UPDATE settings SET value = ? WHERE key = 'shop_address'`).run("10 William St, Prior's-Land, Limerick, V94 FD73");
  db.prepare(`UPDATE settings SET value = ? WHERE key = 'shop_phone'`).run('(061) 596 679');

  // Sample category
  db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`).run('General');
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  // mainWindow.webContents.openDevTools(); // uncomment for debugging
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateReceiptNo() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `RCP-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

// ─── VAT Analysis ───────────────────────────────────────────────────────────────
// Rules: Repairs are taxed flat at 13% VAT on the whole job.
// Regular sales are taxed at 23% VAT, EXCEPT items in the "Mobile" category
// (phone purchases), which carry no VAT (second-hand margin scheme).
// Returns an array of { rate, net, vat, total } rows — one row per VAT rate
// that actually applies (zero-rated phone portions are not shown as a row).
const VAT_STANDARD_RATE = 0.23;
const VAT_REPAIR_RATE = 0.13;
function isPhoneCategory(name) {
  const c = String(name || '').toLowerCase().trim();
  return c === 'mobile' || c === 'phone' || c === 'phones';
}
function computeVatAnalysis(sale, items) {
  const isRepair = (sale.sale_type || '').toLowerCase() === 'repair';
  const discount = Number(sale.discount) || 0;

  if (isRepair) {
    const subtotal = Number(sale.subtotal) || 0;
    const net = Math.max(subtotal - discount, 0);
    const vat = net * VAT_REPAIR_RATE;
    return [{ rate: 13, net, vat, total: net + vat }];
  }

  let phoneSub = 0, otherSub = 0;
  for (const i of (items || [])) {
    const amt = Number(i.subtotal != null ? i.subtotal : (i.price * i.quantity)) || 0;
    if (isPhoneCategory(i.category_name || i.category)) phoneSub += amt;
    else otherSub += amt;
  }
  const totalSub = phoneSub + otherSub;
  const discOther = totalSub > 0 ? discount * (otherSub / totalSub) : discount;
  const otherNet = Math.max(otherSub - discOther, 0);
  const vat = otherNet * VAT_STANDARD_RATE;

  const rows = [];
  if (otherNet > 0) rows.push({ rate: 23, net: otherNet, vat, total: otherNet + vat });
  return rows;
}

// ─── Cash Drawer ──────────────────────────────────────────────────────────────
// Sends ESC/POS drawer-kick bytes directly to the COM port using PowerShell.
// The standard kick sequence is: ESC p 0 25 250 (works on virtually all drawers)
function kickCashDrawer(comPort) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    // Write the 5 kick bytes to the COM port via PowerShell
    // ESC=27, p=112, pin=0, on-time=25 (×2ms=50ms), off-time=250 (×2ms=500ms)
    const ps = `
      try {
        $port = New-Object System.IO.Ports.SerialPort '${comPort}',9600,'None',8,'One'
        $port.Open()
        $bytes = [byte[]](27,112,0,25,250)
        $port.Write($bytes, 0, $bytes.Length)
        Start-Sleep -Milliseconds 200
        $port.Close()
        Write-Output 'OK'
      } catch {
        Write-Output ('ERROR: ' + $_.Exception.Message)
      }
    `;
    exec(`powershell -NoProfile -Command "${ps.replace(/\n/g,' ').replace(/"/g, '\\"')}"`,
      { timeout: 5000 },
      (err, stdout) => {
        const out = (stdout || '').trim();
        console.log('[DRAWER] Result:', out || err?.message);
        resolve(out.startsWith('OK'));
      }
    );
  });
}

ipcMain.handle('kick-drawer', async () => {
  const enabled = getSetting('drawer_enabled');
  if (enabled === 'false') return { ok: false, reason: 'disabled' };
  const port = (getSetting('drawer_port') || 'COM1').trim();
  console.log('[DRAWER] Kicking on', port);
  const ok = await kickCashDrawer(port);
  return { ok, port };
});

ipcMain.handle('test-drawer', async () => {
  const port = (getSetting('drawer_port') || 'COM1').trim();
  console.log('[DRAWER] Test kick on', port);
  const ok = await kickCashDrawer(port);
  return { ok, port };
});



// Settings
ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
});
ipcMain.handle('save-settings', (_, data) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(data)) stmt.run(k, String(v));
  return { ok: true };
});

// Categories
ipcMain.handle('get-categories', () => db.prepare('SELECT * FROM categories ORDER BY name').all());
ipcMain.handle('add-category', (_, name) => {
  try {
    const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
    return { ok: true, id: r.lastInsertRowid };
  } catch(e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('delete-category', (_, id) => {
  try {
    // Unlink any products using this category before deleting
    db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

// Products
ipcMain.handle('get-products', () =>
  db.prepare(`SELECT p.*, c.name as category_name FROM products p
              LEFT JOIN categories c ON p.category_id = c.id
              ORDER BY p.name`).all()
);
ipcMain.handle('get-product-by-barcode', (_, barcode) =>
  db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode)
);
ipcMain.handle('add-product', (_, p) => {
  try {
    const r = db.prepare(`INSERT INTO products (name, barcode, category_id, price, cost, stock, low_stock)
      VALUES (@name, @barcode, @category_id, @price, @cost, @stock, @low_stock)`).run(p);
    return { ok: true, id: r.lastInsertRowid };
  } catch(e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('update-product', (_, p) => {
  try {
    db.prepare(`UPDATE products SET name=@name, barcode=@barcode, category_id=@category_id,
      price=@price, cost=@cost, stock=@stock, low_stock=@low_stock WHERE id=@id`).run(p);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('delete-product', (_, id) => {
  try {
    // Disable FK enforcement temporarily so sale history is preserved
    db.pragma('foreign_keys = OFF');
    db.prepare('UPDATE sale_items SET product_id = NULL WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    db.pragma('foreign_keys = ON');
    return { ok: true };
  } catch(e) {
    db.pragma('foreign_keys = ON');
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('update-stock', (_, { id, qty }) => {
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, id);
  return { ok: true };
});
ipcMain.handle('get-low-stock', () =>
  db.prepare('SELECT * FROM products WHERE stock <= low_stock ORDER BY stock ASC').all()
);

// Sales
ipcMain.handle('complete-sale', (_, { items, subtotal, discount, tax, total, payment_method, amount_paid, change_due, sale_type, customer_name, customer_phone, customer_imei, customer_fault, customer_model }) => {
  const receipt_no = generateReceiptNo();
  const insertSale = db.prepare(`INSERT INTO sales (receipt_no,subtotal,discount,tax,total,payment_method,amount_paid,change_due,sale_type,customer_name,customer_phone,customer_imei,customer_fault,customer_model)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare(`INSERT INTO sale_items (sale_id,product_id,name,price,quantity,subtotal)
    VALUES (?,?,?,?,?,?)`);
  const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  const doTransaction = db.transaction(() => {
    const saleId = insertSale.run(receipt_no, subtotal, discount, tax, total, payment_method, amount_paid, change_due,
      sale_type||'sale', customer_name||'', customer_phone||'', customer_imei||'', customer_fault||'', customer_model||'').lastInsertRowid;
    for (const item of items) {
      const productId = (item.id && item.id !== 0) ? item.id : null;
      insertItem.run(saleId, productId, item.name, item.price, item.quantity, item.price * item.quantity);
      if (productId) reduceStock.run(item.quantity, productId);
    }
    return saleId;
  });

  try {
    const saleId = doTransaction();
    return { ok: true, receipt_no, sale_id: saleId };
  } catch(e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-sales', (_, { from, to, type, search }) => {
  let query = `SELECT s.*, GROUP_CONCAT(si.name || ' x' || si.quantity, ', ') as items_summary
    FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE date(s.created_at) BETWEEN ? AND ?`;
  const params = [from, to];
  if (type === 'sale' || type === 'repair') {
    query += ` AND s.sale_type = ?`;
    params.push(type);
  }
  if (search) {
    query += ` AND (s.receipt_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.customer_model LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ` GROUP BY s.id ORDER BY s.created_at DESC`;
  return db.prepare(query).all(...params);
});

ipcMain.handle('get-repair-sales', (_, { from, to, search }) => {
  let query = `SELECT s.*, GROUP_CONCAT(si.name || ' x' || si.quantity, ', ') as items_summary
    FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE s.sale_type = 'repair'`;
  const params = [];
  if (from && to) { query += ` AND date(s.created_at) BETWEEN ? AND ?`; params.push(from, to); }
  if (search) {
    query += ` AND (s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.customer_model LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ` GROUP BY s.id ORDER BY s.created_at DESC`;
  return db.prepare(query).all(...params);
});

ipcMain.handle('get-sale-detail', (_, id) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  const items = db.prepare(`
    SELECT si.*, p.category_id, c.name as category_name
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE si.sale_id = ?
  `).all(id);
  return { sale, items };
});

ipcMain.handle('get-dashboard-stats', () => {
  const today = new Date().toISOString().slice(0,10);
  const todaySales = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE date(created_at) = ?`).get(today);
  const monthSales = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get();
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
  const lowStock = db.prepare('SELECT COUNT(*) as count FROM products WHERE stock <= low_stock').get();
  const recentSales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT 5').all();
  const topProducts = db.prepare(`SELECT si.name, SUM(si.quantity) as total_sold, SUM(si.subtotal) as revenue
    FROM sale_items si GROUP BY si.name ORDER BY total_sold DESC LIMIT 5`).all();
  return { todaySales, monthSales, totalProducts, lowStock, recentSales, topProducts };
});

// Expenses
ipcMain.handle('add-expense', (_, e) => {
  const r = db.prepare('INSERT INTO expenses (description, amount, category) VALUES (?, ?, ?)').run(e.description, e.amount, e.category);
  return { ok: true, id: r.lastInsertRowid };
});
ipcMain.handle('get-expenses', (_, { from, to }) =>
  db.prepare(`SELECT * FROM expenses WHERE date(created_at) BETWEEN ? AND ? ORDER BY created_at DESC`).all(from, to)
);

// ─── Star TSP143IIIU ESC/POS buffer builder ──────────────────────────────────
// The Star TSP100 series uses StarPRNT / ESC/POS commands.
// Cut command: ESC d n (feed n lines) then ESC m (partial cut) or ESC p (full cut)
// Star's USB on Windows works via their own driver + raw port writes (copy /b)
function buildReceiptBuffer(sale, items, settings) {
  const ESC = 0x1B, LF = 0x0A;
  const currency = settings.currency || '€';
  const enc = (s) => Buffer.from(String(s) + '\n', 'ascii');
  const cmd = (...bytes) => Buffer.from(bytes);

  const chunks = [
    cmd(ESC, 0x40),                    // ESC @ — initialize printer
    cmd(ESC, 0x61, 0x01),              // ESC a 1 — centre align
    cmd(ESC, 0x21, 0x10),              // ESC ! — double height
    enc(settings.shop_name || ''),
    cmd(ESC, 0x21, 0x00),              // ESC ! — normal size
    enc(settings.shop_address || ''),
    enc(settings.shop_phone || ''),
    enc('--------------------------------'),
    enc('Receipt: ' + sale.receipt_no),
    enc('Date: ' + new Date(sale.created_at).toLocaleString()),
    enc('--------------------------------'),
    cmd(ESC, 0x61, 0x00),              // left align
  ];

  for (const item of items) {
    const name  = String(item.name).substring(0, 20).padEnd(20);
    const qty   = String(item.quantity).padStart(2);
    const price = currency + Number(item.price).toFixed(2);
    const sub   = currency + Number(item.subtotal).toFixed(2);
    chunks.push(enc(name + ' ' + qty + ' x ' + price));
    chunks.push(enc('  = ' + sub));
  }

  chunks.push(
    enc('--------------------------------'),
    enc('Subtotal: ' + currency + Number(sale.subtotal).toFixed(2)),
    enc('Discount: ' + currency + Number(sale.discount).toFixed(2)),
    enc('Tax:      ' + currency + Number(sale.tax).toFixed(2)),
    cmd(ESC, 0x21, 0x10),              // double height for total
    enc('TOTAL:    ' + currency + Number(sale.total).toFixed(2)),
    cmd(ESC, 0x21, 0x00),              // normal size
    enc('Paid:     ' + currency + Number(sale.amount_paid).toFixed(2)),
    enc('Change:   ' + currency + Number(sale.change_due).toFixed(2)),
    enc('--------------------------------'),
    cmd(ESC, 0x61, 0x01),              // centre align
    enc(settings.receipt_footer || 'Thank you!'),
    // Star TSP100 cut sequence:
    // ESC d 3 — feed 3 lines, then ESC m — partial cut (leaves small tab)
    cmd(ESC, 0x64, 0x03),              // ESC d 3 — feed 3 lines
    cmd(ESC, 0x6D),                    // ESC m   — partial cut (Star command)
  );

  return Buffer.concat(chunks);
}

// ─── Windows GDI printing via PowerShell Out-Printer ─────────────────────────
// The Star TSP143IIIU uses a Windows GDI driver. Raw byte writes (copy /b)
// are ignored. We must use PowerShell Out-Printer which goes through the
// proper Windows print spooler with the Star driver.
// ─── Receipt HTML builder ────────────────────────────────────────────────────
function buildReceiptHTML(sale, items, settings) {
  const cur = settings.currency || '€';
  const fmt = (n) => cur + Number(n).toFixed(2);
  const esc = (s) => String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const isRepair = (sale.sale_type || '').toLowerCase() === 'repair';

  // Detect if any item is in the Mobile category
  const hasMobileOrRepair = isRepair || items.some(i => {
    const cat = String(i.category_name || i.category || '').toLowerCase().trim();
    return cat === 'mobile' || cat === 'repair';
  });

  const itemRows = items.map(item => `
    <tr>
      <td class="name">${esc(item.name)}</td>
      <td class="qty">${item.quantity}</td>
      <td class="price">${fmt(item.price)}</td>
      <td class="sub">${fmt(item.subtotal)}</td>
    </tr>`).join('');

  const discountRow = Number(sale.discount) > 0
    ? `<tr><td colspan="3" class="tlabel">Discount</td><td class="tval">${fmt(sale.discount)}</td></tr>` : '';
  const taxRow = Number(sale.tax) > 0
    ? `<tr><td colspan="3" class="tlabel">Tax</td><td class="tval">${fmt(sale.tax)}</td></tr>` : '';

  // Customer info section (multiple IMEIs are stored comma-separated)
  const imeiList = (sale.customer_imei || '').split(',').map(s => s.trim()).filter(Boolean);
  const customerSection = (sale.customer_name || sale.customer_phone) ? `
  <hr/>
  <div class="customer-section">
    ${sale.customer_name  ? `<div class="customer-line"><span class="customer-label">Customer:</span> ${esc(sale.customer_name)}</div>` : ''}
    ${sale.customer_phone ? `<div class="customer-line"><span class="customer-label">Phone:</span> ${esc(sale.customer_phone)}</div>` : ''}
    ${sale.customer_model ? `<div class="customer-line"><span class="customer-label">Model:</span> ${esc(sale.customer_model)}</div>` : ''}
    ${isRepair && sale.customer_fault ? `<div class="customer-line"><span class="customer-label">Fault:</span> ${esc(sale.customer_fault)}</div>` : ''}
    ${!isRepair && imeiList.length === 1 ? `<div class="customer-line"><span class="customer-label">IMEI:</span> ${esc(imeiList[0])}</div>` : ''}
    ${!isRepair && imeiList.length > 1 ? `<div class="customer-line"><span class="customer-label">IMEIs:</span> ${imeiList.map(esc).join(', ')}</div>` : ''}
  </div>` : '';

  const tncSection = `
  <hr/>
  <div class="tnc-section">
    <div class="tnc-title">TERMS &amp; CONDITIONS</div>
    <ol class="tnc-list">
      <li>Purchased phones can be returned within 14 days if in the same condition.</li>
      <li>We are not responsible for physical/water damage.</li>
    </ol>
  </div>`;

  // IMEI blank line only for non-repair mobile items with no IMEI captured yet
  const imeiSection = (!isRepair && hasMobileOrRepair && imeiList.length === 0) ? `
  <hr/>
  <div class="imei-section">
    <div class="imei-line">IMEI: ______________________________</div>
  </div>` : '';

  // VAT Analysis
  const vatRows = computeVatAnalysis(sale, items);
  const vatSection = vatRows.length ? `
  <hr/>
  <div class="vat-section">
    <div class="tnc-title">VAT ANALYSIS</div>
    ${vatRows.map(r => `<div class="vat-row">Rate:${r.rate}%  Net ${fmt(r.net)}   VAT ${fmt(r.vat)}   Total ${fmt(r.total)}</div>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    width: 100%;
    padding: 4px 6px;
    color: #000;
    background: #fff;
  }

  /* ── HEADER ── */
  .header {
    text-align: center;
    padding-bottom: 5px;
  }
  .shop-name {
    font-size: 15px;
    font-weight: bold;
    margin-bottom: 2px;
    line-height: 1.2;
  }
  .shop-info {
    font-size: 10px;
    line-height: 1.5;
  }

  /* ── DIVIDER ── */
  hr {
    border: none;
    border-top: 1px dashed #000;
    margin: 5px 0;
  }
  hr.thick {
    border-top: 1px solid #000;
    margin: 4px 0;
  }

  /* ── META (receipt no / date) ── */
  .meta {
    font-size: 10px;
    line-height: 1.6;
    padding: 2px 0;
  }

  /* ── CUSTOMER INFO ── */
  .customer-section {
    padding: 3px 0;
  }
  .customer-line {
    font-size: 10px;
    line-height: 1.5;
  }
  .customer-label {
    font-weight: bold;
  }

  /* ── ITEMS TABLE ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 3px 0;
  }
  thead th {
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 3px 2px;
    border-bottom: 1px solid #000;
  }
  thead th.r { text-align: right; }
  thead th.l { text-align: left; }

  tbody td {
    font-size: 11px;
    padding: 4px 2px;
    border-bottom: 1px dotted #bbb;
    vertical-align: top;
    line-height: 1.3;
  }
  td.name  { width: 40%; font-weight: 500; word-break: break-word; }
  td.qty   { width: 8%;  text-align: right; }
  td.price { width: 25%; text-align: right; }
  td.sub   { width: 27%; text-align: right; font-weight: bold; }

  /* ── TOTALS ── */
  .totals { margin-top: 2px; }
  .totals table td {
    font-size: 11px;
    padding: 3px 2px;
    border-bottom: none;
    line-height: 1.3;
  }
  .tlabel { }
  .tval   { text-align: right; }

  .total-row td {
    font-size: 13px !important;
    font-weight: bold !important;
    padding: 4px 2px !important;
    border-top: 1px solid #000 !important;
    border-bottom: 1px solid #000 !important;
  }

  /* ── IMEI & T&C ── */
  .imei-section {
    padding: 3px 0;
  }
  .imei-line {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.3px;
  }
  .tnc-section {
    padding: 3px 0;
  }
  .tnc-title {
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .tnc-list {
    font-size: 12px;
    line-height: 1.4;
    padding-left: 10px;
    color: #222;
  }
  .tnc-list li {
    margin-bottom: 1px;
  }

  /* ── VAT ANALYSIS ── */
  .vat-section {
    padding: 3px 0;
  }
  .vat-row {
    font-size: 10px;
    font-family: 'Courier New', monospace;
    white-space: pre;
    line-height: 1.5;
  }

  /* ── FOOTER ── */
  .footer {
    text-align: center;
    font-size: 10px;
    font-style: italic;
    padding: 5px 0 3px;
    line-height: 1.4;
  }

  @media print {
    @page { margin: 0; }
    html, body { width: 100%; }
  }
</style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div class="shop-name">${esc(settings.shop_name)}</div>
    <div class="shop-info">
      ${esc(settings.shop_address)}<br>
      Tel: ${esc(settings.shop_phone)}<br>
      VAT: IE3989701FH
    </div>
  </div>

  <hr/>

  <!-- RECEIPT INFO -->
  <div class="meta">
    <strong>Receipt:</strong> ${esc(sale.receipt_no)}<br>
    <strong>Date:</strong> ${new Date(sale.created_at).toLocaleString()}${isRepair ? '<br><strong>Type:</strong> Repair Job' : ''}<br>
    <strong>Payment:</strong> ${esc((sale.payment_method || 'cash').toUpperCase())}
  </div>

  <hr/>

  <!-- ITEMS -->
  <table>
    <thead>
      <tr>
        <th class="l">Item</th>
        <th class="r">Qty</th>
        <th class="r">Price</th>
        <th class="r">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr/>

  <!-- TOTALS -->
  <div class="totals">
    <table>
      <tr><td class="tlabel">Subtotal</td><td class="tval">${fmt(sale.subtotal)}</td></tr>
      ${discountRow}
      ${taxRow}
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      <tr><td class="tlabel">Paid</td><td class="tval">${fmt(sale.amount_paid)}</td></tr>
      <tr><td class="tlabel">Change</td><td class="tval">${fmt(sale.change_due)}</td></tr>
    </table>
  </div>

  ${vatSection}

  ${tncSection}

  ${imeiSection}

  ${customerSection}

  <hr/>

  <!-- FOOTER -->
  <div class="footer">
    ${esc(settings.receipt_footer || 'Thank you for your purchase!')}
  </div>

</body>
</html>`;
}


// ─── Electron silent print via hidden BrowserWindow ───────────────────────────
function printReceiptHTML(html, printerName) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 400, height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const tmpFile = path.join(app.getPath('temp'), 'receipt_' + Date.now() + '.html');
    fs.writeFileSync(tmpFile, html, 'utf8');

    win.loadFile(tmpFile);

    win.webContents.once('did-finish-load', () => {
      // Small delay to ensure CSS is applied
      setTimeout(() => {
        win.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: printerName,
          pageSize: { width: 71000, height: 2000000 }, // 71mm wide, very long for any receipt
          margins: { marginType: 'none' },
          scaleFactor: 100,
        }, (success, errorType) => {
          try { win.close(); } catch(_) {}
          try { fs.unlinkSync(tmpFile); } catch(_) {}
          console.log('[PRINT] Electron print result:', success, errorType);
          if (success) resolve();
          else reject(new Error('Print failed: ' + errorType));
        });
      }, 1000);
    });

    win.webContents.once('did-fail-load', (e, code, desc) => {
      try { win.close(); } catch(_) {}
      reject(new Error('Failed to load receipt HTML: ' + desc));
    });
  });
}

// Print Receipt
ipcMain.handle('print-receipt', async (_, { sale, items, settings }) => {
  if (settings.printer_enabled !== 'true') {
    return { ok: false, error: 'Thermal printer is disabled. Enable it in Settings first.' };
  }
  const printerName = (settings.printer_port || getSetting('printer_port') || 'Star TSP100 Cutter (TSP143)').trim();
  console.log('[PRINT] Printer:', printerName);
  try {
    const html = buildReceiptHTML(sale, items, settings);
    await printReceiptHTML(html, printerName);
    return { ok: true };
  } catch(e) {
    console.error('[PRINT] Error:', e.message);
    return { ok: false, error: e.message };
  }
});


// Raw port test
ipcMain.handle('printer-raw-test', async () => {
  const steps = [];
  const pass = (msg) => { steps.push({ ok: true,  msg }); console.log('[RAW] OK:', msg); };
  const fail = (msg) => { steps.push({ ok: false, msg }); console.log('[RAW] FAIL:', msg); };

  try {
    const printerName = (getSetting('printer_port') || 'Star TSP100 Cutter (TSP143)').trim();
    pass('Printer: ' + printerName);

    const testHTML = buildReceiptHTML(
      {
        receipt_no: 'TEST-001',
        created_at: new Date().toISOString(),
        subtotal: 10.00, discount: 0, tax: 0, total: 10.00,
        amount_paid: 10.00, change_due: 0
      },
      [{ name: 'Test Product', quantity: 1, price: 10.00, subtotal: 10.00 }],
      { shop_name: 'PRINTER TEST', shop_address: 'Test Address', shop_phone: '000',
        currency: 'E', receipt_footer: 'Test print successful!' }
    );
    pass('HTML receipt built — printing via Electron...');
    await printReceiptHTML(testHTML, printerName);
    pass('Sent to "' + printerName + '" — paper should have printed!');

  } catch (e) {
    fail('Error: ' + e.message);
    console.error('[RAW]', e);
  }

  return { steps };
});


// Printer Diagnostics
ipcMain.handle('printer-diagnostic', async () => {
  const steps = [];
  const pass = (msg) => { steps.push({ ok: true,  msg }); console.log('[DIAG] OK:', msg); };
  const fail = (msg) => { steps.push({ ok: false, msg }); console.log('[DIAG] FAIL:', msg); };

  let escpos;
  try {
    escpos = require('escpos');
    pass('escpos module loaded');
  } catch (e) {
    fail('escpos module missing: ' + e.message + ' -- run: npm install escpos escpos-usb');
    return { steps };
  }

  try {
    const usbModule = require('usb');
    if (!usbModule.on && usbModule.usb && usbModule.usb.on) {
      usbModule.on = usbModule.usb.on.bind(usbModule.usb);
      usbModule.removeAllListeners = usbModule.usb.removeAllListeners.bind(usbModule.usb);
    }
    pass('usb module loaded');
  } catch (e) {
    fail('usb module error: ' + e.message);
    return { steps };
  }

  try {
    escpos.USB = require('escpos-usb');
    pass('escpos-usb module loaded');
  } catch (e) {
    fail('escpos-usb missing: ' + e.message + ' -- run: npm install escpos escpos-usb');
    return { steps };
  }

  let printers = [];
  try {
    printers = escpos.USB.findPrinter();
    if (printers && printers.length > 0) {
      printers.forEach((p, i) => {
        const vid = '0x' + ((p.deviceDescriptor && p.deviceDescriptor.idVendor)  || p.idVendor  || 0).toString(16).padStart(4,'0');
        const pid = '0x' + ((p.deviceDescriptor && p.deviceDescriptor.idProduct) || p.idProduct || 0).toString(16).padStart(4,'0');
        pass('USB printer #' + (i+1) + ' found -- VID:' + vid + ' PID:' + pid);
      });
    } else {
      fail('No USB printers detected. Check cable + power. On Windows install WinUSB via Zadig. On Linux: sudo usermod -a -G plugdev $USER');
      return { steps };
    }
  } catch (e) {
    fail('findPrinter() error: ' + e.message);
    return { steps };
  }

  let device;
  try {
    device = new escpos.USB();
    pass('USB device object created');
  } catch (e) {
    fail('new escpos.USB() failed: ' + e.message);
    return { steps };
  }

  await new Promise((resolve) => {
    device.open((openErr) => {
      if (openErr) {
        let hint = '';
        if (openErr.message.includes('ACCESS')) hint = ' --> On Linux: sudo usermod -a -G plugdev $USER then re-login';
        if (openErr.message.includes('NOT_FOUND') || openErr.message.includes('WinUSB')) hint = ' --> On Windows: install WinUSB via https://zadig.akeo.ie';
        fail('device.open() failed: ' + openErr.message + hint);
        return resolve();
      }
      pass('USB device opened successfully');

      try {
        const printer = new escpos.Printer(device);
        printer
          .align('CT')
          .size(1, 1)
          .text('*** PRINTER TEST ***')
          .size(0, 0)
          .text('If you see this, it works!')
          .text(new Date().toLocaleString())
          .feed(4)
          .cut()
          .close((closeErr) => {
            if (closeErr) fail('printer.close() error: ' + closeErr.message);
            else pass('Test page sent to printer successfully');
            resolve();
          });
      } catch (e2) {
        fail('Error building test page: ' + e2.message);
        resolve();
      }
    });
  });

  return { steps };
});

// Update Sale
ipcMain.handle('delete-sale', (_, id) => {
  try {
    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
    db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

// Delete ALL sales/repair history records
ipcMain.handle('delete-all-sales', () => {
  try {
    const doTx = db.transaction(() => {
      db.prepare('DELETE FROM sale_items').run();
      db.prepare('DELETE FROM sales').run();
    });
    doTx();
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

// Update Sale
ipcMain.handle('update-sale', (_, { id, discount, tax, total, amount_paid, change_due, items, sale_type, customer_name, customer_phone, customer_imei, customer_fault, customer_model }) => {
  try {
    const updateSale = db.prepare(`UPDATE sales SET discount=?, tax=?, total=?, amount_paid=?, change_due=?,
      sale_type=?, customer_name=?, customer_phone=?, customer_imei=?, customer_fault=?, customer_model=? WHERE id=?`);
    const deleteItems = db.prepare('DELETE FROM sale_items WHERE sale_id = ?');
    const insertItem = db.prepare(`INSERT INTO sale_items (sale_id, product_id, name, price, quantity, subtotal) VALUES (?,?,?,?,?,?)`);

    const doTx = db.transaction(() => {
      updateSale.run(discount, tax, total, amount_paid, change_due,
        sale_type||'sale', customer_name||'', customer_phone||'', customer_imei||'', customer_fault||'', customer_model||'', id);
      deleteItems.run(id);
      for (const item of items) {
        const productId = (item.product_id || item.id) || null;
        const safeProductId = (productId && productId !== 0) ? productId : null;
        insertItem.run(id, safeProductId, item.name, item.price, item.quantity, item.price * item.quantity);
      }
    });
    doTx();
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

// Generate Sales Report PDF
ipcMain.handle('generate-report-pdf', async (_, { from, to, period }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `little-ireland-gadgets-report-${period}-${from}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (!filePath) return { ok: false };

  const sales = db.prepare(`
    SELECT s.*, GROUP_CONCAT(si.name || ' x' || si.quantity, ', ') as items_summary
    FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE date(s.created_at) BETWEEN ? AND ?
    GROUP BY s.id ORDER BY s.created_at ASC
  `).all(from, to);

  const allItems = db.prepare(`
    SELECT si.*, p.category_id, p.cost, c.name as category_name
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE date(s.created_at) BETWEEN ? AND ?
  `).all(from, to);

  const topProducts = db.prepare(`
    SELECT si.name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE date(s.created_at) BETWEEN ? AND ?
    GROUP BY si.name ORDER BY revenue DESC LIMIT 10
  `).all(from, to);

  const expenses = db.prepare(`
    SELECT * FROM expenses WHERE date(created_at) BETWEEN ? AND ? ORDER BY created_at ASC
  `).all(from, to);

  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
  const currency = settings.currency || '€';
  const fmt = n => currency + Number(n).toFixed(2);

  const totalRevenue = sales.reduce((s, r) => s + r.total, 0);
  const totalDiscount = sales.reduce((s, r) => s + r.discount, 0);
  const totalTax = sales.reduce((s, r) => s + r.tax, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Group sales by day
  const byDay = {};
  for (const s of sales) {
    const day = s.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
    byDay[day].count++;
    byDay[day].total += s.total;
  }

  const periodLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[period] || 'Custom';

  const salesRows = sales.map(s => `
    <tr>
      <td>${s.receipt_no}</td>
      <td>${new Date(s.created_at).toLocaleString()}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.items_summary || '-'}</td>
      <td class="r">${fmt(s.subtotal)}</td>
      <td class="r red">${s.discount > 0 ? '-'+fmt(s.discount) : '-'}</td>
      <td class="r">${fmt(s.total)}</td>
    </tr>`).join('');

  const topRows = topProducts.map((p, i) => `
    <tr>
      <td class="c">${i+1}</td>
      <td>${p.name}</td>
      <td class="r">${p.qty}</td>
      <td class="r accent">${fmt(p.revenue)}</td>
    </tr>`).join('');

  const dailyRows = Object.entries(byDay).map(([d, v]) => `
    <tr>
      <td>${new Date(d).toLocaleDateString('en-GB', {weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</td>
      <td class="r">${v.count}</td>
      <td class="r accent">${fmt(v.total)}</td>
    </tr>`).join('');

  const expenseRows = expenses.length ? expenses.map(e => `
    <tr>
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td>${e.description}</td>
      <td>${e.category || 'General'}</td>
      <td class="r red">${fmt(e.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="c muted">No expenses recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
  }
  .page { padding: 32px 36px; max-width: 900px; margin: 0 auto; }

  /* Cover Header */
  .report-header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);
    color: #fff;
    padding: 32px 36px 24px;
    margin: -0px -0px 28px;
  }
  .rh-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .shop-name { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #fff; }
  .shop-sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 3px; letter-spacing: 1px; text-transform: uppercase; }
  .report-badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    padding: 8px 16px;
    text-align: right;
  }
  .report-badge .period { font-size: 13px; font-weight: 700; color: #4ecdc4; }
  .report-badge .dates { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 2px; }
  .rh-divider { border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 12px 0; }
  .rh-bottom { display: flex; gap: 6px; }
  .rh-meta { font-size: 10px; color: rgba(255,255,255,0.5); }
  .accent { color: #4ecdc4; }
  .red { color: #e74c3c; }
  .green { color: #27ae60; }

  /* KPI Cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi-card {
    border: 1px solid #e8ecf0;
    border-radius: 8px;
    padding: 14px 16px;
    position: relative;
    overflow: hidden;
  }
  .kpi-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--accent-color, #4ecdc4);
  }
  .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600; }
  .kpi-value { font-size: 20px; font-weight: 800; margin: 4px 0 2px; color: var(--accent-color, #1a1a2e); }
  .kpi-sub { font-size: 9px; color: #aaa; }

  /* Section */
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
    color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 6px; margin-bottom: 12px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .section-title span { font-weight: 400; font-size: 10px; color: #888; text-transform: none; letter-spacing: 0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead tr { background: #f5f7fa; }
  thead th {
    padding: 8px 10px; text-align: left; font-size: 9px;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    color: #666; border-bottom: 1px solid #dde3e9;
  }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #f0f2f5; color: #333; vertical-align: middle; }
  tbody td.r { text-align: right; font-weight: 600; }
  tbody td.c { text-align: center; }
  tbody td.muted { color: #aaa; }
  tbody tr:hover { background: #fafbfc; }
  tbody tr:last-child td { border-bottom: none; }

  /* Summary row */
  .sum-row td { font-weight: 800 !important; background: #f5f7fa !important; border-top: 2px solid #dde3e9 !important; }

  /* P&L box */
  .pl-box {
    border: 1px solid #e8ecf0; border-radius: 8px; padding: 16px 20px;
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px;
  }
  .pl-item { text-align: center; }
  .pl-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600; }
  .pl-val { font-size: 18px; font-weight: 800; margin-top: 4px; }

  /* Footer */
  .report-footer {
    margin-top: 32px; padding-top: 12px; border-top: 1px solid #e8ecf0;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: #bbb;
  }

  @media print {
    @page { margin: 0; size: A4; }
    body { font-size: 11px; }
    .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kpi-card::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="report-header">
  <div class="rh-top">
    <div>
      <div class="shop-name">${settings.shop_name || 'Little Ireland Gadgets'}</div>
      <div class="shop-sub">Sales Report &nbsp;·&nbsp; ${settings.shop_address || ''}</div>
    </div>
    <div class="report-badge">
      <div class="period">${periodLabel} Report</div>
      <div class="dates">${from} &rarr; ${to}</div>
    </div>
  </div>
  <hr class="rh-divider"/>
  <div class="rh-meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${sales.length} transactions in period</div>
</div>

<div class="page">

<!-- KPI CARDS -->
<div class="kpi-grid">
  <div class="kpi-card" style="--accent-color:#4ecdc4">
    <div class="kpi-label">Total Revenue</div>
    <div class="kpi-value" style="color:#4ecdc4">${fmt(totalRevenue)}</div>
    <div class="kpi-sub">${sales.length} sales</div>
  </div>
  <div class="kpi-card" style="--accent-color:#e67e22">
    <div class="kpi-label">Total Discounts</div>
    <div class="kpi-value" style="color:#e67e22">${fmt(totalDiscount)}</div>
    <div class="kpi-sub">applied to sales</div>
  </div>
  <div class="kpi-card" style="--accent-color:#e74c3c">
    <div class="kpi-label">Total Expenses</div>
    <div class="kpi-value" style="color:#e74c3c">${fmt(totalExpenses)}</div>
    <div class="kpi-sub">recorded expenses</div>
  </div>
  <div class="kpi-card" style="--accent-color:#27ae60">
    <div class="kpi-label">Net (Revenue − Expenses)</div>
    <div class="kpi-value" style="color:${(totalRevenue - totalExpenses) >= 0 ? '#27ae60' : '#e74c3c'}">${fmt(totalRevenue - totalExpenses)}</div>
    <div class="kpi-sub">revenue minus expenses</div>
  </div>
</div>

<!-- SUMMARY -->
<div class="section">
  <div class="section-title">Summary</div>
  <div class="pl-box" style="grid-template-columns:1fr 1fr 1fr">
    <div class="pl-item">
      <div class="pl-label">Total Revenue</div>
      <div class="pl-val accent">${fmt(totalRevenue)}</div>
    </div>
    <div class="pl-item">
      <div class="pl-label">Other Expenses</div>
      <div class="pl-val red">${fmt(totalExpenses)}</div>
    </div>
    <div class="pl-item">
      <div class="pl-label">Net (Revenue − Expenses)</div>
      <div class="pl-val" style="color:${(totalRevenue - totalExpenses) >= 0 ? '#27ae60' : '#e74c3c'}">${fmt(totalRevenue - totalExpenses)}</div>
    </div>
  </div>
</div>

<!-- DAILY BREAKDOWN -->
<div class="section">
  <div class="section-title">Daily Breakdown <span>${Object.keys(byDay).length} days with sales</span></div>
  <table>
    <thead><tr>
      <th>Date</th><th class="r">Transactions</th><th class="r">Revenue</th>
    </tr></thead>
    <tbody>
      ${dailyRows || '<tr><td colspan="3" class="c muted">No sales in this period</td></tr>'}
      ${Object.keys(byDay).length > 1 ? `<tr class="sum-row"><td><strong>TOTAL</strong></td><td class="r">${sales.length}</td><td class="r accent">${fmt(totalRevenue)}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<!-- TOP PRODUCTS -->
<div class="section">
  <div class="section-title">Top Products <span>by revenue</span></div>
  <table>
    <thead><tr>
      <th class="c">#</th><th>Product Name</th><th class="r">Units Sold</th><th class="r">Revenue</th>
    </tr></thead>
    <tbody>
      ${topRows || '<tr><td colspan="4" class="c muted">No items sold</td></tr>'}
    </tbody>
  </table>
</div>

<!-- ALL TRANSACTIONS -->
<div class="section">
  <div class="section-title">All Transactions <span>${sales.length} records</span></div>
  <table>
    <thead><tr>
      <th>Receipt No</th><th>Date & Time</th><th>Items</th>
      <th class="r">Subtotal</th><th class="r">Discount</th><th class="r">Total</th>
    </tr></thead>
    <tbody>
      ${salesRows || '<tr><td colspan="6" class="c muted">No sales in this period</td></tr>'}
      ${sales.length > 0 ? `<tr class="sum-row">
        <td colspan="3"><strong>PERIOD TOTAL</strong></td>
        <td class="r">${fmt(sales.reduce((s,r)=>s+r.subtotal,0))}</td>
        <td class="r red">${totalDiscount > 0 ? '-'+fmt(totalDiscount) : '-'}</td>
        <td class="r accent">${fmt(totalRevenue)}</td>
      </tr>` : ''}
    </tbody>
  </table>
</div>

<!-- EXPENSES -->
<div class="section">
  <div class="section-title">Expenses <span>${expenses.length} records · Total: ${fmt(totalExpenses)}</span></div>
  <table>
    <thead><tr>
      <th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>${expenseRows}</tbody>
  </table>
</div>

<!-- FOOTER -->
<div class="report-footer">
  <span>${settings.shop_name || 'Little Ireland Gadgets'} &nbsp;·&nbsp; ${settings.shop_address || ''} &nbsp;·&nbsp; ${settings.shop_phone || ''}</span>
  <span>Generated ${new Date().toLocaleString()}</span>
</div>

</div>
</body>
</html>`;

  // Use Electron to print the HTML to PDF
  const win2 = new BrowserWindow({ width: 900, height: 1200, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const tmpHtml = path.join(app.getPath('temp'), 'report_' + Date.now() + '.html');
  fs.writeFileSync(tmpHtml, html, 'utf8');

  return new Promise((resolve) => {
    win2.loadFile(tmpHtml);
    win2.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const pdfData = await win2.webContents.printToPDF({
            marginsType: 0,
            pageSize: 'A4',
            printBackground: true,
            landscape: false,
          });
          fs.writeFileSync(filePath, pdfData);
          try { win2.close(); } catch(_) {}
          try { fs.unlinkSync(tmpHtml); } catch(_) {}
          resolve({ ok: true, filePath });
        } catch(e) {
          try { win2.close(); } catch(_) {}
          resolve({ ok: false, error: e.message });
        }
      }, 800);
    });
    win2.webContents.once('did-fail-load', () => {
      try { win2.close(); } catch(_) {}
      resolve({ ok: false, error: 'Failed to load report HTML' });
    });
  });
});

// Export CSV
ipcMain.handle('export-sales-csv', async (_, { from, to }) => {
  const sales = db.prepare(`SELECT s.receipt_no, s.created_at, s.subtotal, s.discount, s.tax, s.total,
    s.payment_method, s.amount_paid FROM sales s WHERE date(s.created_at) BETWEEN ? AND ?
    ORDER BY s.created_at DESC`).all(from, to);
  
  const { filePath } = await dialog.showSaveDialog({ defaultPath: `sales-${from}-${to}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (!filePath) return { ok: false };
  
  const header = 'Receipt No,Date,Subtotal,Discount,Tax,Total,Payment,Amount Paid\n';
  const rows = sales.map(s => `${s.receipt_no},${s.created_at},${s.subtotal},${s.discount},${s.tax},${s.total},${s.payment_method},${s.amount_paid}`).join('\n');
  fs.writeFileSync(filePath, header + rows);
  return { ok: true, filePath };
});