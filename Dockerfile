# Use Python 3.12 as the base image
FROM node:20.18.3

# Install Foundry (for Anvil)
RUN curl -L https://foundry.paradigm.xyz | bash \
    && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

# lk working directory
WORKDIR /app

RUN git clone https://github.com/Layr-Labs/incredible-squaring-avs.git \
    && cd incredible-squaring-avs \
    && git submodule update --init --recursive \
    && git clone https://github.com/dapphub/ds-test.git contracts/lib/eigenlayer-middleware/lib/ds-test \
    && cd contracts \
    && forge build 

# Copy package.json and package-lock.json (if it exists)
COPY package.json package-lock.json* ./

# Install dependencies (including vitest)
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose port 8545 for Anvil
EXPOSE 8545

# Default command to execute init.sh
CMD ["anvil"]
