.PHONY: help start stop import build clean

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  start   Kill any running instance and start the server (http://localhost:5001)"
	@echo "  stop    Stop the running server"
	@echo "  import  Download CSVs and populate the database (run once)"
	@echo "  build   Compile a standalone binary"
	@echo "  clean   Remove the binary and all data files"

start:
	@pkill gymrace 2>/dev/null || true
	@go run . serve

stop:
	@pkill gymrace 2>/dev/null || true

import:
	@go run . import

build:
	@go build -o gymrace .

clean:
	@rm -f gymrace
	@rm -f data/*.db data/*.csv
