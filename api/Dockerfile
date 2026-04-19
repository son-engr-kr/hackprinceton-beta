FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY flanner ./flanner
COPY data ./data
COPY assets ./assets

RUN mkdir -p /app/assets/incoming

EXPOSE 8080

CMD exec uvicorn flanner.api:app --host 0.0.0.0 --port ${PORT}
