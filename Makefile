.PHONY: default
default: build

.PHONY: clean
clean:
	rm -rf dist

.PHONY: cleanall
cleanall: clean
	rm -rf node_modules

node_modules:
	npm ci

.PHONY: dev
dev: node_modules
	node_modules/.bin/vite dev

dist: node_modules
	node_modules/.bin/vite build

.PHONY: preview
preview: dist
	node_modules/.bin/vite preview

.PHONY: build
build: clean dist
