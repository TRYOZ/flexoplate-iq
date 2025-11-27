# FlexoPlate IQ

**Plate Equivalency & Exposure Calculator for Flexographic Printing**

A web application that helps plate room operators and technical managers:
- Find equivalent plates across different suppliers
- Calculate exposure times based on current UV lamp intensity
- Save and manage exposure recipes

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│    Database     │
│    (Next.js)    │     │   (FastAPI)     │     │  (PostgreSQL)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Quick Deploy to Railway

Railway is the easiest way to deploy this full-stack application.

### Prerequisites
1. A GitHub account
2. A Railway account (sign up at [railway.app](https://railway.app) with GitHub)

### Step-by-Step Deployment

#### 1. Push to GitHub

First, create a new repository on GitHub:
1. Go to https://github.com/new
2. Name it `flexoplate-iq`
3. Keep it private (recommended)
4. Click "Create repository"

Then push this code (from your computer or using GitHub's web interface):

```bash
# If you have git installed locally:
cd flexoplate-iq
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/flexoplate-iq.git
git push -u origin main
```

Or upload the files directly via GitHub's web interface.

#### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `flexoplate-iq` repository
5. Railway will detect the monorepo structure

#### 3. Set Up Services

You need to create 3 services in Railway:

##### A. PostgreSQL Database
1. In your Railway project, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway automatically provisions the database
3. Click on the PostgreSQL service and go to **"Variables"**
4. Copy the `DATABASE_URL` value

##### B. Backend API
1. Click **"+ New"** → **"GitHub Repo"** → Select your repo
2. In service settings:
   - Set **Root Directory**: `backend`
   - Add environment variable: `DATABASE_URL` = (paste from PostgreSQL)
3. Railway will build and deploy the backend
4. Once deployed, copy the backend URL (e.g., `https://flexoplate-backend-xxxxx.railway.app`)

##### C. Frontend
1. Click **"+ New"** → **"GitHub Repo"** → Select your repo
2. In service settings:
   - Set **Root Directory**: `frontend`
   - Add environment variable: `NEXT_PUBLIC_API_URL` = (paste backend URL from step B)
3. Railway will build and deploy the frontend

#### 4. Initialize the Database

After the backend is deployed, you need to run the database migrations:

1. In Railway, click on your PostgreSQL service
2. Go to the **"Query"** tab
3. Copy and paste the contents of `database/001_schema.sql` and run it
4. Copy and paste the contents of `database/002_seed_data.sql` and run it

#### 5. Access Your App

Click on your frontend service and find the public URL. Your FlexoPlate IQ app is now live!

## Local Development (Optional)

If you want to run locally for development:

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:pass@localhost:5432/flexoplate"
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
export NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```

## Features

### Plate Equivalency Finder
- Select any plate from the catalog
- Find equivalent alternatives from other suppliers
- See similarity scores and compatibility notes
- Filter by target supplier, substrate, ink system

### Exposure Calculator
- Select plate and enter current UV intensity
- Get calculated exposure times for back, main, post-exposure, and detack
- Optional floor thickness targeting
- Print recipe cards for the plate room

### Plate Catalog
- Browse all plates with filtering
- Filter by supplier, process type, thickness
- View detailed specifications

## Technology Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, TypeScript
- **Backend**: Python FastAPI, asyncpg
- **Database**: PostgreSQL
- **Hosting**: Railway (recommended)

## Plate Data

The initial database includes plates from:
- XSYS (nyloflex series)
- DuPont (Cyrel series)
- Miraclon (FLEXCEL NX series)

You can add more plates through the database or a future admin interface.

## License

Internal use only. Contact for licensing information.
