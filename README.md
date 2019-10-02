Local-ESI
=========

[![Build Status](https://travis-ci.org/BonnierNews/local-esi.svg?branch=master)](https://travis-ci.org/BonnierNews/local-esi)[![dependencies Status](https://david-dm.org/BonnierNews/local-esi/status.svg)](https://david-dm.org/BonnierNews/local-esi)

Make your Express app work like it had Akamai Edge Side Includes parsing or just stream your ESI decorated markup to the parser.

# API

- [`localEsi(html, req, res, next)`](#localesihtml-req-res-next)
- [`localEsi.createStream(req)`](#localesicreatestreamreq)
- [`localEsi.createParser(req)`](#localesicreateparserreq)
- [`localEsi.htmlWriter()`](#localesihtmlwriter)

## `localEsi(html, req, res, next)`

Use as an expressjs request callback function.

Arguments:
- `html`: string with markup
- `req`: request with headers and cookies
- `res`: response with send, redirect, set, and status function
- `next`: function to catch occasional error in

```javascript
"use strict";

const localEsi = require("@bonniernews/local-esi");

module.exports = (req, res, next) => {
  res.render("index", { data: "a" }, (err, html) => {
    if (err) return next(err);

    localEsi(html, req, res, next);
  });
};
```

## `localEsi.createStream(req)`

Create pipable ESI parse as stream. Emits [events](#esi-parsing-events).

Arguments:
- `req`: request with headers and cookies

Returns markup stream.

```javascript
"use strict";

const {createStream} = require("@bonniernews/local-esi");

module.exports = (req, res, next) => {
  const esiParseStream = createStream(req)
    .on("add_header", (name, value) => res.set(name, value))
    .once("set_redirect", (statusCode, location) => res.redirect(statusCode, location));

  res.render("index")
    .pipe(esiParseStream)
    .on("error", next);
};
```

## `localEsi.createParser(req)`

Create ESI parse transform stream. Emits [events](#esi-parsing-events).

Arguments:
- `req`: request with headers and cookies

Requires [markup stream](#markup-object-stream) to read from. Writes object stream.

```javascript
"use strict";

const HtmlParser = require("atlas-html-stream");
const {createParser: createESIParser, htmlWriter} = require("@bonniernews/local-esi");

module.exports = function channelRendering(req, res, next) {
  const esiParser = createESIParser(req)
    .once("set_redirect", (statusCode, location) => {
      res.status(statusCode).redirect(location);
    })
    .on("set_response_code", (statusCode, body) => {
      res.status(statusCode);
      if (body) res.send(body);
    })
    .on("add_header", (name, value) => {
      res.set(name, value);
    });

  return res.render("index")
    .pipe(new HtmlParser({preserveWS: true}))
    .pipe(esiParser)
    .pipe(htmlWriter())
    .pipe(res)
    .once("error", (err) => {
      next(err);
    });
};
```

## `localEsi.htmlWriter()`

Returns transform [object stream](#markup-object-stream) to markup buffer stream.

## ESI Parsing Events

ESI instructions are emitted as events.

### `set_response_code`

Set status code and optional body.

### `add_header`

Set header name and value.

### `set_redirect`

Redirect with status code and location.

## Markup object stream

Object streams requires the schema `{name, data, text}` representing tag name, tag attributes, and text. This project uses [atlas-html-stream](https://www.npmjs.com/package/atlas-html-stream) for html parsing.
