# 📋 Naukri Profile Auto-Sync (100% Serverless Cloud)

Daily automated Naukri profile updater that re-uploads your resume (`Shuaib Ali - CV.pdf`) and touches your resume headline every morning strictly between **09:00 AM – 09:30 AM IST**.

Runs 100% on GitHub Actions cloud (zero local computer required).

---

## 🎯 Goal
Keeps your candidate profile tagged as **"Active Today" / "Profile Last Updated: Today"** at the very top of recruiter search results on Naukri.com.

---

## 🔐 GitHub Repository Secrets Setup
Add the following 2 repository secrets in **Settings -> Secrets and variables -> Actions**:

| Secret Name | Value |
|---|---|
| `NAUKRI_USERNAME` | Your Naukri Email ID (e.g. `shuaib.ali6347@gmail.com`) |
| `NAUKRI_PASSWORD` | Your Naukri Account Password |

*(Optional: If you prefer cookies instead of password, you can also provide `NAUKRI_SESSION_JSON`).*

---

## ⏰ Schedule & Execution
GitHub Actions will automatically run every morning at:
- **08:45 AM - 09:10 AM IST** (Slot 1: 03:15 UTC)
- **09:15 AM - 09:25 AM IST** (Slot 2: 03:30 UTC)

No computer needs to remain turned on.
