# Avalon Companion —— CloudBase Run 容器镜像
# 单进程同时托管：前端 SPA (dist/client) + REST (/api) + WebSocket (/ws)
FROM node:20-alpine

WORKDIR /app

# 先装依赖（利用层缓存）
COPY package.json package-lock.json ./
RUN npm install

# 复制源码并构建前端 SPA（产出 dist/client，供服务端静态托管）
COPY . .
RUN npm run build

# 运行时环境变量（保持无状态：不写本地文件）
ENV NODE_ENV=production
ENV AVALON_DATA_FILE=none
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "start"]
