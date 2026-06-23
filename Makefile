# ═══════════════════════════════════════════════════════════════
# XA-LMS Makefile
# Mac/Linux: use as-is
# Windows: install Make via choco (choco install make) or
#          run commands manually from the comments below each target
# ═══════════════════════════════════════════════════════════════

.PHONY: up down logs api web mobile install migrate help

## Start PostgreSQL + Redis (run this first, always)
up:
	docker compose up -d

## Stop all containers
down:
	docker compose down

## Watch container logs
logs:
	docker compose logs -f

## Run Go API with hot reload (requires: go install github.com/air-verse/air@latest)
api:
	cd api && air

## Run Next.js dev server
web:
	cd apps/web && npm run dev

## Run React Native / Expo
mobile:
	cd apps/mobile && npx expo start

## Install all Node dependencies
install:
	cd apps/web && npm install
	cd apps/mobile && npm install

## Download Go dependencies
deps:
	cd api && go mod download && go mod tidy

## Run a new migration (usage: make migrate name=create_users)
migrate:
	migrate create -ext sql -dir api/migrations -seq $(name)

## Run all pending migrations up
migrate-up:
	migrate -path api/migrations -database "$(shell grep DB_URL api/.env | cut -d '=' -f2)" up

## Rollback last migration
migrate-down:
	migrate -path api/migrations -database "$(shell grep DB_URL api/.env | cut -d '=' -f2)" down 1

## Show this help
help:
	@grep -E '^##' Makefile | sed 's/## //'
