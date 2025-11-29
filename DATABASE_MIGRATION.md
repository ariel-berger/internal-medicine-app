# Database Migration Guide

## What Happens When You Deploy with Persistent Disk

### Scenario 1: You're Currently on Free Tier (Ephemeral Storage)

**Current State:**
- Your databases (`app.db` and `medical_articles.db`) are stored in ephemeral storage
- They are **already being lost** on every redeploy/restart
- This is why your data disappears

**After Adding Persistent Disk:**
1. **First deploy with `PERSISTENT_DATA_PATH=/data` set:**
   - The app will create **NEW** databases at `/data/app.db` and `/data/medical_articles.db`
   - These will be **empty** (fresh start)
   - Your old ephemeral databases will be ignored and eventually deleted

2. **What you'll lose:**
   - Any data currently in ephemeral storage (user accounts, key flags, library additions)
   - This data would have been lost on the next redeploy anyway

3. **What you'll gain:**
   - All **future** data will persist permanently
   - No more data loss on redeploys

### Scenario 2: You Already Have a Persistent Disk with Data

**If you already set up persistent disk before:**
- Your existing databases at `/data/app.db` and `/data/medical_articles.db` will **continue to exist**
- The app will use the existing databases (SQLite opens existing files)
- **No data loss** - everything persists

### Scenario 3: Migrating Existing Data (If You Have Important Data)

**If you have important data in ephemeral storage that you want to keep:**

1. **Before deploying with persistent disk:**
   - Export your data (see export scripts below)
   - Or manually backup the database files

2. **After deploying with persistent disk:**
   - Import the data back
   - Or restore the database files to `/data/` directory

**Note:** Since you mentioned data disappears after redeploys, you're likely on free tier, so there's probably no important data to migrate. The fresh start is fine.

## How to Verify After Deployment

1. **Check Render Logs:**
   ```
   Look for: "✅ Medical articles processing service initialized successfully"
   ```

2. **Test Persistence:**
   - Mark a study as "key"
   - Add a study to your library
   - Redeploy the service
   - Check that the data still exists

3. **Check Database Location (SSH into Render if possible):**
   ```bash
   ls -la /data/
   # Should show: app.db and medical_articles.db
   ```

## Summary

**Most Likely Scenario (Free Tier → Paid Tier):**
- ✅ Your current ephemeral databases will be ignored
- ✅ New databases will be created on persistent disk
- ✅ Fresh start (but this is expected since ephemeral data was being lost anyway)
- ✅ All future data will persist permanently

**If you already have persistent disk:**
- ✅ Existing databases will continue to work
- ✅ No data loss

