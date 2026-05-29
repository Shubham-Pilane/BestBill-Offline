# BestBill POS: License Activation Guide

## How the License System Works

| Phase | Duration | Behavior |
|-------|----------|----------|
| **Free Trial** | First 30 days after hotel registration | Full access, no restrictions |
| **Trial Expired** | After 30 days | Owner login is blocked with expiry message |
| **Lifetime Activated** | After license key is entered | Unlimited lifetime access, no expiry |

---

## License File Location

The license file is stored at:

```
C:\Users\<USERNAME>\AppData\Roaming\bestbill-desktop\license.txt
```

> This is the same folder where `config.json` and `bestbill.db` are stored.

---

## How to Find the License File on Any PC

### Method 1: Windows Run Dialog (Fastest)
1. Press **`Win + R`** on the keyboard
2. Type the following and press **Enter**:
   ```
   %APPDATA%\bestbill-desktop
   ```
3. The folder opens directly — you will see `license.txt` inside

### Method 2: File Explorer Address Bar
1. Open **File Explorer** (any folder window)
2. Click the **address bar** at the top
3. Paste this path and press **Enter**:
   ```
   C:\Users\%USERNAME%\AppData\Roaming\bestbill-desktop
   ```

### Method 3: Open Directly in Notepad
1. Press **`Win + R`**
2. Type and press Enter:
   ```
   notepad "%APPDATA%\bestbill-desktop\license.txt"
   ```
3. The file opens in Notepad, ready to edit

---

## How to Activate Lifetime License

### Step-by-Step (Manual)

1. Open `license.txt` using any method above
2. You will see this content:
   ```
   # =====================================================================
   # BestBill POS Offline - Software License Activation File
   # =====================================================================
   # This offline desktop installation comes with a 30-day free trial.
   # To activate lifetime offline access, replace the key below with
   # your authorized premium license key.
   #
   # Contact Customer Care to purchase or request your activation key:
   #   Phone: +91 9822401802
   #   Email: bestbillcustomercare@gmail.com
   # =====================================================================

   ACTIVATION_KEY=TRIAL_MODE
   ```
3. Change `TRIAL_MODE` to the license key:
   ```
   ACTIVATION_KEY=X7P9K2M8Q4
   ```
4. **Save** the file (Ctrl + S)
5. **Restart** the BestBill application
6. Owner can now login with **lifetime access** ✅

### One-Line Quick Activation (Command Prompt)

If you want to do it in one shot without opening any file:

1. Press **`Win + R`**, type `cmd`, press Enter
2. Paste this command and press Enter:
   ```
   echo ACTIVATION_KEY=X7P9K2M8Q4 > "%APPDATA%\bestbill-desktop\license.txt"
   ```
3. Restart the BestBill app — **done!**

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `license.txt` file not found | Start the BestBill app once — it auto-creates the file on first boot |
| Key entered but still blocked | Make sure there are no extra spaces around the key. It must be exactly: `ACTIVATION_KEY=X7P9K2M8Q4` |
| File is read-only | Right-click the file → Properties → Uncheck "Read-only" → Apply |
| Owner still can't login after activation | Fully close and restart the BestBill desktop app (the key is checked at login time) |

---

## Important Notes

- The license key is: **`X7P9K2M8Q4`**
- The key is checked **every time the owner logs in**
- Waiters/staff are **not affected** by the trial — only owner login is restricted
- The file must contain exactly `ACTIVATION_KEY=X7P9K2M8Q4` (no extra spaces, no quotes)
- Lines starting with `#` are comments and are ignored

---

## Customer Care

**Founder of BestBill – Shubham Pilane**

📞 Mobile: +91 9822401802
📧 Email: bestbillsolutions@gmail.com

For any support, queries, or technical assistance, please contact us.
