# 多阶段构建
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 构建阶段需要dev依赖（nest/tsc）
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm install

# 复制源代码
COPY . .

# 构建应用（限制堆内存避免 512MB 服务器 OOM）
RUN NODE_OPTIONS="--max-old-space-size=400" npm run build

# 复用已下载依赖，裁剪为生产依赖，避免运行时镜像再次走网络安装
RUN npm prune --omit=dev && npm cache clean --force

# 生产镜像
FROM node:18-alpine

WORKDIR /app

# 直接复用构建阶段产物，避免二次 npm install 触发网络抖动
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 从构建阶段复制编译后的代码
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "dist/src/main.js"]
