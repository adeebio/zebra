GOCHROME_DIR := hosts/gochrome

.PHONY: propagate gochromebuild devserver

propagate:
	node ./scripts/propagate.js

gochromebuild: propagate
	cd $(GOCHROME_DIR) && CGO_ENABLED=0 go build -o bin/zebra .

devserver:
	node hosts/localdevserver/server.js
