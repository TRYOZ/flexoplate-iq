# 🚀 FlexoPlate IQ - Deployment Guide (No Coding Required)

This guide walks you through deploying your app with just clicking and copy-pasting.

---

## STEP 1: Get the Code on GitHub (10 minutes)

### Option A: Upload via GitHub Web (Easiest)

1. **Create GitHub Account** (if you don't have one)
   - Go to https://github.com
   - Click "Sign up" and follow the steps

2. **Create a New Repository**
   - Click the `+` button (top right) → "New repository"
   - Name: `flexoplate-iq`
   - Select: "Private"
   - Click "Create repository"

3. **Upload Files**
   - On your new repo page, click "uploading an existing file"
   - Drag and drop the entire `flexoplate-iq` folder contents
   - Click "Commit changes"

### Option B: Use GitHub Desktop (More Reliable)

1. Download GitHub Desktop: https://desktop.github.com
2. Sign in with your GitHub account
3. File → Add Local Repository → Select the flexoplate-iq folder
4. Click "Publish repository"

---

## STEP 2: Deploy on Railway (15 minutes)

### A. Create Railway Account

1. Go to https://railway.app
2. Click "Login" → "Login with GitHub"
3. Authorize Railway to access your GitHub

### B. Create New Project

1. Click **"New Project"** (big button, top right)
2. Click **"Deploy from GitHub repo"**
3. Find and select `flexoplate-iq`
4. Click **"Deploy Now"**

Railway will try to deploy but will fail - that's OK! We need to configure it properly.

### C. Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"**
3. Select **"Add PostgreSQL"**
4. Wait for it to provision (30 seconds)
5. Click on the PostgreSQL box
6. Go to **"Variables"** tab
7. Find `DATABASE_URL` and click the copy icon 📋

**Save this URL somewhere - you'll need it!**

### D. Configure Backend Service

1. Click on the service that was auto-created (probably shows an error)
2. Go to **"Settings"** tab
3. Under "Source", set **Root Directory** to: `backend`
4. Go to **"Variables"** tab
5. Click **"+ New Variable"**
   - Name: `DATABASE_URL`
   - Value: (paste the URL you copied from PostgreSQL)
6. Click **"Deploy"** or it will auto-deploy

Wait for the backend to deploy (green checkmark). Then:
7. Go to **"Settings"** → **"Networking"**
8. Click **"Generate Domain"**
9. Copy the URL (like `https://flexoplate-iq-backend-production-xxxx.up.railway.app`)

### E. Create Frontend Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your `flexoplate-iq` repo again
3. Railway creates a new service
4. Click on the new service
5. Go to **"Settings"** tab
6. Set **Root Directory** to: `frontend`
7. Go to **"Variables"** tab
8. Click **"+ New Variable"**
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: (paste the backend URL from step D.9)
9. Wait for it to deploy

### F. Set Up Frontend Domain

1. Click on your frontend service
2. Go to **"Settings"** → **"Networking"**
3. Click **"Generate Domain"**
4. This is your app URL!

---

## STEP 3: Initialize Database (5 minutes)

Your app is deployed but has no data yet. Let's add the tables and sample plates.

1. In Railway, click on your **PostgreSQL** service
2. Go to the **"Data"** tab
3. Click **"Query"** button

### Run Schema (creates tables)

4. Open the file `database/001_schema.sql` in a text editor
5. Copy ALL the contents
6. Paste into Railway's query box
7. Click **"Run Query"**
8. You should see "Query executed successfully"

### Run Seed Data (adds plates)

9. Open the file `database/002_seed_data.sql`
10. Copy ALL the contents
11. Paste into Railway's query box (clear the previous query first)
12. Click **"Run Query"**

---

## STEP 4: Test Your App! 🎉

1. Click on your frontend service in Railway
2. Find the public URL in Settings → Networking
3. Open it in your browser
4. You should see FlexoPlate IQ with plates loaded!

### Quick Test

1. **Equivalency Page**: Select "nyloflex FTF 1.14" and see equivalent plates from DuPont and Miraclon
2. **Exposure Page**: Select a plate, enter intensity (e.g., 18), click Calculate
3. **Plates Page**: Browse and filter all plates

---

## Troubleshooting

### "Connection Error" on the app
- Check that your backend deployed successfully (green status)
- Check that `NEXT_PUBLIC_API_URL` is set correctly in frontend variables
- Make sure it starts with `https://`

### "No plates found"
- Make sure you ran both SQL files in step 3
- Check the PostgreSQL Data tab to verify tables exist

### Backend shows errors
- Check that `DATABASE_URL` is set in backend variables
- Click "View Logs" to see specific error messages

### Build fails
- Make sure Root Directory is set correctly:
  - Backend: `backend`
  - Frontend: `frontend`

---

## Costs

Railway's free tier includes:
- $5 of usage credits per month
- Usually enough for development and light use
- Add payment method for production use

---

## Next Steps

Once your app is running:

1. **Add more plates**: Run INSERT statements in Railway's Query tab
2. **Share with team**: Give them the frontend URL
3. **Custom domain**: Add your own domain in Railway settings

Need help? Feel free to ask!
