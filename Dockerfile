FROM --platform=$BUILDPLATFORM node:22.18.0-slim AS builder

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
COPY src ./src

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
    && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# package.json をコピーし、本番用の依存関係のみをインストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 'builder' ステージからビルド済みのコードをコピー
COPY --from=builder /usr/src/app/dist ./dist
# copy prompts directory
COPY prompts ./prompts

# Puppeteerは、セキュリティのため非rootユーザーでの実行が推奨されます。
# pptruser という名前の非rootユーザーを作成し、所有権を設定します。
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# 非rootユーザーで実行
USER pptruser

# RUN pnpm puppeteer browsers install chrome

# アプリケーションが使用するポートを公開します。
# 必要に応じてポート番号を変更してください。
EXPOSE 4000

# アプリケーションを起動するコマンド
CMD ["pnpm", "start"]
