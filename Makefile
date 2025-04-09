.PHONY: dev build test test-unit test-integration lint typecheck migrate generate

dev:
	npm run dev

build:
	npm run build

test:
	npm test

test-unit:
	npm run test:unit

test-integration:
	npm run test:integration

lint:
	npm run lint

typecheck:
	npm run typecheck

migrate:
	npm run db:migrate

generate:
	npm run db:generate
