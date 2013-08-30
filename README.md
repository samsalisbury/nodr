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
5. Once it's finished, a file will be saved to the current directory containing the results as JSON. (Named domain.name.json)

6. If it goes on too long, Ctrl+C is your friend ;) I might extend this to handle pauses in processing if I get time…