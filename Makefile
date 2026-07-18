GOCHROME_DIR := hosts/gochrome

.PHONY: propagate gochromebuild

propagate:
	node ./scripts/propagate.js

gochromebuild: propagate
	cd $(GOCHROME_DIR) && CGO_ENABLED=0 go build -o bin/zebra .
