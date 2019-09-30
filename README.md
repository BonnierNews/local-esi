Local-ESI
=========

[![Build Status](https://travis-ci.org/BonnierNews/local-esi.svg?branch=master)](https://travis-ci.org/BonnierNews/local-esi)[![dependencies Status](https://david-dm.org/BonnierNews/local-esi/status.svg)](https://david-dm.org/BonnierNews/local-esi)

Make your Express app work like it had Akamai Edge Side Includes parsing.

# API

- `localEsi(req, res[, callback])`: returns ESI evaluated markup in callback or as promised
- `localEsi.createStream(req)`: returns pipable object stream with ESI evaluated content

## `localEsi(req, res[, callback])`

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

## `localEsi.createStream(req[, res])`

Used as object stream.

```javascript
"use strict";

const localEsi = require("@bonniernews/local-esi");

module.exports = (req, res, next) => {
  const esiPipeline = localEsi.createStream(req);
  res.render("index", { data: "a" })
    .pipe(esiPipeline)
    .on("error", next)
    .on("set_redirect", (statusCode, location) => res.redirect(statusCode, location));
};
```

## Events

- `error`: an error occured
- `set_response_code`: send status code and optional body
- `add_header`: set header name and value
- `set_redirect`: redirect with status code and location
