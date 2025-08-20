#!/bin/bash
# Start Anvil in the background
anvil --host 0.0.0.0 --port 8545 --load-state src/contracts/anvil/contracts-deployed-anvil-state.json &
anvil_pid=$!
sleep 1
# scripts/deploy.sh
wait $anvil_pid
