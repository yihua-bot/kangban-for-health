# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 该目录暂无package-lock，使用npm install以支持容器构建
RUN npm install

# 复制源代码
COPY . .

# 构建参数
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# 构建应用
RUN npm run build

# 生产阶段
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
