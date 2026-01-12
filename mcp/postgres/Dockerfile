FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema para psycopg2 si es necesario
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Usamos python directamente, la comunicación será vía Stdio
ENTRYPOINT ["python", "server.py"]