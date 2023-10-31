FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the app, TypeScript outputs to /dist
RUN npm run build

# Step 2: Run the compiled JavaScript app in a new stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm i --production

# Copy compiled JavaScript from the previous stage
COPY --from=builder /app/dist /app/dist

# Set the command to run your app using CMD
CMD [ "node", "dist/app.js" ]
