# 新版：手機 app（web/，React PWA）先 build，再跟 FastAPI 後端放進同一個 Python image。
# 同一個 image 跑網站（預設）和手機捷徑 endpoint（python -m api.server）。
FROM oven/bun:1.4.4-alpine AS web
WORKDIR /web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-app.txt .
RUN pip install --no-cache-dir -r requirements-app.txt
COPY lib/ lib/
COPY api/ api/
COPY server/ server/
COPY tools/ tools/
COPY --from=web /web/dist web/dist
ENV TZ=America/Vancouver PYTHONUNBUFFERED=1 HOME=/tmp
USER 1000
EXPOSE 8501 8502
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8501", "--no-server-header", "--no-access-log"]
