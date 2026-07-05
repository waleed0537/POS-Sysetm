# 🖥️ MobileShop POS

**A desktop Point-of-Sale system built for real mobile & electronics shops — not just another checkout app.**

MobileShop POS is a native **Electron** application with a local **SQLite** database, purpose-built for mobile phone and electronics retailers who also run a repair bench. It goes beyond generic "cart + checkout" POS templates by natively supporting **repair job tracking, IMEI logging, warranty terms, thermal receipt printing, and cash drawer control** — all offline, all on your own hardware.

---

## ✨ Why This Isn't Your Average POS

Most open-source POS demos stop at "add product → checkout → print receipt." This one is built around the operational reality of a phone shop:

| Feature | What Makes It Different |
|---|---|
| 🔧 **Dual Sale Modes: Retail & Repair** | Toggle between a normal **Sale** and a **Repair Job** directly in the cart. Repair mode swaps the checkout form for customer name, phone, device model, and fault description — with its own dedicated **Repair History** page, searchable by name/phone/model. |
| 📱 **IMEI & Device Tracking** | Every mobile sale can capture an IMEI number; every repair captures the device model and fault. This data is stored per-transaction and reprinted on demand — something almost no generic POS template handles. |
| 🧾 **Context-Aware Receipts** | Receipts automatically detect whether a sale involves mobile/repair items and print the correct **Terms & Conditions block** (repair warranty terms vs. standard 28-day exchange policy) — no manual switching required. |
| 🖨️ **Real Thermal Printer Integration (ESC/POS)** | Not a "print to PDF" gimmick — this talks to actual USB thermal printers (Star TSP100 series, Epson TM series, Xprinter, etc.) via native OS print spooling, with a full **HTML receipt renderer** tuned for 71mm paper rolls. |
| 🛠️ **Built-in Printer Diagnostics** | A one-click diagnostic tool walks through USB detection, driver checks (WinUSB/Zadig), and a live test print — with a secondary **raw-bytes fallback test** that bypasses the escpos library entirely when drivers misbehave. This is the kind of troubleshooting tooling usually missing from POS boilerplates. |
| 💰 **Cash Drawer Kick (Serial/COM)** | Fires the industry-standard ESC/POS drawer-kick sequence directly over a COM port (works with Partner Tech and most RJ11-triggered drawers) — automatically on every completed sale, plus a manual "Test Drawer" button in Settings. |
| 📊 **Auto-Generated PDF Business Reports** | Generate polished, print-ready **Daily / Weekly / Monthly PDF reports** (KPI cards, daily breakdown, top products, full transaction ledger, and expenses) with a single click — rendered natively, no third-party reporting service. |
| ✏️ **Editable Sales History** | Unlike most POS systems where a completed sale is locked forever, transactions can be **reopened and edited** — swap items, adjust quantities/prices, or recalculate discounts and tax — with full audit-safe recalculation. |
| 📦 **Barcode Scanner, Zero Config** | Plug in any USB barcode scanner (HID keyboard-emulation type) and it just works — auto-detected by fast keystroke timing, no drivers or setup screens. |
| 🧮 **Live Tax, Discount & Change Calculator** | Real-time subtotal → discount → tax → total → change-due pipeline as you type, before you ever open the checkout modal. |
| 💵 **Expense Tracking Built In** | Log shop expenses (rent, stock, utilities, salaries) alongside sales, and see true **Net Profit (Revenue − Expenses)** on every generated report — most POS templates only track sales, not outgoings. |
| 🗄️ **100% Local & Offline** | SQLite (via `better-sqlite3`) with WAL mode — your data never leaves your machine, no subscription, no internet dependency, no monthly SaaS fee. |

---

## 🧩 Core Modules

- **Dashboard** — today's/monthly revenue, transaction counts, low-stock alerts, recent sales, and top-selling products at a glance.
- **New Sale (POS)** — category-filtered product grid, live search, barcode scanning, cart management, and the Sale/Repair toggle.
- **Products** — full CRUD, category assignment, low-stock thresholds, stock adjustment (+/-), CSV export.
- **Categories** — quick add/delete with automatic product re-linking on deletion.
- **Sales History** — date-filtered ledger with view/edit/delete, CSV export, and one-click PDF report generation.
- **Repair History** — a dedicated, searchable log of every repair job with device/fault details.
- **Expenses** — categorized expense logging with date-range filtering.
- **Settings** — shop branding, currency & tax rate, thermal printer configuration, cash drawer COM port, and printer diagnostics — all in one place.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Application Shell | [Electron](https://www.electronjs.org/) |
| Database | SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (WAL mode) |
| Frontend | Vanilla JS, HTML5, CSS3 (no framework bloat) |
| Printing | ESC/POS over USB, Windows GDI print spooler (`webContents.print`), `escpos` / `escpos-usb` |
| Cash Drawer | Raw serial byte writes via PowerShell `System.IO.Ports.SerialPort` |
| Reports | Native HTML → PDF rendering via Electron's `printToPDF` |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) (LTS recommended)

### Installation
```bash
git clone https://github.com/waleed0537/POS-Sysetm.git
cd POS-Sysetm
npm install
npm start
```

### Build a Windows Installer
```bash
npm run package
```
The installer is generated in the `dist/` folder — share it with anyone, no Node.js required on their machine.

---

## 🖨️ Thermal Printer Setup

1. Connect any ESC/POS-compatible USB thermal printer (Star, Epson, Xprinter, POS-80, etc.).
2. Go to **Settings → Thermal Printer → Enable**, set the printer/port name, and save.
3. Use **Printer Diagnostics** in Settings to auto-detect the device, verify USB permissions, and send a live test page.
4. Print any receipt directly from the checkout confirmation, Sales History, or Repair History.

**Windows USB permission issues?** Install the [Zadig](https://zadig.akeo.ie) WinUSB driver.
**Linux?**
```bash
sudo usermod -a -G dialout,plugdev $USER
```
then log out and back in.

## 💵 Cash Drawer Setup
Set the drawer's COM port in **Settings → Cash Drawer** (defaults to `COM1` for Partner Tech drawers), then hit **Test Open Drawer**. The drawer will also kick automatically on every completed sale.

---

## 📁 Data Location
| OS | Path |
|---|---|
| Windows | `%APPDATA%\mobile-shop-pos\pos.db` |
| macOS | `~/Library/Application Support/mobile-shop-pos/pos.db` |
| Linux | `~/.config/mobile-shop-pos/pos.db` |

Back this file up regularly — it holds every sale, product, and setting.

---

## ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `F1` | Open New Sale |
| `Esc` | Close active modal |

---

## 📄 License
This project is provided as-is for personal and commercial deployment in your own shop. Add a license of your choice here (MIT recommended for open-source distribution).

---

## 🤝 Contributing
Issues and pull requests are welcome — especially around additional thermal printer models, receipt template customization, and multi-user/employee login support.
