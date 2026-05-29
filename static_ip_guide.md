# BestBill POS: Fixed/Static IP Configuration Guide

To ensure that your waiters can always log in and guests can scan the QR code to order without the IP address changing, you must lock the IP address of your host computer.

Here are the detailed steps for the two methods: **Option A (DHCP Address Reservation)** and **Option B (Static IP in Windows)**.

---

## Option A: DHCP Address Reservation (Recommended)
This method configures your Wi-Fi router to always assign the same IP address to your computer. It is the most stable method because it prevents network address conflicts.

### Step 1: Find your computer's Physical (MAC) Address
Every network card has a unique hardware fingerprint called a MAC address. The router uses this to identify your computer.
1. Press the **Windows Key + R** on your keyboard to open the Run dialog.
2. Type `cmd` and press **Enter** to open the Command Prompt.
3. Type the following command and press **Enter**:
   ```bash
   getmac /v
   ```
4. Look for your active connection (Wi-Fi or Ethernet) and note down the **Physical Address** (it will look like `00-1A-2B-3C-4D-5E`).

### Step 2: Log into your Wi-Fi Router
1. Open a web browser (Chrome, Edge, etc.) on your computer.
2. Type your router's gateway address in the URL bar and press **Enter**. The most common router addresses are:
   * **`192.168.1.1`** (TP-Link, Asus, Netgear)
   * **`192.168.0.1`** (D-Link, Tenda)
   * **`192.168.18.1`** / **`192.168.31.1`** (Huawei, Xiaomi)
3. Enter your router's username and password. 
   *(If you haven't changed it, the default login details are usually printed on a sticker underneath your physical router. Common defaults are Username: `admin` / Password: `admin` or blank).*

### Step 3: Configure the Reservation
The menu name varies slightly depending on your router brand:
* **TP-Link**: Go to **Advanced** ➡️ **Network** ➡️ **DHCP Server** ➡️ **Address Reservation**. Click **Add**.
* **D-Link**: Go to **Settings** ➡️ **Network** ➡️ **Dynamic DHCP** ➡️ **Active IP Address Reservation**. Click **Add**.
* **Netgear**: Go to **Advanced** ➡️ **Setup** ➡️ **LAN Setup** ➡️ **Address Reservation**. Click **Add**.
* **Tenda**: Go to **Administration** ➡️ **IP MAC Binding** / **DHCP Client**.

1. Enter your computer's **Physical (MAC) Address** that you found in Step 1.
2. Enter the **IP Address** you want to assign (e.g., `192.168.1.100` or whatever your current IP is).
3. Click **Save** or **Apply**.
4. Restart your router and your computer. Your IP address is now permanently locked!

---

## Option B: Set a Static IP directly in Windows
If you do not know your router's password, you can configure the static IP directly in Windows.

### Step 1: Open Network Connection Properties
1. Open the Windows Start Menu, type **Network Connections**, and click **View network connections**.
2. Right-click on your active network adapter (usually named **Wi-Fi** or **Ethernet**) and select **Properties**.
3. In the list, click on **Internet Protocol Version 4 (TCP/IPv4)** to select it, then click **Properties**.

### Step 2: Configure manual IP settings
1. Change the selection from *Obtain an IP address automatically* to **Use the following IP address**.
2. Fill in the fields with these values (replace `1` with `0` if your router's address is `192.168.0.x`):
   * **IP address**: `192.168.1.200` 
     *(Using `.200` at the end is recommended to avoid conflicts with lower numbers like `.100`, which are automatically given to phones).*
   * **Subnet mask**: `255.255.255.0`
   * **Default gateway**: `192.168.1.1` *(Your Wi-Fi Router's IP address)*
3. Select **Use the following DNS server addresses**:
   * **Preferred DNS server**: `8.8.8.8` *(Google's Fast DNS)*
   * **Alternate DNS server**: `8.8.4.4`
4. Check the box **Validate settings upon exit** and click **OK**.
5. Click **OK** on the parent window. Windows will test the connection. Your IP is now fixed!


---

## Configuring Fixed IP for Wi-Fi / LAN Printers (Crucial for Printing)

Just like the main computer, any **Wi-Fi or LAN thermal receipt/KOT printer** must have a locked (static) IP address. If the router changes the printer's IP address automatically, BestBill will lose connection and kitchen orders (KOTs) or bills will fail to print.

There are **two ways** to lock a printer's IP address:

### Option 1: Router Address Reservation (Highly Recommended)
This is the easiest and most stable method.

1. **Find the Printer's MAC Address & Current IP:**
   * Turn the thermal printer **OFF**.
   * Hold the **Feed** button down and turn the printer **ON**.
   * Keep holding **Feed** for 3–5 seconds until it prints a self-test configuration receipt.
   * Look on the receipt for **MAC Address** (looks like `00:11:22:33:44:55`) and the current **IP Address**.
2. **Log into your Wi-Fi Router** (Follow **Step 2** from *Option A* above).
3. **Add the Reservation:**
   * Go to your router's **Address Reservation** page (Follow **Step 3** from *Option A*).
   * Enter the printer's **MAC Address**.
   * Enter a high IP address to avoid conflicts (e.g., `192.168.1.250` or `192.168.0.250`, matching your network range).
   * Click **Save** and restart both the router and the printer.

---

### Option 2: Set Static IP Directly on the Printer
Most network printers have a built-in configuration webpage where you can set a permanent static IP.

1. Find the printer's current IP address by printing a self-test page (hold **Feed** while turning ON).
2. Open a web browser on your computer and type the printer's current IP address (e.g., `192.168.1.192`) in the address bar, then press **Enter**.
3. Locate the **Configuration / Network / TCP-IP** settings tab.
4. Change the IP configuration from **DHCP / Auto** to **Static / Fixed**.
5. Set your desired static IP address (e.g., `192.168.1.250`) and make sure the **Subnet Mask** is `255.255.255.0` and the **Gateway** matches your router's IP (e.g., `192.168.1.1`).
6. Click **Save / Apply** and restart the printer.
7. Enter this IP in BestBill's printer configuration settings under **Profile Settings**.

---

## Summary Comparison
| Feature | Option A (Router-Based) | Option B (Windows-Based) |
| :--- | :--- | :--- |
| **Setup Time** | 5 mins (Requires router password) | 1 min (No router login needed) |
| **Stability** | **Excellent** (No IP Address Conflicts) | Good (IP conflict possible if setup wrong) |
| **Portability** | **Perfect** (Can connect to other Wi-Fis) | Poor (Must revert to Automatic on other Wi-Fis) |
| **Ease of Use** | Set and forget | Fast to set up immediately |
