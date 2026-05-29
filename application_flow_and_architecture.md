# 1. BestBill POS - Offline Application Flow & Architecture Guide

This manual describes the offline-first application flow, component execution lifecycle, local network topology, and spooled hardware printer architecture of the **BestBill Desktop POS** on a customer's computer.

---

## 1. System Architecture Overview

BestBill POS operates as a self-contained, 100% self-hosted local application. It requires zero active internet connections or third-party cloud APIs to perform standard hotel management, table booking, dine-in billing, and kitchen order ticket (KOT) operations.

```mermaid
graph TB
    subgraph "CUSTOMER PC (CASHIER COUNTER)"
        A["Electron App Container"] <-->|"Preload Secure IPC Bridge"| B["React Frontend (Vite Build)"]
        B <-->|"Local TCP Loopback (Port 5000)"| C["Local Express Node.js Server"]
        C <-->|"Synchronous Dual-Driver SQL"| D[("bestbill.db (SQLite)")]
        C -->|"Raw ESC/POS Spooler Queue"| E["printerManager.js (Queue)"]
        E -->|"Win32 Spooler via PowerShell"| F["Cashier USB Thermal Printer"]
        C -->|"Transactional Backup Engine"| G["backups/ Folder (Midnight Zip)"]
    end
    
    subgraph "LOCAL WI-FI AREA NETWORK"
        H["Waiter Tablet 1 (Mobile Browser)"] <-->|"Port 5000"| C
        I["Waiter Tablet 2 (Mobile Browser)"] <-->|"Port 5000"| C
        E -->|"Raw TCP Sockets (Port 9100)"| J["Kitchen KOT Wi-Fi Printer"]
    end

    style A fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style B fill:#0369a1,stroke:#0ea5e9,stroke-width:1px,color:#fff
    style C fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#fff
    style D fill:#14532d,stroke:#16a34a,stroke-width:2px,color:#fff
    style F fill:#7c2d12,stroke:#ea580c,stroke-width:1px,color:#fff
    style G fill:#581c87,stroke:#9333ea,stroke-width:1px,color:#fff
    style J fill:#7c2d12,stroke:#ea580c,stroke-width:1px,color:#fff
```

---

## 2. Component Bootstrapping Sequence

When the cashier double-clicks the BestBill POS shortcut on the desktop, the application executes the following sequential steps to initialize the environment:

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Cashier / Operator
    participant Electron as Electron Main (main.js)
    participant Express as Headless Express Server
    participant SQLite as SQLite Database (bestbill.db)
    participant UI as Electron BrowserWindow (React)

    Cashier ->> Electron: Double-clicks Desktop Shortcut
    activate Electron
    Electron ->> Electron: Resolves AppData/Roaming/BestBill Folder
    Electron ->> Express: Spawns express application listening on Port 5000
    activate Express
    Express ->> SQLite: Checks for active SQLite database file
    activate SQLite
    alt Database file does not exist (First Boot)
        SQLite -->> Express: File missing
        Express ->> Express: Executes migrate.js (Creates tables & unique indexes)
    else Database file exists
        SQLite -->> Express: Database active
    end
    deactivate SQLite
    Express -->> Electron: Local API server fully online
    deactivate Express
    Electron ->> UI: Launches BrowserWindow pointing to http://localhost:5000
    activate UI
    UI -->> Cashier: Displays POS login dashboard portal
    deactivate UI
    deactivate Electron
```

---

## 3. Order Placement & Print Spooler Sequence

When waiters submit a Dine-In table order or cashiers print guest receipts, the backend processes operations thread-safely via our custom offline spool queue manager:

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Waiter / Cashier
    participant UI as React UI (Client)
    participant Router as Express Router (tables.js / bills.js)
    participant DB as SQLite DB Engine
    participant Formatter as printFormatter.js (ESC/POS)
    participant Spooler as printerManager.js (Queue)
    participant Printer as Local POS Printer Hardware

    Staff ->> UI: Clicks "Send to Kitchen" or "Mark Paid & Print"
    UI ->> Router: Sends HTTP POST request with Order/Bill payload
    activate Router
    Router ->> DB: Executes SQL updates to mark status / persist transactions
    DB -->> Router: DB Write Successful
    Router ->> Formatter: Routes JSON dataset to convert into receipt bytes
    activate Formatter
    Formatter ->> Formatter: Generates ESC/POS byte buffer & local UPI QR code
    Formatter -->> Router: Returns formatted Binary ESC/POS Buffer
    deactivate Formatter
    Router ->> Spooler: Calls queueJob({ type, payload })
    activate Spooler
    Spooler ->> Spooler: Pushes job into printQueue memory array
    Spooler ->> Spooler: Calls processQueue() thread-safely
    alt Connection Type is USB / Windows Local
        Spooler ->> Spooler: Generates native raw C# spooler print wrapper script
        Spooler ->> Printer: Spools binary payload silently via background PowerShell
    else Connection Type is Network (LAN / Wi-Fi)
        Spooler ->> Printer: Transmits binary raw payload over TCP Socket (Port 9100)
    end
    Printer -->> Spooler: Printing spooled successfully
    deactivate Spooler
    Router -->> UI: Returns HTTP 200 OK (Success Response)
    deactivate Router
    UI -->> Staff: Displays toast: "Sent to printer successfully!"
```

---

## 4. Key Offline Architectural Fail-Safes

To ensure 100% operation uptime on customer cash counters, the offline POS includes these resilient features:

### A. Dual-Driver Database Strategy
To prevent native package compiler bottlenecks (like missing Visual C++ dependencies on the customer's PC), our database adapter dynamically selects the best driver at runtime:
1.  **Built-in `node:sqlite` (Primary)**: Uses Node.js's official built-in synchronous SQLite library. It requires zero compilation, zero downloads, and runs natively on Node >= 22.5.0.
2.  **Fallback `better-sqlite3` (Secondary)**: Used if the computer runs an older Node version. If native compilation fails during setup, NPM completely ignores the issue, preventing setup crashes.

### B. Auto-healing Spooler Retries
The `printerManager.js` features a thread-safe execution loop:
*   If a thermal printer goes offline (e.g. out of paper or power cut), it logs the fail and attempts to **retry printing 3 times with 2-second intervals**.
*   After maximum retries, the job is cleanly dropped to avoid blocking subsequent waiter orders.

### C. Isolated Offline Backups
The database uses a transactional backup script:
*   A nightly scheduler creates a robust SQLite `.backup()` and zips it up with config files.
*   Zipping transactions prevents backup corruption even if the computer suffers a sudden power failure mid-operation.
