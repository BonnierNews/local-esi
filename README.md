Local-ESI
=========

[![Build Status](https://travis-ci.org/BonnierNews/local-esi.svg?branch=master)](https://travis-ci.org/BonnierNews/local-esi)[![dependencies Status](https://david-dm.org/BonnierNews/local-esi/status.svg)](https://david-dm.org/BonnierNews/local-esi)

Make your Express app work like it had Akamai Edge Side Includes parsing.

# Example Express route:

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

# Another example Express route:

Apply local-esi to all HTML output

```javascript
"use strict";

app.use((req, res, next) => {
  const _send = res.send;

  res.send = function Send(body) {
    const resHeaders = res.getHeaders();
    const resContentType = resHeaders && resHeaders["content-type"];
    if (resContentType && resContentType.includes("text/html")) {
      _send.call(this, body);
    } else {
      const options = { send: _send, sendContext: this };
      localEsi(body, req, res, next, options);
    }
  };

  next();
})
```
