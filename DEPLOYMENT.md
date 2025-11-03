# Deployment Guide

This guide will help you deploy the Medical Dashboard to make it accessible to other users.

## Changes Made

All necessary code changes have been made for deployment:

1. **API URL Configuration** (`src/api/localClient.js`)
   - Now uses environment variable `VITE_API_BASE_URL`
   - Falls back to localhost for local development

2. **Production Server** (`requirements.txt`)
   - Added `gunicorn==21.2.0` for production deployment
   - Commented out local medical articles library path

3. **Security Improvements** (`backend/app.py`)
   - Passwords are now properly hashed using Werkzeug
   - CORS is restricted in production mode
   - Requires `FRONTEND_URL` environment variable for production CORS

4. **Deployment Configuration** (`Procfile`)
   - Created Procfile for Render.com deployment

5. **Weekly Article Fetching** (`backend/app.py`)
   - Added `/api/admin/articles/fetch-weekly` endpoint
   - Supports both admin JWT authentication and cron token for automated scheduling
   - Runs processing in background thread to avoid timeouts

## Deployment Steps

### Backend on Render.com (Free Tier)

1. **Sign up at https://render.com** (free tier available)

2. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select your repository

3. **Configure Service:**
   - **Name**: `medicaldash-backend` (or your choice)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: (leave blank, uses Procfile automatically)
   - **Root Directory**: (leave blank)

4. **Set Environment Variables:**
   ```
   SECRET_KEY=<generate a strong random string>
   JWT_SECRET_KEY=<generate a different strong random string>
   DATABASE_URL=sqlite:///app.db
   FLASK_ENV=production
   FRONTEND_URL=https://internal-medicine-app.vercel.app
   PORT=10000
   CRON_SECRET_TOKEN=<generate a strong random string for cron jobs>
   PUBMED_EMAIL=<your-email@example.com> (optional, recommended for PubMed API)
   ```
   
   **Generate secrets:**
   ```bash
   # On Mac/Linux:
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   # Run this twice: once for SECRET_KEY, once for JWT_SECRET_KEY, once for CRON_SECRET_TOKEN
   ```

5. **Deploy** → Render will automatically deploy your service
   - Note: Free tier services sleep after 15 min inactivity
   - First request after sleep takes ~30 seconds to wake up

### Frontend on Vercel (Free Tier)

1. **Sign up at https://vercel.com** (free tier available)

2. **Import Project:**
   - Click "Add New..." → "Project"
   - Import your GitHub repository

3. **Configure Project:**
   - **Framework Preset**: Vite (should auto-detect)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)
   - **Root Directory**: `./` (root of repo)

4. **Set Environment Variables:**
   ```
   VITE_API_BASE_URL=https://medicaldash-backend.onrender.com/api
   ```
   Using your live backend URL: `https://medicaldash-backend.onrender.com`

5. **Deploy** → Vercel will build and deploy your frontend

6. **Update Backend CORS:**
   - Go back to Render dashboard
   - Update `FRONTEND_URL` environment variable with your Vercel URL
   - Redeploy if needed

## Important Notes

### Existing Users
⚠️ **Warning**: After deploying with password hashing, existing users with plain text passwords will need to re-register or have their passwords reset manually in the database.

### Medical Articles Library
The medical articles library path in `requirements.txt` is commented out. If you need it in production:
- Package it as a proper Python package
- Or adjust the path for your deployment environment
- Or install it separately on Render

### Database
- Currently using SQLite (works for small projects)
- For production with multiple users, consider PostgreSQL (Render offers free PostgreSQL)
- To migrate: Change `DATABASE_URL` to PostgreSQL connection string

### Free Tier Limitations

**Render:**
- Services sleep after 15 min of inactivity
- First request after sleep: ~30 second wake-up time
- 750 hours/month (enough for always-on if not sleeping)

**Vercel:**
- Unlimited static hosting
- Generous bandwidth limits
- Perfect for side projects

## Weekly Article Fetching

The backend includes an endpoint to automatically fetch and classify articles from the last 7 days. Since Render's free tier doesn't support cron jobs, you'll need to use an external cron service.

### Setting Up Automated Weekly Fetching

1. **Get your backend URL and cron token:**
   - Your backend URL: `https://medicaldash-backend.onrender.com` (or your Render URL)
   - Your cron token: The `CRON_SECRET_TOKEN` you set in Render environment variables

2. **Set up an external cron service** (recommended: **cron-job.org** - free):
   - Go to https://cron-job.org (free account available)
   - Create a new cron job
   - **URL**: `https://medicaldash-backend.onrender.com/api/admin/articles/fetch-weekly`
   - **Method**: POST
   - **Schedule**: Weekly (e.g., every Monday at 2:00 AM)
   - **Headers**: Add custom header `X-Cron-Token: <your-cron-secret-token>`
   - Or use query parameter: `?token=<your-cron-secret-token>`
   - Save the cron job

3. **Alternative: Use curl from your own server:**
   ```bash
   # Run this weekly (e.g., via cron on your own server):
   curl -X POST https://medicaldash-backend.onrender.com/api/admin/articles/fetch-weekly \
     -H "X-Cron-Token: <your-cron-secret-token>"
   ```

4. **Manual triggering (admin only):**
   - Log in as admin in your app
   - Make a POST request to `/api/admin/articles/fetch-weekly` with your JWT token
   - Or use curl:
   ```bash
   curl -X POST https://medicaldash-backend.onrender.com/api/admin/articles/fetch-weekly \
     -H "Authorization: Bearer <your-jwt-token>"
   ```

### How It Works

- The endpoint accepts either:
  - Admin JWT token (for manual triggering)
  - `CRON_SECRET_TOKEN` (for automated cron services)
- Processing runs in a background thread to avoid timeouts
- The endpoint returns immediately with status 202 (Accepted)
- Processing typically takes 5-30 minutes depending on the number of articles
- Check Render logs to see processing status

### Important Notes

⚠️ **Render Free Tier**: Services sleep after 15 minutes of inactivity. The first request to wake up the service takes ~30 seconds. For weekly fetching:
- This delay is acceptable since it runs weekly
- The cron service will wake up the Render service automatically
- Consider upgrading to Render paid tier if you need faster wake-up times

## Testing

1. Test your deployed backend:
   ```bash
   curl https://medicaldash-backend.onrender.com/api/health
   ```

2. Visit your Vercel URL and test:
   - User registration
   - Login
   - All functionality

## Troubleshooting

### Backend won't start on Render
- Check the build logs in Render dashboard
- Ensure `Procfile` is in the root directory
- Verify all dependencies in `requirements.txt` are installable

### Frontend can't connect to backend
- Verify `VITE_API_BASE_URL` is set correctly in Vercel
- Check backend CORS configuration
- Ensure backend `FRONTEND_URL` matches your Vercel URL

### CORS errors
- Make sure `FRONTEND_URL` in backend matches your Vercel domain exactly (including https://)
- Check browser console for specific CORS error messages

## Cost

**Total: $0/month** (using free tiers)

- Render free tier: 750 hours/month
- Vercel free tier: Unlimited static hosting
- SQLite: No database service needed

## Next Steps (Optional)

1. **Custom Domain:**
   - Add custom domain in Vercel (free)
   - Add custom domain in Render (free)
   - Update environment variables

2. **Database Migration:**
   - Set up PostgreSQL on Render (free tier available)
   - Update `DATABASE_URL`
   - Migrate data from SQLite

3. **Monitoring:**
   - Set up basic monitoring (optional)
   - Configure error alerts (if desired)

