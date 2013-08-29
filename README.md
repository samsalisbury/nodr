# Nodr is a fast web crawler
Written in Node.js with Phantom.js, it's a very quick and dirty command line app.

## How to use (on OSX):
1. Install node if it's not already `$ brew update && brew install node`
2. Install phantomjs (you should be on version 1.9.1 at least) `$ brew update && brew install phantomjs`
3. Clone this repository
4. cd into the cloned directory and:

```
$ npm install
$ node start.js your.domain.name
```
or, if you want to just see the site map without static resources, do:

```
$ node start.js your.domain.name site_map_only
```

5. If it goes on too long, Ctrl+C is your friend ;)