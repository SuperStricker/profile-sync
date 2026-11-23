# 📋 Naukri Profile Auto-Sync

Daily automated Naukri profile updater that re-uploads your resume (`Shuaib Ali - CV.pdf`) and touches your resume headline every morning strictly between **09:00 AM – 09:30 AM IST**.

## 🎯 Goal
Keeps your candidate profile tagged as **"Active Today" / "Profile Last Updated: Today"** at the very top of recruiter search results on Naukri.com.

---

## 🚀 Setup Instructions

### 1. Local Login & Session Capture
Run the interactive login helper to create `session.json`:
```powershell
node save-session.js
```
A browser window will open. Log into your Naukri account (Email/Password or OTP). Once you reach the dashboard, press **Enter** in the terminal.

### 2. Add GitHub Action Secret
1. Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Click **New repository secret**.
   - Name: `NAUKRI_SESSION_JSON`
   - Value: Copy & paste the entire text inside `session.json`.

### 3. Schedule & Execution
GitHub Actions will automatically run every morning at:
- **08:45 AM - 09:10 AM IST** (Slot 1: 03:15 UTC)
- **09:15 AM - 09:25 AM IST** (Slot 2: 03:30 UTC)

No computer needs to remain turned on.
