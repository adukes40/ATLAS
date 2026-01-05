#!/bin/bash
# ATLAS Backend Start Script

# Navigate to the project directory
cd /opt/atlas-backend

# Check if port 8000 is already in use
PID=$(pgrep -f "uvicorn app.main:app")

if [ -z "$PID" ]; then
    echo ">> Starting ATLAS Backend..."
else
    echo ">> ATLAS Backend is already running (PID: $PID). Restarting..."
    kill $PID
    sleep 1
fi

# Start with nohup to keep alive after shell exit
nohup venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &

echo ">> ATLAS Backend started in background. Logs: backend.log"
