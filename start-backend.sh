#!/bin/bash

# Start the Python Flask backend server
echo "Starting Medical Dashboard Backend..."
echo "Backend will be available at: http://localhost:5000"
echo "API endpoints available at: http://localhost:5000/api"
echo ""

cd backend
python run.py
