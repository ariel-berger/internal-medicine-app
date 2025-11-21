#!/bin/bash

# Start the Python Flask backend server
echo "Starting Medical Dashboard Backend..."
echo "Backend will be available at: http://localhost:5001"
echo "API endpoints available at: http://localhost:5001/api"
echo ""

cd backend

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
elif [ -d "../.venv" ]; then
    echo "Activating virtual environment..."
    source ../.venv/bin/activate
fi

python run.py
