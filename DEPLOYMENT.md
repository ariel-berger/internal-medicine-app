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
   FRONTEND_URL=https://your-vercel-app.vercel.app
   PORT=10000
   ```
   
   **Generate secrets:**
   ```bash
   # On Mac/Linux:
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
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
   VITE_API_BASE_URL=https://your-render-app.onrender.com/api
   ```
   Replace `your-render-app.onrender.com` with your actual Render backend URL

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

## Testing

1. Test your deployed backend:
   ```bash
   curl https://your-backend.onrender.com/api/health
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

