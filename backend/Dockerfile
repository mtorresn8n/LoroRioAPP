FROM python:3.12-slim

# Install ffmpeg and yt-dlp dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create media directories
RUN mkdir -p /app/media/clips /app/media/recordings

EXPOSE 8000

COPY init_db.py .

# Initialize DB tables on startup, then run the server
CMD ["sh", "-c", "python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
