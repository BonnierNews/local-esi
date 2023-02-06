Local-ESI
=========

[![Built latest](https://github.com/BonnierNews/local-esi/actions/workflows/build-latest.yaml/badge.svg)](https://github.com/BonnierNews/local-esi/actions/workflows/build-latest.yaml)

Make your Express app work like it had Akamai Edge Side Includes parsing or just stream your ESI decorated markup to the parser.

# API

- [`ESI`](#new-esioptions): transform class that returns an ESI transform stream
- [`HTMLWriter`](#new-htmlwriter): transform class that returns markup from object stream
- [`parse`](#parsehtml-options): async function that returns ESI evaluated markup

## `new ESI([options])`

Create an ESI transform stream. Emits [events](#esi-parsing-events).

Arguments:
- `options`: optional options object with headers and cookies
  - `headers`: request headers, accessible through ESI globals `HTTP_<HEADER_NAME>`, `x-forwarded-for` will be accessible as `REMOTE_ADDR`
    - `x-localesi-geo`: headers to simulate Akamai's geo location abilities. Defaults to: `country_code=SE,georegion=208`. Accessible through ESI global `GEO{}`
  - `cookies`: object with request cookies, accessible through ESI global `HTTP_COOKIE`
  - `path`: string request path, mapped to ESI global `REQUEST_PATH`
  - `query`: object request query parameters, accessible through ESI global `QUERY_STRING`
  - `localhost`: host to use when a relative src is used by eval or include, defaults to `headers.host`

Returns:
  - esi evaluated object stream

__Example express route:__

```javascript
"use strict";

const HTMLParser = require("@bonniernews/atlas-html-stream");
const {ESI, HTMLWriter} = require("@bonniernews/local-esi");
const {pipeline} = require("stream");

module.exports = function streamRender(req, res, next) {
  const { headers, cookies, path, query } = req;

  const options = {
    headers,
    cookies,
    path,
    query,
    localhost: `localhost:${req.socket.server.address().port}`,
  };

  const esi = new ESI(options)
    .once("set_redirect", function onSetRedirect(statusCode, location) {
      res.status(statusCode).redirect(location);
      this.destroy();
    })
    .on("set_response_code", function onSetResponseCode(statusCode, body) {
      res.status(statusCode);
      if (!body) return;
      res.send(body);
      this.destroy();
    })
    .on("add_header", (name, value) => {
      res.set(name, value);
    });

  const body = "";

  pipeline([
    res.render("index"),
    new HTMLParser({preserveWS: true}),
    esi,
    new HTMLWriter(),
  ], (err) => {
    if (err?.code === "ERR_STREAM_PREMATURE_CLOSE"]) {
      return;
    } else if (err) {
      return next(err);
    }

    return res.send(body);
  }).on("data", (chunk) => {
    body += chunk;
  });
};
```

## `parse(html, options)`

Arguments:
- `html`: markup to parse
- `options`: same as for for [ESI](#new-esioptions)

Returns promise:
- `body`: string with ESI evaluated markup or body from `$set_response_code`
- `statusCode`: occasional status code from `$set_response_code` or `$set_redirect`
- `headers`: object with added headers (in lowercase) from `$add_header` or `$set_redirect(location)`, NB! `set-cookie` will be in a list

__Example express route:__

```javascript
"use strict";

const {parse} = require("@bonniernews/local-esi");

module.exports = function render(req, res, next) {
  const { headers, cookies, path, query } = req;

  const options = {
    headers,
    cookies,
    path,
    query,
    localhost: `localhost:${req.socket.server.address().port}`,
  };

  const html = res.render("index");

  const {statusCode, headers, body} = await parse(html, options);
  if (statusCode < 309 && statusCode > 300) {
    return res.redirect(statusCode, location);
  }

  if (statusCode) {
    res.status(statusCode);
  } else if (!res.statusCode) {
    res.status(200);
  }
  
  return res.send(body);
};
```

## `new HTMLWriter()`

Returns transform [object stream](#markup-object-stream) to markup buffer stream.

## ESI Parsing Events

ESI instructions are emitted as events.

### `set_response_code`

Parser encountered a `$set_response_code` instruction with status code and optional body.

Signature:
- `statusCode`: number HTTP status code
- `body`: optional string body

### `add_header`

Parser encountered a `$add_header` instruction with HTTP header name and value.

Signature:
- `name`: HTTP header name
- `value`: HTTP header value

### `set_redirect`

Parser encountered a `$set_redirect` instruction with optional status code and location.

Signature:
- `statusCode`: redirect HTTP status code
- `location`: redirect location

## Markup object stream

Object streams requires the schema `{name, data, text}` representing tag name, tag attributes, and text. This project uses [@bonniernews/atlas-html-stream][0] for html parsing.

[0]: https://www.npmjs.com/package/@bonniernews/atlas-html-stream
