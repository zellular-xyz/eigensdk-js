.PHONY: $(MAKECMDGOALS)

build:
	COMPOSE_BAKE=true docker compose build

rebuild:
	COMPOSE_BAKE=true docker compose build --no-cache

start-anvil: start-anvil-with-contracts-deployed

start-anvil-with-contracts-deployed: ## 
	./src/contracts/anvil/start-anvil-chain-with-el-and-avs-deployed.sh

anvil-reset: down
	docker compose up anvil

shell:
	docker compose run test bash

down:
	docker compose down -v -t0 --remove-orphans

anvil-logs:
	docker compose logs anvil

test:
	docker compose run --rm test sh -c "LOG_LEVEL=debug npm run test"

fresh-test: down
	docker compose up -d anvil
	sleep 3
	$(MAKE) test
