FROM node:20-alpine

WORKDIR /app

# Copy package file
COPY package.json ./

# Install dependencies (use npm install instead of npm ci)
RUN npm install

# Copy all files
COPY . .

# Build argument for API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the app
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
