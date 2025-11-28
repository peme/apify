FROM apify/actor-node-puppeteer-chrome:20

COPY package*.json ./

RUN npm install --quiet --only=prod --no-optional --no-audit --no-update-notifier

COPY . ./

