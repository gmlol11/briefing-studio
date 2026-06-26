FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium + system libs for PDF export (Playwright). Runs as root before the
# code copy / non-root switch; --with-deps installs the apt packages headless
# Chromium needs on the slim Debian base.
RUN python -m playwright install --with-deps chromium

COPY . .

# Ensure the prod entrypoint is executable inside the image (used by
# docker-compose.prod.yml: migrations then exec the command).
RUN chmod +x entrypoint.sh

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
