FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    webkit2gtk-driver \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo install tauri-driver --locked

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY e2e/package.json e2e/
RUN cd e2e && npm install

COPY . .

ENV MQTT_TOPIC_LAB_DATA_DIR=/tmp/e2e-data

CMD ["sh", "-c", "cd e2e && xvfb-run npm test"]
