all: scss

scss: style.scss
	scss style.scss style.css

.PHONY: all scss
