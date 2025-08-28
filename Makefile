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

# Initialize husky and add pre-commit hook
pre-commit-init:
	npx husky init
	echo 'npx lint-staged && npm run test' > .husky/pre-commit
	chmod +x .husky/pre-commit
	@echo "✅ Husky pre-commit hook installed."

# Run the pre-commit hook manually (on staged files)
pre-commit-run:
	npx lint-staged

# Disable the pre-commit hook
pre-commit-disable:
	rm -f .husky/pre-commit
	@echo "❌ Husky pre-commit hook disabled."

# Run eslint on the full project
lint:
	npx eslint . --ext .ts,.tsx

# Run prettier on the full project
format:
	npx prettier --write .
