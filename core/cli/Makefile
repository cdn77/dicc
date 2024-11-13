.PHONY: default
default: dist

.PHONY: rebuild
rebuild: clean dist

.PHONY: clean
clean:
	rm -rf dist

.PHONY: compile
compile: dist
	dist/cli/dicc.js

dist:
	../../node_modules/.bin/tsc
	chmod +x dist/cli/dicc.js

.PHONY: tests
tests: dist
	node --test tests

.PHONY: major-release
major-release:
	npm version --no-git-tag-version major

.PHONY: minor-release
minor-release:
	npm version --no-git-tag-version minor

.PHONY: patch-release
patch-release:
	npm version --no-git-tag-version patch

.PHONY: publish
publish:
	cp ../../README.md ./
	../../node_modules/.bin/is-published || npm publish
