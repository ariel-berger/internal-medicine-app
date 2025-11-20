# Setup Instructions

## ✅ Completed Steps

1. **Python Virtual Environment**: Created and activated at `.venv/`
2. **Backend Dependencies**: All Python packages installed successfully
3. **Database**: Initialized and ready
4. **Backend Server**: Running on http://localhost:5001
5. **README Files**: Windows/PC-specific remarks removed

## ⚠️ Node.js Installation Required

Node.js is not currently installed on your system. To complete the frontend setup:

### Option 1: Install via Homebrew (Recommended)
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

### Option 2: Install via Official Installer
1. Visit https://nodejs.org/
2. Download the LTS version for macOS
3. Run the installer
4. Restart your terminal

### Option 3: Install via nvm (Node Version Manager)
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.bashrc  # or ~/.zshrc

# Install Node.js LTS
nvm install --lts
nvm use --lts
```

## After Installing Node.js

Once Node.js is installed, run:

```bash
cd /Users/gilbennoon/projects/internal-medicine-app

# Install frontend dependencies
npm install

# Start frontend (in a new terminal)
npm run dev

# Or start both backend and frontend together
npm run dev:full
```

## Current Status

- ✅ Backend: Running at http://localhost:5001
- ⏳ Frontend: Waiting for Node.js installation
- ✅ Database: Initialized
- ✅ Environment: Configured

## Environment Variables

A `.env` file template has been created. You may need to add your API keys:

```env
# In backend/.env or project root .env
ANTHROPIC_API_KEY=your-key   # or
GOOGLE_API_KEY=your-google-key
```

