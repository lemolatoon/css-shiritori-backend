FROM node:22.18.0-slim AS builder

# pnpmをグローバルにインストール
RUN npm install -g pnpm

# 作業ディレクトリを設定
WORKDIR /usr/src/app

# package.json と lockfile をコピー
# pnpmでは `pnpm-lock.yaml` を使用します。
COPY package.json pnpm-lock.yaml ./

# --arch=x64 と --platform=linux を追加して、amd64アーキテクチャ用のバイナリを強制的にインストールします。
RUN pnpm install --frozen-lockfile

# アプリケーションのソースコードをすべてコピー
COPY . .

# package.json で定義されたビルドスクリプトを実行
RUN pnpm run build

# Stage 2: Production
# このステージでは、本番環境用の軽量な最終イメージを作成します。
# こちらのステージでもプラットフォームを合わせます。
FROM node:22.18.0-slim

# pnpmをグローバルにインストール
RUN npm install -g pnpm

# Puppeteerが必要とするシステムライブラリをインストールします。
RUN apt-get update \
    && apt-get install -yq --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# package.json をコピーし、本番用の依存関係のみをインストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
RUN pnpm puppeteer browsers install chrome

# 'builder' ステージからビルド済みのコードをコピー
COPY --from=builder /usr/src/app/dist ./dist
# copy prompts directory
COPY --from=builder /usr/src/app/prompts ./prompts

# Puppeteerは、セキュリティのため非rootユーザーでの実行が推奨されます。
# pptruser という名前の非rootユーザーを作成し、所有権を設定します。
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# 非rootユーザーで実行
USER pptruser

# アプリケーションが使用するポートを公開します。
# 必要に応じてポート番号を変更してください。
EXPOSE 3000

# アプリケーションを起動するコマンド
CMD ["pnpm", "start"]
