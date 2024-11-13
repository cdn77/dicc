.PHONY: default
default: build

.PHONY: clean
clean:
	cd core/dicc && make clean
	cd core/cli && make clean

.PHONY: build
build:
	cd core/dicc && make
	cd core/cli && make

.PHONY: tests
tests:
	cd core/cli && make tests

.PHONY: rebuild
rebuild:
	cd core/dicc && make rebuild
	cd core/cli && make rebuild

.PHONY: self-compile
self-compile:
	cd core/cli && make compile

.PHONY: publish
publish:
	cd core/dicc && make publish
	cd core/cli && make publish
