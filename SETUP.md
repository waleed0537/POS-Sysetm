# MobileShop POS — Complete Setup Guide

## What's Included
- Dashboard with daily/monthly stats
- New Sale (POS) with cart, discount, tax, change calculator
- Product management with stock tracking and low-stock alerts
- Categories management
- Sales history with date filter and CSV export
- Expense tracker
- Settings (shop info, tax rate, currency, receipt footer)
- Thermal printer support (ESC/POS via USB)
- Barcode scanner support (plug USB scanner, auto-detects)
- Keyboard shortcut: F1 = New Sale, Escape = close modal

---

## Prerequisites

### 1. Install Node.js
Download from: https://nodejs.org  
Choose the **LTS version** (Long Term Support)

After installing, verify in Command Prompt / Terminal:
```
node --version
npm --version
```
Both should print version numbers.

---

## Step-by-Step Installation

### Step 1 — Get the project files
Copy the entire `pos-system` folder to your computer.
Example: `C:\pos-system` on Windows or `~/pos-system` on Mac/Linux.

### Step 2 — Open Terminal / Command Prompt
**Windows:** Press Win+R, type `cmd`, press Enter.  
**Mac/Linux:** Open Terminal application.

Navigate to the project folder:
```
cd C:\pos-system
```
(Replace with your actual path)

### Step 3 — Install dependencies
```
npm install
```
This downloads Electron, SQLite, and all other required packages.
It may take 2–5 minutes on first run.

### Step 4 — Run the app
```
npm start
```
The POS window should open immediately.

---

## Thermal Printer Setup

### Supported Printers
Any thermal printer that supports **ESC/POS protocol** works.
Most common brands: Epson TM series, Star, Xprinter, RP80, POS-80, etc.

### Steps
1. Connect your thermal printer via USB.
2. In the POS app, go to **Settings → Thermal Printer → Enable**.
3. Save settings.
4. When you complete a sale, click **🖨 Print Receipt** in the receipt popup.

### Troubleshooting Printer
If printing fails:
```
npm install escpos escpos-usb
```
Then restart the app (`npm start`).

On **Windows**, if you get a USB permission error:
- Install the Zadig USB driver tool: https://zadig.akeo.ie
- Select your printer → Install WinUSB driver

On **Linux**, add USB permission:
```
sudo usermod -a -G dialout $USER
sudo usermod -a -G plugdev $USER
```
Then log out and back in.

---

## Barcode Scanner Setup

**No software setup needed.**  
USB barcode scanners appear as keyboard input. Just:
1. Plug in your USB barcode scanner.
2. Go to **New Sale** page.
3. Click the search bar (or press F1 to go to POS).
4. Scan any barcode — it auto-fills and adds to cart.

Make sure your products have barcodes entered in the **Products** page.

---

## Building a Desktop Installer (.exe for Windows)

To create a standalone installer that doesn't need Node.js installed:

```
npm run package
```

The installer will be created in the `dist/` folder.
Share `dist/MobileShop POS Setup.exe` with anyone — they just run it.

---

## Daily Usage Guide

### Making a Sale
1. Press **F1** or click **New Sale**.
2. Click products or scan barcodes to add to cart.
3. Adjust quantities with +/- buttons.
4. Add discount if needed.
5. Click **Checkout →**.
6. Select payment method, enter amount received.
7. Click **Complete Sale**.
8. Print receipt if needed.

### Adding Products
1. Go to **Products → + Add Product**.
2. Fill in name, price, stock quantity.
3. Add barcode if you want scanner support.
4. Set "Low Stock Alert" threshold (default: 5).

### Managing Stock
- In **Products**, click **Stock** next to any product.
- Enter a positive number to add stock (+10).
- Enter a negative number to remove (-5).

### Viewing Reports
- Go to **Sales History**.
- Change date range to filter.
- Click **Export CSV** to export to Excel.

### Recording Expenses
- Go to **Expenses → + Add Expense**.
- Enter description, amount, and category.
- Use date filter to view expenses for any period.

---

## Keyboard Shortcuts
- **F1** — Open New Sale
- **Escape** — Close any popup/modal

---

## Data Location
Your database file (all sales, products, settings) is stored at:
- **Windows:** `C:\Users\<YourName>\AppData\Roaming\mobile-shop-pos\pos.db`
- **Mac:** `~/Library/Application Support/mobile-shop-pos/pos.db`
- **Linux:** `~/.config/mobile-shop-pos/pos.db`

**Back this file up regularly!**

---

## Updating the App
To get new features, replace the source files and run `npm install` again.
Your database (data) is stored separately and won't be affected.

---

## Common Errors

| Error | Fix |
|-------|-----|
| `Cannot find module 'better-sqlite3'` | Run `npm install` |
| `Cannot find module 'escpos-usb'` | Run `npm install escpos escpos-usb` |
| Printer not found | Check USB connection, see Printer Troubleshooting above |
| App won't start | Make sure Node.js is installed. Run `node --version` to check |
| White screen | Run `npm start` from inside the `pos-system` folder |
