.PHONY: up dev sandbox-up sandbox-dev down logs check

up:
	docker compose up --build -d --wait --wait-timeout 180

dev:
	docker compose up --build --watch

sandbox-up:
	BIND_ADDRESS=0.0.0.0 docker compose up --build -d --wait --wait-timeout 180

sandbox-dev:
	BIND_ADDRESS=0.0.0.0 docker compose up --build --watch

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

check:
	docker compose exec -T api go test ./...
	docker compose exec -T api go vet ./...
	docker compose exec -T frontend pnpm build
