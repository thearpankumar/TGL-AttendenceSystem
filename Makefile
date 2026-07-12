.PHONY: all backend student admin home

# Run all checks across backend, student frontend, admin frontend, and home frontend
all: backend student admin home

backend:
	@echo "==============================="
	@echo "   Running Backend Checks      "
	@echo "==============================="
	cd backend && npm run lint
	cd backend && npm run test

student:
	@echo "==============================="
	@echo "Running Student Frontend Checks"
	@echo "==============================="
	cd frontend/student && npm run lint
	cd frontend/student && npm run typecheck
	cd frontend/student && npm run test
	cd frontend/student && npm run build

admin:
	@echo "==============================="
	@echo " Running Admin Frontend Checks "
	@echo "==============================="
	cd frontend/admin && npm run lint
	cd frontend/admin && npm run typecheck
	cd frontend/admin && npm run test
	cd frontend/admin && npm run build

home:
	@echo "==============================="
	@echo "  Running Home Frontend Checks "
	@echo "==============================="
	cd frontend/home && bun run lint
	cd frontend/home && bun run typecheck
	cd frontend/home && bun run build
