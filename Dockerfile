# 自架用：同一個 image 跑網站（預設）和捷徑 API（python -m api.server）
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV TZ=America/Vancouver PYTHONUNBUFFERED=1 HOME=/tmp
USER 1000
EXPOSE 8501 8502
CMD ["streamlit", "run", "streamlit_app.py", "--server.address=0.0.0.0", \
     "--server.port=8501", "--server.headless=true", "--browser.gatherUsageStats=false"]
