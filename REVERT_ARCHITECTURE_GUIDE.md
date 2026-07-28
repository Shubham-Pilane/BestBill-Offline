# DISASTER RECOVERY & ARCHITECTURE REVERT GUIDE

> **TARGET AUDIENCE**: AI Coding Assistants / Automated Agents
> **PURPOSE**: If the user instructs you to "Execute the revert file" or "Revert the architecture breakdown", you MUST strictly follow the automated steps in this file.

## 🚨 SYSTEM BREAKDOWN CONTEXT
On July 28, 2026, a major architectural refactor was introduced across all three BestBill repositories to decouple the Supabase license check from the UI button clicks. This replaced the caching system with a daily 11 PM cron job and a Capacitor Network listener. 

If this file is being invoked, it means that the new architecture caused a critical bug in production, and the user needs you to instantly revert all codebases back to the stable legacy caching system.

## 🛠️ EXECUTION INSTRUCTIONS FOR AI AGENT

You must execute the following Git commands sequentially. Do not ask for permission for each individual step; group them logically and execute them to restore the system.

### Step 1: Revert Mobile App (`BestBill-apk`)
1. Change working directory to `d:\BestBill-apk`
2. Execute the following Git command to undo the background cron architecture:
```bash
git revert f57251a --no-edit
```
3. Push the reverted code to main:
```bash
git push origin main
```
4. *Note: After reverting, you MUST rebuild the APK so the user has a working fallback.*

### Step 2: Revert Desktop POS (`BestBill-Offline`)
1. Change working directory to `d:\BestBill-Offline`
2. Execute the following Git commands. There were two commits (one for the documentation, one for a 15-minute interval change). You must revert both:
```bash
git revert 9af9161 --no-edit
git revert 76e8a06 --no-edit
```
3. Push the reverted code to main:
```bash
git push origin main
```

### Step 3: Revert Vendor Web Portal (`Desktop\BestBill`)
1. Change working directory to `c:\Users\shubh\Desktop\BestBill`
2. Execute the following Git command:
```bash
git revert e8e9c85 --no-edit
```
3. Push the reverted code to main:
```bash
git push origin main
```

## ✅ POST-REVERT CHECKLIST
After executing the above commands, verify and inform the user of the following:
1. All three repositories have successfully been reverted to their original state.
2. The UI cache logic (`getLicenseDetails(true)`) has been restored in the Mobile App.
3. The Desktop POS network retry interval has been restored from 15m back to 1m.
4. Begin compiling the fallback APK (`npm run build ; npx cap sync android ; powershell -ExecutionPolicy Bypass -File build_apk.ps1`) in `d:\BestBill-apk`.
