// ── State ─────────────────────────────────────────────────────────────────────
let settings = {};
let cart = [];
let products = [];
let categories = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  settings = await pos.getSettings();
  document.getElementById('nav-shop-name').textContent = settings.shop_name || 'MobileShop POS';
  startClock();
  setupNav();
  navigate('dashboard');
});

function startClock() {
  const tick = () => {
    const n = new Date();
    document.getElementById('nav-time').textContent =
      n.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('nav-date').textContent =
      n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  tick(); setInterval(tick, 1000);
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });
}

function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  const container = document.getElementById('page-container');
  container.innerHTML = '';
  const pages = { dashboard, pos: posPage, products: productsPage, sales, expenses, settings: settingsPage, repairs: repairHistory };
  if (pages[page]) pages[page](container);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const cur = (v) => `${settings.currency || '€'}${Number(v).toFixed(2)}`;

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function openModal(title, bodyHTML, wide = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-box').style.width = wide ? '700px' : '520px';
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function dashboard(el) {
  const stats = await pos.getDashboardStats();
  const lowStock = await pos.getLowStock();

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Dashboard</div><div class="page-sub">Overview</div></div>
      <button class="btn btn-ghost btn-sm" onclick="navigate('pos')">◉ New Sale</button>
    </div>

    ${lowStock.length ? `<div class="low-stock-bar">⚠ ${lowStock.length} product(s) low on stock: ${lowStock.slice(0, 3).map(p => p.name).join(', ')}${lowStock.length > 3 ? '…' : ''}</div>` : ''}

    <div class="stat-grid">
      <div class="stat-card" style="--card-accent:var(--accent)">
        <div class="stat-label">Today's Sales</div>
        <div class="stat-value">${cur(stats.todaySales.total)}</div>
        <div class="stat-meta">${stats.todaySales.count} transactions</div>
      </div>
      <div class="stat-card" style="--card-accent:var(--blue)">
        <div class="stat-label">This Month</div>
        <div class="stat-value">${cur(stats.monthSales.total)}</div>
        <div class="stat-meta">${stats.monthSales.count} transactions</div>
      </div>
      <div class="stat-card" style="--card-accent:var(--purple)">
        <div class="stat-label">Products</div>
        <div class="stat-value">${stats.totalProducts.count}</div>
        <div class="stat-meta">in inventory</div>
      </div>
      <div class="stat-card" style="--card-accent:var(--amber)">
        <div class="stat-label">Low Stock</div>
        <div class="stat-value">${stats.lowStock.count}</div>
        <div class="stat-meta">need restocking</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Recent Transactions</div>
        <table>
          <thead><tr><th>Receipt</th><th>Date</th><th>Total</th></tr></thead>
          <tbody>
            ${stats.recentSales.length
      ? stats.recentSales.map(s => `<tr>
                  <td class="mono">${s.receipt_no}</td>
                  <td>${new Date(s.created_at).toLocaleString()}</td>
                  <td class="mono text-accent">${cur(s.total)}</td>
                </tr>`).join('')
      : `<tr><td colspan="3" class="text-center text-muted">No sales yet</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-title">Top Products</div>
        <table>
          <thead><tr><th>Product</th><th>Sold</th><th>Revenue</th></tr></thead>
          <tbody>
            ${stats.topProducts.length
      ? stats.topProducts.map(p => `<tr>
                  <td>${p.name}</td>
                  <td class="mono">${p.total_sold}</td>
                  <td class="mono text-accent">${cur(p.revenue)}</td>
                </tr>`).join('')
      : `<tr><td colspan="3" class="text-center text-muted">No data yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── POS ───────────────────────────────────────────────────────────────────────
async function posPage(el) {
  products = await pos.getProducts();
  categories = await pos.getCategories();
  let activeCat = 'all';
  let searchQ = '';
  let saleType = 'sale'; // 'sale' or 'repair'

  el.innerHTML = `
    <div class="pos-layout">
      <div class="pos-left">
        <div class="product-search-bar">
          <input type="text" id="pos-search" placeholder="Search product or scan barcode…" autocomplete="off"/>
          <button class="btn btn-ghost" onclick="posRefresh()">↺</button>
        </div>
        <div class="cat-tabs" id="cat-tabs">
          <button class="cat-tab active" data-cat="all">All</button>
          ${categories.map(c => `<button class="cat-tab" data-cat="${c.id}">${c.name}</button>`).join('')}
        </div>
        <div class="products-grid" id="products-grid"></div>
      </div>
      <div class="pos-right">
        <div class="cart-panel">
          <div class="cart-header">
            <span>Cart <span id="cart-count" class="badge badge-green">0</span></span>
            <button class="btn btn-ghost btn-sm" onclick="clearCart()">Clear</button>
          </div>

          <!-- Sale Type Toggle -->
          <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
            <div class="form-label" style="margin-bottom:6px">Sale Type</div>
            <div style="display:flex;gap:8px">
              <button id="type-sale" class="pay-method active" style="flex:1;padding:7px" onclick="setSaleType('sale')">🛒 Sale</button>
              <button id="type-repair" class="pay-method" style="flex:1;padding:7px" onclick="setSaleType('repair')">🔧 Repair</button>
            </div>
          </div>

          <!-- Customer Info -->
          <div id="customer-fields" style="padding:10px 16px;border-bottom:1px solid var(--border)">
            <div id="customer-fields-inner"></div>
          </div>

          <div class="cart-items" id="cart-items">
            <div class="cart-empty"><div class="cart-empty-icon">◈</div>Cart is empty</div>
          </div>
          <div class="cart-totals">
            <div class="discount-row">
              <input type="number" id="discount-val" placeholder="Discount (${settings.currency || '€'})" min="0" step="0.01" oninput="renderCartTotals()"/>
            </div>
            <div class="total-row"><span>Subtotal</span><span id="t-sub" class="mono">-</span></div>
            <div class="total-row"><span>Discount</span><span id="t-disc" class="mono text-red">-</span></div>
            <div class="total-row"><span>Tax (${settings.tax_rate || 0}%)</span><span id="t-tax" class="mono">-</span></div>
            <div class="total-row grand"><span>TOTAL</span><span id="t-total" class="mono text-accent">-</span></div>
          </div>
          <div class="cart-actions">
            <button class="btn btn-primary btn-lg btn-block" onclick="openPayment()" id="checkout-btn" disabled>
              Checkout →
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  renderCustomerFields();
  renderProductGrid();

  window.setSaleType = (type) => {
    saleType = type;
    document.getElementById('type-sale').classList.toggle('active', type === 'sale');
    document.getElementById('type-repair').classList.toggle('active', type === 'repair');
    renderCustomerFields();
    renderCart();
  };

  function renderCustomerFields() {
    const inner = document.getElementById('customer-fields-inner');
    if (!inner) return;
    if (saleType === 'repair') {
      inner.innerHTML = `
        <div class="form-label" style="margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Repair Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input class="form-input" id="cust-name" placeholder="Customer Name *" style="font-size:12px;padding:7px 10px" oninput="renderCart()"/>
          <input class="form-input" id="cust-phone" placeholder="Phone Number" style="font-size:12px;padding:7px 10px"/>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input class="form-input" id="cust-model" placeholder="Device Model" style="font-size:12px;padding:7px 10px"/>
          <input class="form-input" id="cust-fault" placeholder="Fault Description" style="font-size:12px;padding:7px 10px"/>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:2px">
          <div class="form-label" style="margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Repair Charge</div>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center">
            <input class="form-input" id="repair-desc" placeholder="Description (e.g. Screen Repair)" style="font-size:12px;padding:7px 10px"/>
            <input class="form-input" id="repair-amount" type="number" min="0" step="0.01" placeholder="Amount (${settings.currency || '€'})" style="font-size:12px;padding:7px 10px"/>
            <button class="btn btn-primary btn-sm" onclick="addRepairCharge()" style="white-space:nowrap">+ Add</button>
          </div>
        </div>
      `;
    } else {
      inner.innerHTML = `
        <div class="form-label" style="margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Customer Info <span style="color:var(--text3);font-weight:400">(optional for mobile sales)</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input class="form-input" id="cust-name" placeholder="Customer Name" style="font-size:12px;padding:7px 10px"/>
          <input class="form-input" id="cust-phone" placeholder="Phone Number" style="font-size:12px;padding:7px 10px"/>
        </div>
        <input class="form-input" id="cust-imei" placeholder="IMEI (for mobile sales)" style="font-size:12px;padding:7px 10px;width:100%"/>
      `;
    }
  }

  window.addRepairCharge = () => {
    const desc = document.getElementById('repair-desc')?.value.trim() || 'Repair Charge';
    const amount = parseFloat(document.getElementById('repair-amount')?.value) || 0;
    if (amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    // Add as a virtual product to the cart
    const existing = cart.find(i => i.id === `repair_${desc}`);
    if (existing) {
      existing.quantity++;
    } else {
      cart.push({
        id: `repair_${desc}`,
        name: desc,
        price: amount,
        quantity: 1,
        stock: 9999,
        category_id: null,
        category_name: 'Repair',
        isRepairCharge: true
      });
    }
    // Clear the inputs
    document.getElementById('repair-desc').value = '';
    document.getElementById('repair-amount').value = '';
    renderCart();
    toast(`${desc} — ${settings.currency || '€'}${amount.toFixed(2)} added`);
  };

  document.getElementById('pos-search').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase();
    renderProductGrid();
    // Barcode scan: if 8+ chars and no spaces, try barcode lookup
    if (e.target.value.length >= 8 && !e.target.value.includes(' ')) {
      clearTimeout(window._bcTimer);
      window._bcTimer = setTimeout(async () => {
        const p = await pos.getProductByBarcode(e.target.value.trim());
        if (p) { addToCart(p); e.target.value = ''; searchQ = ''; renderProductGrid(); }
      }, 300);
    }
  });

  document.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProductGrid();
    });
  });

  function renderProductGrid() {
    const grid = document.getElementById('products-grid');
    let filtered = products;
    if (activeCat !== 'all') filtered = filtered.filter(p => String(p.category_id) === activeCat);
    if (searchQ) filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchQ) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchQ))
    );
    grid.innerHTML = filtered.length
      ? filtered.map(p => `
        <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" onclick="${p.stock > 0 ? `posAddProduct(${p.id})` : ''}">
          <div class="pc-name">${p.name}</div>
          <div class="pc-price">${cur(p.price)}</div>
          <div class="pc-stock">${p.stock > 0 ? `Stock: ${p.stock}` : '<span class="text-red">Out of stock</span>'}</div>
          ${p.category_name ? `<div class="pc-cat">${p.category_name}</div>` : ''}
        </div>`).join('')
      : '<div class="text-muted text-center" style="grid-column:1/-1;padding:40px">No products found</div>';
  }

  window.posAddProduct = (id) => {
    const p = products.find(x => x.id === id);
    if (p) { addToCart(p); }
  };
  window.posRefresh = async () => {
    products = await pos.getProducts();
    renderProductGrid();
  };

  // Expose saleType and customer field getter to outer scope for completeSale
  window._getSaleType = () => saleType;
  window._getCustomerFields = () => {
    if (saleType === 'repair') {
      return {
        sale_type: 'repair',
        customer_name: document.getElementById('cust-name')?.value.trim() || '',
        customer_phone: document.getElementById('cust-phone')?.value.trim() || '',
        customer_model: document.getElementById('cust-model')?.value.trim() || '',
        customer_fault: document.getElementById('cust-fault')?.value.trim() || '',
        customer_imei: '',
      };
    } else {
      return {
        sale_type: 'sale',
        customer_name: document.getElementById('cust-name')?.value.trim() || '',
        customer_phone: document.getElementById('cust-phone')?.value.trim() || '',
        customer_imei: document.getElementById('cust-imei')?.value.trim() || '',
        customer_model: '',
        customer_fault: '',
      };
    }
  };
}

function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  const inCart = existing ? existing.quantity : 0;
  if (!product.isRepairCharge && inCart >= product.stock) { toast(`Only ${product.stock} in stock`, 'error'); return; }
  if (existing) { existing.quantity++; }
  else { cart.push({ ...product, quantity: 1 }); }
  renderCart();
  toast(`${product.name} added`);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const countEl = document.getElementById('cart-count');
  const total = cart.reduce((s, i) => s + i.quantity, 0);
  countEl.textContent = total;

  // For repairs: enable checkout if customer name is filled (cart can be empty)
  // For sales: require at least one item in cart
  const saleType = (window._getSaleType && window._getSaleType()) || 'sale';
  const customerName = document.getElementById('cust-name')?.value.trim() || '';
  const btn = document.getElementById('checkout-btn');
  if (saleType === 'repair') {
    btn.disabled = customerName.length === 0;
    btn.textContent = customerName.length === 0 ? 'Enter customer name first' : '🔧 Complete Repair →';
  } else {
    btn.disabled = cart.length === 0;
    btn.textContent = 'Checkout →';
  }

  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">◈</div>Cart is empty</div>';
    renderCartTotals();
    return;
  }

  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div style="flex:1">
        <div class="ci-name">${item.name}</div>
        <div class="ci-price">${cur(item.price)} each</div>
      </div>
      <div class="ci-qty">
        <button class="ci-qty-btn" onclick="changeQty(${idx},-1)">−</button>
        <span class="ci-qty-num">${item.quantity}</span>
        <button class="ci-qty-btn" onclick="changeQty(${idx},1)">+</button>
      </div>
      <div class="ci-subtotal">${cur(item.price * item.quantity)}</div>
      <span class="ci-remove" onclick="removeFromCart(${idx})">✕</span>
    </div>
  `).join('');
  renderCartTotals();
}

function renderCartTotals() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = parseFloat(document.getElementById('discount-val')?.value || 0) || 0;
  const taxRate = parseFloat(settings.tax_rate || 0) / 100;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * taxRate;
  const total = taxable + tax;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('t-sub', cur(subtotal));
  set('t-disc', `-${cur(discount)}`);
  set('t-tax', cur(tax));
  set('t-total', cur(total));
}

window.changeQty = (idx, delta) => {
  const item = cart[idx];
  const newQty = item.quantity + delta;
  if (newQty <= 0) { cart.splice(idx, 1); }
  else if (newQty > item.stock) { toast(`Only ${item.stock} in stock`, 'error'); return; }
  else { item.quantity = newQty; }
  renderCart();
};
window.removeFromCart = (idx) => { cart.splice(idx, 1); renderCart(); };
window.clearCart = () => { cart = []; renderCart(); };

function openPayment() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = parseFloat(document.getElementById('discount-val')?.value || 0) || 0;
  const taxRate = parseFloat(settings.tax_rate || 0) / 100;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * taxRate;
  const total = taxable + tax;
  const saleType = (window._getSaleType && window._getSaleType()) || 'sale';
  const isRepair = saleType === 'repair';
  const customerName = document.getElementById('cust-name')?.value.trim() || '';

  openModal(isRepair ? 'Complete Repair Job' : 'Checkout', `
    <div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
        ${isRepair ? `Repair job for <strong>${customerName || 'customer'}</strong> · ` : ''}${cart.length} item(s)
      </div>
      <div style="font-size:28px;font-weight:700;font-family:'IBM Plex Mono';color:var(--accent);margin-bottom:20px">
        Total: ${cur(total)}
      </div>
      <div class="form-group">
        <div class="form-label">Amount Received</div>
        <input type="number" id="amount-paid" class="form-input" value="${total.toFixed(2)}" min="0" step="0.01" oninput="calcChange(${total})"/>
      </div>
      <div class="change-display" id="change-display">
        <div class="change-label">Change</div>
        <div class="change-value" id="change-val">${cur(0)}</div>
      </div>
      <div class="mt-16" style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-lg" style="flex:2" onclick="completeSale(${subtotal},${discount},${tax},${total})">
          ${isRepair ? '🔧 Complete Repair' : 'Complete Sale'}
        </button>
      </div>
    </div>
  `);
}

window.calcChange = (total) => {
  const paid = parseFloat(document.getElementById('amount-paid').value) || 0;
  const change = Math.max(paid - total, 0);
  document.getElementById('change-val').textContent = cur(change);
};

window.completeSale = async (subtotal, discount, tax, total) => {
  const paid = parseFloat(document.getElementById('amount-paid')?.value || total) || total;
  const change = Math.max(paid - total, 0);
  const customerFields = (window._getCustomerFields && window._getCustomerFields()) || {};

  // Repair charges have a string id — map them to product_id 0 for the backend
  const sanitisedItems = cart.map(item => ({
    ...item,
    id: item.isRepairCharge ? 0 : item.id,
  }));

  const result = await pos.completeSale({
    items: sanitisedItems,
    subtotal, discount, tax, total,
    payment_method: 'sale',
    amount_paid: paid,
    change_due: change,
    ...customerFields
  });

  if (!result.ok) { toast('Sale failed: ' + result.error, 'error'); return; }

  // Open cash drawer
  pos.kickDrawer().catch(() => {});

  closeModal();
  toast(`Sale complete! ${result.receipt_no}`, 'success');

  // Show receipt
  showReceiptModal(result.receipt_no, result.sale_id);

  cart = [];
  document.getElementById('discount-val').value = '';
  renderCart();
  navigate('pos');
}

async function showReceiptModal(receiptNo, saleId) {
  const { sale, items } = await pos.getSaleDetail(saleId);
  const currency = settings.currency || '€';
  const isRepair = (sale.sale_type || '') === 'repair';

  // Check if any item is from Mobile or Repair category
  const hasMobileOrRepair = isRepair || items.some(i => {
    const cat = String(i.category_name || '').toLowerCase().trim();
    return cat === 'mobile' || cat === 'repair';
  });

  const itemLines = items.map(i =>
    `${(i.name + '').substring(0, 20).padEnd(20)} ${String(i.quantity).padStart(3)} x ${currency}${Number(i.price).toFixed(2)}\n` +
    `${''.padEnd(30)}= ${currency}${Number(i.subtotal).toFixed(2)}`
  );

  const customerLines = [];
  if (sale.customer_name)  customerLines.push(`Customer: ${sale.customer_name}`);
  if (sale.customer_phone) customerLines.push(`Phone:    ${sale.customer_phone}`);
  if (isRepair && sale.customer_model) customerLines.push(`Model:    ${sale.customer_model}`);
  if (isRepair && sale.customer_fault) customerLines.push(`Fault:    ${sale.customer_fault}`);
  if (!isRepair && sale.customer_imei) customerLines.push(`IMEI:     ${sale.customer_imei}`);

  const mobileRepairTnC = [
    '----------------------------------------',
    'TERMS & CONDITIONS',
    '1. No refunds or exchange unless phone is',
    '   faulty and cannot be repaired.',
    '2. New phones with 12 months warranty will',
    '   be exchanged/repaired if no physical or',
    '   water damage (subject to manufacturer).',
    '3. Second hand phones with 12 months',
    '   warranty will be repaired if faulty.',
    '4. Manufacturer can take up to 3 weeks',
    '   to effect final decision.',
    '5. No warranty for screen, liquid damage,',
    '   and physical damage.',
    '6. All repairs with 12 month warranty,',
    '   not including liquid or physical damage.',
    '7. We are not responsible for items not',
    '   collected within 90 days after repair',
    '   and reserve the right to dispose of',
    '   or liquidate them.',
    '----------------------------------------',
  ];

  const genericTnC = [
    '----------------------------------------',
    'TERMS & CONDITIONS',
    '1. We are happy to exchange items/products',
    '   within 28 days of purchase. Items should',
    '   be in same condition with the same',
    '   packaging and a valid receipt.',
    '----------------------------------------',
  ];

  const tncLines = hasMobileOrRepair ? mobileRepairTnC : genericTnC;

  const lines = [
    settings.shop_name.padStart(24 + Math.floor(settings.shop_name.length / 2)).padEnd(40),
    settings.shop_address,
    settings.shop_phone,
    'VAT: IE3989701FH',
    '----------------------------------------',
    `Receipt: ${sale.receipt_no}`,
    `Date:    ${new Date(sale.created_at).toLocaleString()}`,
    isRepair ? 'Type:    Repair Job' : '',
    ...(customerLines.length ? ['----------------------------------------', ...customerLines] : []),
    '----------------------------------------',
    ...itemLines,
    '----------------------------------------',
    `Subtotal:  ${currency}${Number(sale.subtotal).toFixed(2)}`,
    `Discount: -${currency}${Number(sale.discount).toFixed(2)}`,
    `Tax:       ${currency}${Number(sale.tax).toFixed(2)}`,
    `TOTAL:     ${currency}${Number(sale.total).toFixed(2)}`,
    `Paid:      ${currency}${Number(sale.amount_paid).toFixed(2)}`,
    `Change:    ${currency}${Number(sale.change_due).toFixed(2)}`,
    ...tncLines,
    settings.receipt_footer || 'Thank you!'
  ].filter(l => l !== '').join('\n');

  openModal('Receipt — ' + receiptNo, `
    <div class="receipt-preview">${lines}</div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Close</button>
      <button class="btn btn-primary btn-sm" onclick="doPrint(${saleId})">🖨 Print Receipt</button>
    </div>
  `);
  window._currentReceiptSaleId = saleId;
}

window.doPrint = async (saleId) => {
  // Always fetch fresh settings so printer_enabled is current
  const freshSettings = await pos.getSettings();
  settings = freshSettings;

  if (freshSettings.printer_enabled !== 'true') {
    toast('Printer is disabled — enable it in Settings first.', 'error');
    return;
  }

  toast('Sending to printer…', 'info');
  const { sale, items } = await pos.getSaleDetail(saleId);
  const result = await pos.printReceipt({ sale, items, settings: freshSettings });
  if (result.ok) {
    toast('Receipt printed!', 'success');
  } else {
    toast('Print failed: ' + result.error, 'error');
    console.error('[doPrint] error:', result.error);
  }
};

// ── Products Page ─────────────────────────────────────────────────────────────
async function productsPage(el) {
  let allProducts = await pos.getProducts();
  let allCategories = await pos.getCategories();
  let searchQ = '';

  function render() {
    let list = allProducts;
    if (searchQ) list = list.filter(p =>
      p.name.toLowerCase().includes(searchQ) ||
      (p.barcode || '').toLowerCase().includes(searchQ)
    );

    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Products</div><div class="page-sub">${allProducts.length} items</div></div>
        <div class="flex">
          <button class="btn btn-ghost btn-sm" onclick="manageCats()">Manage Categories</button>
          <button class="btn btn-primary btn-sm" onclick="openProductForm()">+ Add Product</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search-wrap">
            <span class="search-icon">⌕</span>
            <input type="text" id="prod-search" placeholder="Search by name…" value="${searchQ}" oninput="prodSearch(this.value)"/>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="exportCSV()">↓ Export CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Category</th>
              <th>Price</th><th>Stock</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${list.length ? list.map(p => `<tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.category_name || '-'}</td>
                <td class="mono text-accent">${cur(p.price)}</td>
                <td>
                  <span class="badge ${p.stock <= p.low_stock ? 'badge-red' : 'badge-green'}">${p.stock}</span>
                </td>
                <td>
                  <div class="flex">
                    <button class="btn btn-ghost btn-sm" onclick="openProductForm(${p.id})">Edit</button>
                    <button class="btn btn-ghost btn-sm" onclick="openStockAdjust(${p.id},'${p.name.replace(/'/g, "\\'")}',${p.stock})">Stock</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Del</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="5" class="text-center text-muted">No products found</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (document.getElementById('prod-search'))
      document.getElementById('prod-search').focus();
  }

  render();

  window.prodSearch = (v) => { searchQ = v.toLowerCase(); render(); };

  window.openProductForm = async (id = null) => {
    const cats = await pos.getCategories();
    const p = id ? allProducts.find(x => x.id === id) : null;
    openModal(id ? 'Edit Product' : 'Add Product', `
      <form onsubmit="saveProduct(event, ${id})">
        <div class="form-group"><label class="form-label">Name *</label>
          <input class="form-input" id="pf-name" required value="${p ? p.name : ''}"/></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Category</label>
            <select class="form-select" id="pf-cat">
              <option value="">None</option>
              ${cats.map(c => `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Low Stock Alert</label>
            <input class="form-input" id="pf-low" type="number" min="0" value="${p ? p.low_stock : '5'}"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Selling Price *</label>
            <input class="form-input" id="pf-price" type="number" min="0" step="0.01" required value="${p ? p.price : ''}"/></div>
        </div>
        <div class="form-group"><label class="form-label">Stock Qty</label>
          <input class="form-input" id="pf-stock" type="number" min="0" value="${p ? p.stock : '0'}"/></div>
        <div class="flex" style="justify-content:flex-end;gap:8px;margin-top:8px">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Product</button>
        </div>
      </form>
    `);
  };

  window.saveProduct = async (e, id) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('pf-name').value.trim(),
      barcode: null,
      category_id: document.getElementById('pf-cat').value || null,
      price: parseFloat(document.getElementById('pf-price').value),
      cost: 0,
      stock: parseInt(document.getElementById('pf-stock').value) || 0,
      low_stock: parseInt(document.getElementById('pf-low').value) || 5,
    };
    let result;
    if (id) { data.id = id; result = await pos.updateProduct(data); }
    else { result = await pos.addProduct(data); }
    if (result.ok) {
      closeModal();
      toast(id ? 'Product updated' : 'Product added');
      allProducts = await pos.getProducts();
      render();
    } else toast('Error: ' + result.error, 'error');
  };

  window.deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return;
    await pos.deleteProduct(id);
    toast('Product deleted');
    allProducts = await pos.getProducts();
    render();
  };

  window.openStockAdjust = (id, name, currentStock) => {
    openModal(`Adjust Stock — ${name}`, `
      <div>
        <div class="stat-card" style="margin-bottom:16px;--card-accent:var(--accent)">
          <div class="stat-label">Current Stock</div>
          <div class="stat-value">${currentStock}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Adjustment (+/-)</label>
          <input type="number" class="form-input" id="stock-adj" placeholder="e.g. 10 to add, -5 to remove"/>
        </div>
        <div class="flex" style="justify-content:flex-end;gap:8px">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="doStockAdjust(${id})">Apply</button>
        </div>
      </div>
    `);
  };

  window.doStockAdjust = async (id) => {
    const qty = parseInt(document.getElementById('stock-adj').value);
    if (isNaN(qty)) { toast('Enter a valid number', 'error'); return; }
    await pos.updateStock({ id, qty });
    closeModal();
    toast('Stock updated');
    allProducts = await pos.getProducts();
    render();
  };

  window.manageCats = async () => {
    const renderCats = async () => {
      const cats = await pos.getCategories();
      openModal('Manage Categories', `
        <div class="form-group flex" style="gap:8px">
          <input type="text" class="form-input" id="new-cat" placeholder="New category name"/>
          <button class="btn btn-primary btn-sm" onclick="addCat()">Add</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Actions</th></tr></thead>
            <tbody>
              ${cats.map(c => `<tr>
                <td>${c.name}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id})">Delete</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `);
    };
    await renderCats();

    window.addCat = async () => {
      const name = document.getElementById('new-cat').value.trim();
      if (!name) return;
      const r = await pos.addCategory(name);
      if (r.ok) { await renderCats(); toast('Category added'); }
      else toast('Error: ' + r.error, 'error');
    };
    window.deleteCat = async (id) => {
      await pos.deleteCategory(id);
      await renderCats();
      toast('Category deleted');
    };
  };

  window.exportCSV = async () => {
    const r = await pos.exportSalesCSV({ from: '2000-01-01', to: todayStr() });
    if (r.ok) toast('Exported to ' + r.filePath);
  };
}

// ── Sales History ─────────────────────────────────────────────────────────────
async function sales(el) {
  let from = firstOfMonth(), to = todayStr();

  async function loadAndRender() {
    const list = await pos.getSales({ from, to });
    const total = list.reduce((s, r) => s + r.total, 0);

    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Sales History</div><div class="page-sub">${list.length} transactions</div></div>
        <div class="flex">
          <button class="btn btn-ghost btn-sm" onclick="exportRange()">↓ Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="openReportModal()">📊 Generate Report</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="flex">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">From</label>
            <input type="date" class="form-input" id="s-from" value="${from}" onchange="sFilter()"/>
          </div>
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">To</label>
            <input type="date" class="form-input" id="s-to" value="${to}" onchange="sFilter()"/>
          </div>
          <div class="stat-card" style="--card-accent:var(--accent);margin:0;flex:1;padding:10px 16px">
            <div class="stat-label">Period Total</div>
            <div class="stat-value" style="font-size:20px">${cur(total)}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Receipt No</th><th>Date & Time</th><th>Items</th>
              <th>Total</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${list.length
        ? list.map(s => `<tr>
                    <td class="mono">${s.receipt_no}</td>
                    <td>${new Date(s.created_at).toLocaleString()}</td>
                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.items_summary || '-'}</td>
                    <td class="mono text-accent">${cur(s.total)}</td>
                    <td>
                      <div class="flex">
                        <button class="btn btn-ghost btn-sm" onclick="viewSale(${s.id})">View</button>
                        <button class="btn btn-amber btn-sm" onclick="editSale(${s.id})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSale(${s.id})">Del</button>
                      </div>
                    </td>
                  </tr>`).join('')
        : `<tr><td colspan="5" class="text-center text-muted" style="padding:40px">No sales in this period</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
    window.sFilter = () => {
      from = document.getElementById('s-from').value;
      to = document.getElementById('s-to').value;
      loadAndRender();
    };
    window.exportRange = async () => {
      const r = await pos.exportSalesCSV({ from, to });
      if (r.ok) toast('Exported!');
      else toast('Export cancelled', 'info');
    };

    window.deleteSale = async (id) => {
      if (!confirm('Delete this sale? This cannot be undone.')) return;
      const r = await pos.deleteSale(id);
      if (r.ok) { toast('Sale deleted'); loadAndRender(); }
      else toast('Delete failed: ' + r.error, 'error');
    };

    window.openReportModal = () => {
      const today = todayStr();
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
      const weekStr = weekAgo.toISOString().slice(0, 10);
      openModal('Generate Sales Report', `
        <div>
          <div class="form-group">
            <div class="form-label">Report Period</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
              <button class="pay-method active" id="rp-daily" onclick="selectPeriod('daily',this,'${today}','${today}')">Daily</button>
              <button class="pay-method" id="rp-weekly" onclick="selectPeriod('weekly',this,'${weekStr}','${today}')">Weekly</button>
              <button class="pay-method" id="rp-monthly" onclick="selectPeriod('monthly',this,'${firstOfMonth()}','${today}')">Monthly</button>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">From Date</label>
              <input type="date" class="form-input" id="rp-from" value="${today}"/>
            </div>
            <div class="form-group">
              <label class="form-label">To Date</label>
              <input type="date" class="form-input" id="rp-to" value="${today}"/>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-lg" style="flex:2" onclick="generateReport()">📄 Generate PDF Report</button>
          </div>
        </div>
      `);
    };

    window.selectPeriod = (period, el, f, t) => {
      document.querySelectorAll('.pay-method').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('rp-from').value = f;
      document.getElementById('rp-to').value = t;
      window._reportPeriod = period;
    };
    window._reportPeriod = 'daily';

    window.generateReport = async () => {
      const f = document.getElementById('rp-from').value;
      const t = document.getElementById('rp-to').value;
      const period = window._reportPeriod || 'daily';
      closeModal();
      toast('Generating report…', 'info');
      const r = await pos.generateReportPDF({ from: f, to: t, period });
      if (r.ok) toast('Report saved to ' + r.filePath, 'success');
      else if (r.error) toast('Report failed: ' + r.error, 'error');
      else toast('Report cancelled', 'info');
    };

    window.viewSale = async (id) => {
      const { sale, items } = await pos.getSaleDetail(id);
      const isRepair = (sale.sale_type || '') === 'repair';
      const customerBlock = (sale.customer_name || sale.customer_phone) ? `
        <div class="card" style="margin-bottom:16px;background:var(--bg3)">
          <div class="card-title">${isRepair ? 'Repair Details' : 'Customer Info'}</div>
          <div class="grid-2">
            ${sale.customer_name  ? `<div><div class="form-label">Name</div><div>${sale.customer_name}</div></div>` : ''}
            ${sale.customer_phone ? `<div><div class="form-label">Phone</div><div>${sale.customer_phone}</div></div>` : ''}
            ${isRepair && sale.customer_model ? `<div><div class="form-label">Model</div><div>${sale.customer_model}</div></div>` : ''}
            ${isRepair && sale.customer_fault ? `<div><div class="form-label">Fault</div><div>${sale.customer_fault}</div></div>` : ''}
            ${!isRepair && sale.customer_imei  ? `<div><div class="form-label">IMEI</div><div class="mono">${sale.customer_imei}</div></div>` : ''}
          </div>
        </div>` : '';
      openModal('Sale Detail — ' + sale.receipt_no, `
        <div>
          <div class="grid-2" style="margin-bottom:16px">
            <div><div class="form-label">Date</div><div>${new Date(sale.created_at).toLocaleString()}</div></div>
            <div><div class="form-label">Receipt</div><div class="mono">${sale.receipt_no}</div></div>
          </div>
          ${customerBlock}
          <table style="margin-bottom:16px">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${items.map(i => `<tr>
                <td>${i.name}</td>
                <td class="mono">${i.quantity}</td>
                <td class="mono">${cur(i.price)}</td>
                <td class="mono text-accent">${cur(i.subtotal)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="cart-totals" style="background:var(--bg3);border-radius:var(--radius);padding:12px">
            <div class="total-row"><span>Subtotal</span><span class="mono">${cur(sale.subtotal)}</span></div>
            <div class="total-row"><span>Discount</span><span class="mono text-red">-${cur(sale.discount)}</span></div>
            <div class="total-row"><span>Tax</span><span class="mono">${cur(sale.tax)}</span></div>
            <div class="total-row grand"><span>TOTAL</span><span class="mono text-accent">${cur(sale.total)}</span></div>
            <div class="total-row"><span>Paid</span><span class="mono">${cur(sale.amount_paid)}</span></div>
            <div class="total-row"><span>Change</span><span class="mono">${cur(sale.change_due)}</span></div>
          </div>
          <div style="margin-top:12px">
            <button class="btn btn-primary btn-sm" onclick="doPrint(${sale.id})">🖨 Print Receipt</button>
          </div>
        </div>
      `);
    };

    window.editSale = async (id) => {
      const { sale, items } = await pos.getSaleDetail(id);
      const allProds = await pos.getProducts();

      let editItems = items.map(i => ({ ...i, id: i.product_id || i.id }));

      const renderEditItems = () => {
        const tbody = document.getElementById('edit-items-body');
        if (!tbody) return;
        const subtotal = editItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const discountEl = document.getElementById('edit-discount');
        const discount = parseFloat(discountEl?.value || 0) || 0;
        const taxRate = parseFloat(settings.tax_rate || 0) / 100;
        const taxable = Math.max(subtotal - discount, 0);
        const tax = taxable * taxRate;
        const total = taxable + tax;
        const el2 = id => document.getElementById(id);
        if (el2('edit-sub')) el2('edit-sub').textContent = cur(subtotal);
        if (el2('edit-tax')) el2('edit-tax').textContent = cur(tax);
        if (el2('edit-total')) el2('edit-total').textContent = cur(total);

        tbody.innerHTML = editItems.map((item, idx) => `
          <tr>
            <td>
              <select class="form-select" style="min-width:140px" onchange="editItemProduct(${idx},this.value)">
                ${allProds.map(p => `<option value="${p.id}" ${p.id === (item.product_id || item.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </td>
            <td><input type="number" class="form-input" style="width:70px" min="1" value="${item.quantity}" onchange="editItemQty(${idx},this.value)"/></td>
            <td><input type="number" class="form-input" style="width:90px" min="0" step="0.01" value="${Number(item.price).toFixed(2)}" onchange="editItemPrice(${idx},this.value)"/></td>
            <td class="mono text-accent">${cur(item.price * item.quantity)}</td>
            <td><button class="btn btn-danger btn-sm" onclick="editRemoveItem(${idx})">✕</button></td>
          </tr>
        `).join('');
      };

      window.editItemProduct = (idx, prodId) => {
        const p = allProds.find(x => x.id === parseInt(prodId));
        if (p) { editItems[idx] = { ...editItems[idx], product_id: p.id, name: p.name, price: p.price }; renderEditItems(); }
      };
      window.editItemQty = (idx, val) => { editItems[idx].quantity = Math.max(1, parseInt(val) || 1); renderEditItems(); };
      window.editItemPrice = (idx, val) => { editItems[idx].price = parseFloat(val) || 0; renderEditItems(); };
      window.editRemoveItem = (idx) => { editItems.splice(idx, 1); renderEditItems(); };
      window.editAddItem = () => {
        const p = allProds[0];
        if (!p) return;
        editItems.push({ product_id: p.id, name: p.name, price: p.price, quantity: 1 });
        renderEditItems();
      };
      window.saveEditedSale = async () => {
        const discount = parseFloat(document.getElementById('edit-discount').value) || 0;
        const subtotal = editItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const taxRate = parseFloat(settings.tax_rate || 0) / 100;
        const taxable = Math.max(subtotal - discount, 0);
        const tax = taxable * taxRate;
        const total = taxable + tax;
        const amount_paid = total;
        const change_due = 0;

        const r = await pos.updateSale({ id, discount, tax, total, amount_paid, change_due, items: editItems });
        if (r.ok) {
          closeModal();
          toast('Sale updated successfully');
          loadAndRender();
        } else toast('Update failed: ' + r.error, 'error');
      };

      openModal('Edit Sale — ' + sale.receipt_no, `
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
            ${new Date(sale.created_at).toLocaleString()}
          </div>
          <div class="table-wrap" style="margin-bottom:12px">
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th><th></th></tr></thead>
              <tbody id="edit-items-body"></tbody>
            </table>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-bottom:12px" onclick="editAddItem()">+ Add Item</button>
          <div class="form-group">
            <label class="form-label">Discount (${settings.currency || '€'})</label>
            <input type="number" class="form-input" id="edit-discount" min="0" step="0.01" value="${Number(sale.discount).toFixed(2)}" oninput="renderEditItemsWrapper()"/>
          </div>
          <div class="cart-totals" style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:12px">
            <div class="total-row"><span>Subtotal</span><span class="mono" id="edit-sub">-</span></div>
            <div class="total-row"><span>Tax (${settings.tax_rate || 0}%)</span><span class="mono" id="edit-tax">-</span></div>
            <div class="total-row grand"><span>TOTAL</span><span class="mono text-accent" id="edit-total">-</span></div>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" style="flex:2" onclick="saveEditedSale()">Save Changes</button>
          </div>
        </div>
      `, true);

      window.renderEditItemsWrapper = renderEditItems;
      renderEditItems();
    };
  }
  await loadAndRender();
}

// ── Expenses ──────────────────────────────────────────────────────────────────
async function expenses(el) {
  let from = firstOfMonth(), to = todayStr();

  async function loadAndRender() {
    const list = await pos.getExpenses({ from, to });
    const total = list.reduce((s, e) => s + e.amount, 0);

    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Expenses</div><div class="page-sub">Track your costs</div></div>
        <button class="btn btn-primary btn-sm" onclick="openExpForm()">+ Add Expense</button>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="flex">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">From</label>
            <input type="date" class="form-input" id="e-from" value="${from}" onchange="eFilter()"/>
          </div>
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">To</label>
            <input type="date" class="form-input" id="e-to" value="${to}" onchange="eFilter()"/>
          </div>
          <div class="stat-card" style="--card-accent:var(--red);margin:0;flex:1;padding:10px 16px">
            <div class="stat-label">Total Expenses</div>
            <div class="stat-value" style="font-size:20px">${cur(total)}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              ${list.length
        ? list.map(e => `<tr>
                    <td>${e.description}</td>
                    <td>${e.category || '-'}</td>
                    <td class="mono text-red">${cur(e.amount)}</td>
                    <td>${new Date(e.created_at).toLocaleString()}</td>
                  </tr>`).join('')
        : `<tr><td colspan="4" class="text-center text-muted" style="padding:40px">No expenses recorded</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
    window.eFilter = () => {
      from = document.getElementById('e-from').value;
      to = document.getElementById('e-to').value;
      loadAndRender();
    };
    window.openExpForm = () => {
      openModal('Add Expense', `
        <form onsubmit="saveExpense(event)">
          <div class="form-group"><label class="form-label">Description *</label>
            <input class="form-input" id="ef-desc" required placeholder="e.g. Rent, Electricity, Stock purchase"/></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Amount *</label>
              <input class="form-input" id="ef-amt" type="number" min="0" step="0.01" required/></div>
            <div class="form-group"><label class="form-label">Category</label>
              <select class="form-select" id="ef-cat">
                <option value="">General</option>
                <option>Rent</option><option>Utilities</option><option>Stock</option>
                <option>Salary</option><option>Marketing</option><option>Other</option>
              </select></div>
          </div>
          <div class="flex" style="justify-content:flex-end;gap:8px">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Expense</button>
          </div>
        </form>
      `);
    };
    window.saveExpense = async (e) => {
      e.preventDefault();
      const r = await pos.addExpense({
        description: document.getElementById('ef-desc').value.trim(),
        amount: parseFloat(document.getElementById('ef-amt').value),
        category: document.getElementById('ef-cat').value
      });
      if (r.ok) { closeModal(); toast('Expense saved'); loadAndRender(); }
      else toast('Error saving expense', 'error');
    };
  }
  await loadAndRender();
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function settingsPage(el) {
  const s = await pos.getSettings();
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Settings</div><div class="page-sub">Shop configuration</div></div>
    </div>
    <div style="max-width:600px">
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Shop Information</div>
        <div class="form-group"><label class="form-label">Shop Name</label>
          <input class="form-input" id="s-name" value="${s.shop_name || ''}"/></div>
        <div class="form-group"><label class="form-label">Address</label>
          <input class="form-input" id="s-addr" value="${s.shop_address || ''}"/></div>
        <div class="form-group"><label class="form-label">Phone</label>
          <input class="form-input" id="s-phone" value="${s.shop_phone || ''}"/></div>
        <div class="form-group"><label class="form-label">Receipt Footer Message</label>
          <input class="form-input" id="s-footer" value="${s.receipt_footer || ''}"/></div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Tax & Currency</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Currency Symbol</label>
            <input class="form-input" id="s-currency" value="${s.currency || '€'}" maxlength="3"/></div>
          <div class="form-group"><label class="form-label">Tax Rate (%)</label>
            <input class="form-input" id="s-tax" type="number" min="0" max="100" step="0.1" value="${s.tax_rate || 0}"/></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Cash Drawer</div>
        <div class="form-group">
          <label class="form-label">Enable Cash Drawer</label>
          <select class="form-select" id="s-drawer">
            <option value="true"  ${s.drawer_enabled !== 'false' ? 'selected' : ''}>Enabled — open on every sale</option>
            <option value="false" ${s.drawer_enabled === 'false' ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label class="form-label">COM Port <span style="color:var(--text3)">(Partner Tech built-in drawer is usually COM1)</span></label>
          <input class="form-input" id="s-drawer-port" placeholder="e.g. COM1" value="${s.drawer_port || 'COM1'}"/>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-amber btn-sm" onclick="testDrawer()">⚡ Test Open Drawer</button>
          <span id="drawer-test-result" style="font-size:12px;color:var(--text3)"></span>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">
          To find your port: Device Manager → Ports (COM &amp; LPT). Try COM1 first for Partner Tech devices.
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Thermal Printer</div>
        <div class="form-group">
          <label class="form-label">Enable Thermal Printer (ESC/POS via USB)</label>
          <select class="form-select" id="s-printer">
            <option value="false" ${s.printer_enabled !== 'true' ? 'selected' : ''}>Disabled</option>
            <option value="true"  ${s.printer_enabled === 'true' ? 'selected' : ''}>Enabled</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label class="form-label">Printer Port <span style="color:var(--text3)">(Windows: USB001, COM3 etc — leave blank to auto-detect)</span></label>
          <input class="form-input" id="s-port" placeholder="e.g. USB001" value="${s.printer_port || ''}"/>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">
          To find your port: Control Panel > Devices and Printers > right-click printer > Printer properties > Ports tab.
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Printer Diagnostics</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Run a step-by-step test to find out exactly why your printer is not responding.
          This will also attempt to print a test page.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-amber btn-sm" onclick="runPrinterDiag()">Run Printer Test (via escpos)</button>
          <button class="btn btn-ghost btn-sm" onclick="runRawTest()">Run Raw USB Test (bypass escpos)</button>
        </div>
        <div id="diag-results" style="margin-top:14px"></div>
      </div>
      <button class="btn btn-primary btn-lg" onclick="saveAllSettings()">Save Settings</button>
    </div>
  `;

  window.saveAllSettings = async () => {
    const data = {
      shop_name: document.getElementById('s-name').value.trim(),
      shop_address: document.getElementById('s-addr').value.trim(),
      shop_phone: document.getElementById('s-phone').value.trim(),
      receipt_footer: document.getElementById('s-footer').value.trim(),
      currency: document.getElementById('s-currency').value.trim() || '€',
      tax_rate: document.getElementById('s-tax').value,
      printer_enabled: document.getElementById('s-printer').value,
      printer_port: document.getElementById('s-port').value.trim(),
      drawer_enabled: document.getElementById('s-drawer').value,
      drawer_port: document.getElementById('s-drawer-port').value.trim() || 'COM1',
    };
    await pos.saveSettings(data);
    settings = data;
    document.getElementById('nav-shop-name').textContent = data.shop_name;
    toast('Settings saved!');
  };

  window.testDrawer = async () => {
    const port = document.getElementById('s-drawer-port').value.trim() || 'COM1';
    const result = document.getElementById('drawer-test-result');
    result.textContent = `Testing ${port}…`;
    result.style.color = 'var(--text3)';
    // Save the port first so the IPC handler picks it up
    await pos.saveSettings({ drawer_port: port, drawer_enabled: document.getElementById('s-drawer').value });
    const r = await pos.testDrawer();
    if (r.ok) {
      result.textContent = `✓ Drawer opened on ${r.port}!`;
      result.style.color = 'var(--accent)';
    } else {
      result.textContent = `✗ Failed on ${r.port} — try another COM port`;
      result.style.color = 'var(--red)';
    }
  };
}

// ── Printer Diagnostic ───────────────────────────────────────────────────────
window.runPrinterDiag = async () => {
  const box = document.getElementById('diag-results');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:12px">Running diagnostics...</div>';

  const { steps } = await pos.printerDiagnostic();

  box.innerHTML = steps.map(s => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex-shrink:0;font-size:14px">${s.ok ? '<span style="color:var(--accent)">✓</span>' : '<span style="color:var(--red)">✗</span>'}</span>
      <span style="color:${s.ok ? 'var(--text)' : 'var(--red)'}">${s.msg}</span>
    </div>
  `).join('');

  const allOk = steps.every(s => s.ok);
  const last = steps[steps.length - 1];
  box.innerHTML += `
    <div style="margin-top:12px;padding:10px;border-radius:var(--radius);background:${allOk ? 'rgba(0,212,160,0.08)' : 'rgba(255,77,77,0.08)'};border:1px solid ${allOk ? 'var(--accent)' : 'var(--red)'};font-size:12px;color:${allOk ? 'var(--accent)' : 'var(--red)'}">
      ${allOk ? 'All checks passed — test page sent to printer.' : 'Failed at: ' + last.msg}
    </div>`;
};

// ── Raw USB Printer Test ─────────────────────────────────────────────────────
window.runRawTest = async () => {
  const box = document.getElementById('diag-results');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:12px">Sending raw bytes directly to USB...</div>';

  const { steps } = await pos.printerRawTest();

  box.innerHTML = steps.map(s => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex-shrink:0">${s.ok ? '<span style="color:var(--accent)">✓</span>' : '<span style="color:var(--red)">✗</span>'}</span>
      <span style="color:${s.ok ? 'var(--text)' : 'var(--red)'}">${s.msg}</span>
    </div>
  `).join('');

  const allOk = steps.every(s => s.ok);
  const last = steps[steps.length - 1];
  box.innerHTML += `
    <div style="margin-top:12px;padding:10px;border-radius:var(--radius);
      background:${allOk ? 'rgba(0,212,160,0.08)' : 'rgba(255,77,77,0.08)'};
      border:1px solid ${allOk ? 'var(--accent)' : 'var(--red)'};
      font-size:12px;color:${allOk ? 'var(--accent)' : 'var(--red)'}">
      ${allOk
      ? 'Raw bytes sent successfully. If paper still did not move, the printer needs a different ESC/POS cut command — share the result and we will fix it.'
      : 'Failed: ' + last.msg}
    </div>`;
};

// ── Repair History ────────────────────────────────────────────────────────────
async function repairHistory(el) {
  let from = firstOfMonth(), to = todayStr();
  let searchQ = '';

  async function loadAndRender() {
    const list = await pos.getRepairSales({ from, to, search: searchQ });

    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Repair History</div><div class="page-sub">${list.length} repair job${list.length !== 1 ? 's' : ''}</div></div>
        <button class="btn btn-primary btn-sm" onclick="navigate('pos')">🔧 New Repair</button>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="flex" style="gap:10px;flex-wrap:wrap">
          <div class="search-wrap" style="flex:2;min-width:200px">
            <span class="search-icon">⌕</span>
            <input type="text" id="rep-search" placeholder="Search by name, phone or model…" value="${searchQ}" oninput="repSearch(this.value)"/>
          </div>
          <div class="form-group" style="flex:1;margin:0;min-width:130px">
            <label class="form-label">From</label>
            <input type="date" class="form-input" id="rep-from" value="${from}" onchange="repFilter()"/>
          </div>
          <div class="form-group" style="flex:1;margin:0;min-width:130px">
            <label class="form-label">To</label>
            <input type="date" class="form-input" id="rep-to" value="${to}" onchange="repFilter()"/>
          </div>
          <div style="display:flex;align-items:flex-end">
            <button class="btn btn-ghost btn-sm" onclick="repSearch('')">Clear</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Model</th>
              <th>Fault</th>
              <th>Total</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${list.length ? list.map(s => `<tr>
                <td class="mono" style="font-size:11px">${s.receipt_no}</td>
                <td style="font-size:12px">${new Date(s.created_at).toLocaleString()}</td>
                <td><strong>${s.customer_name || '-'}</strong></td>
                <td class="mono">${s.customer_phone || '-'}</td>
                <td>${s.customer_model || '-'}</td>
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${s.customer_fault || '-'}</td>
                <td class="mono text-accent">${cur(s.total)}</td>
                <td>
                  <div class="flex">
                    <button class="btn btn-ghost btn-sm" onclick="viewRepair(${s.id})">View</button>
                    <button class="btn btn-primary btn-sm" onclick="doPrint(${s.id})">🖨</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRepair(${s.id})">Del</button>
                  </div>
                </td>
              </tr>`).join('') : `
                <tr><td colspan="8" class="text-center text-muted" style="padding:40px">
                  ${searchQ ? 'No repairs found matching "' + searchQ + '"' : 'No repair jobs in this period'}
                </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    window.repFilter = () => {
      from = document.getElementById('rep-from').value;
      to   = document.getElementById('rep-to').value;
      loadAndRender();
    };
    window.repSearch = (v) => {
      searchQ = v;
      if (document.getElementById('rep-search')) document.getElementById('rep-search').value = v;
      loadAndRender();
    };

    window.viewRepair = async (id) => {
      const { sale, items } = await pos.getSaleDetail(id);
      openModal('Repair Job — ' + sale.receipt_no, `
        <div>
          <div class="grid-2" style="margin-bottom:16px">
            <div><div class="form-label">Date</div><div>${new Date(sale.created_at).toLocaleString()}</div></div>
            <div><div class="form-label">Receipt No</div><div class="mono">${sale.receipt_no}</div></div>
          </div>
          <div class="card" style="margin-bottom:16px;background:var(--bg3)">
            <div class="card-title">Repair Details</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div><div class="form-label">Customer Name</div><div style="font-weight:600">${sale.customer_name || '-'}</div></div>
              <div><div class="form-label">Phone Number</div><div class="mono">${sale.customer_phone || '-'}</div></div>
              <div><div class="form-label">Device Model</div><div>${sale.customer_model || '-'}</div></div>
              <div><div class="form-label">Fault</div><div style="color:var(--amber)">${sale.customer_fault || '-'}</div></div>
            </div>
          </div>
          <table style="margin-bottom:16px">
            <thead><tr><th>Service / Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${items.map(i => `<tr>
                <td>${i.name}</td>
                <td class="mono">${i.quantity}</td>
                <td class="mono">${cur(i.price)}</td>
                <td class="mono text-accent">${cur(i.subtotal)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="cart-totals" style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:12px">
            <div class="total-row"><span>Subtotal</span><span class="mono">${cur(sale.subtotal)}</span></div>
            <div class="total-row"><span>Discount</span><span class="mono text-red">-${cur(sale.discount)}</span></div>
            <div class="total-row"><span>Tax</span><span class="mono">${cur(sale.tax)}</span></div>
            <div class="total-row grand"><span>TOTAL</span><span class="mono text-accent">${cur(sale.total)}</span></div>
            <div class="total-row"><span>Paid</span><span class="mono">${cur(sale.amount_paid)}</span></div>
            <div class="total-row"><span>Change</span><span class="mono">${cur(sale.change_due)}</span></div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            <button class="btn btn-primary btn-sm" onclick="doPrint(${sale.id})">🖨 Print Receipt</button>
          </div>
        </div>
      `, true);
    };

    window.deleteRepair = async (id) => {
      if (!confirm('Delete this repair record? This cannot be undone.')) return;
      const r = await pos.deleteSale(id);
      if (r.ok) { toast('Repair deleted'); loadAndRender(); }
      else toast('Delete failed: ' + r.error, 'error');
    };
  }

  await loadAndRender();
}

// ── Keyboard Shortcut ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'F1') navigate('pos');
  if (e.key === 'Escape') closeModal();
});