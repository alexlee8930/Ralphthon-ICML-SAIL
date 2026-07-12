FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sail_adapter.py .

ENV SAIL_STATE_PATH=/tmp/sail_state.json
EXPOSE 8080
CMD exec uvicorn sail_adapter:app --host 0.0.0.0 --port ${PORT:-8080}
