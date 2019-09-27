"use strict";

const fs = require("fs");
const ESIListener = require("../lib/ESIListener");
const path = require("path");
const {asStream} = require("../lib/transformHtml");
const {expect} = require("chai");
const HtmlParser = require("atlas-html-stream");
const {Transform, Duplex} = require("stream");
const ListenerContext = require("../lib/ListenerContext");
const localEsi = require("..");
const ESIParser = require("../lib/ESIParser");

class HtmlTransformer extends Transform {
  constructor(filter, options) {
    options = Object.assign({}, options, {writableObjectMode: true});
    super(options);
    this.filter = filter;
  }

  _transform(obj, encoding, next) {
    const self = this;

    this.filter(obj, (err, chunk) => {
      if (err) return next(err);
      if (chunk) self.push(chunk);
      next();
    });
  }
}

class MTransformer extends Transform {
  constructor(req, res) {
    super({writableObjectMode: true});

    this.context = ListenerContext(req, res);
    this.listener = ESIListener(context);
  }

  transform(obj, encoding, next) {
    _super(obj, encoding, (...args) => {

      console.log(args)
      next();
    });

    // const self = this;

    // console.log("TRANS", obj)

    // this.filter(obj, (err, chunk) => {
    //   if (err) return next(err);
    //   if (chunk) self.push(chunk);
    //   next();
    // });
  }
}

describe("pipe filter", () => {
  const scriptTag = `<script>!function(){"use strict";window.foobar=function(e){var n=document.getElementsByClassName(e)[0];}();</script>`; //eslint-disable-line quotes

  it("pipe", (done) => {
    const context = ListenerContext({}, {});
    const listener = ESIListener(context);

    let markup = "";
    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"))
      .on("error", (err) => done(err));

    stream.pipe(new HtmlParser())
      .pipe(new ESIParser(filter))
      .on("data", (chunk) => {
        markup += chunk;
      })
      .on("finish", () => {
        expect(markup).to.not.contain("<esi:");
        expect(markup).to.contain(scriptTag);
        done();
      });

    function filter({name, data, text}, next) {
      if (text) {
        listener.ontext(text, next);
      } else if (name && data) {
        return listener.onopentag(name, data, next);
      } else {
        return listener.onclosetag(name, next);
      }
    }
  });

  it("should not touch JS in script-tag inside <esi:choose>", (done) => {
    let markup = "";

    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"))
      .on("error", (err) => done(err))
      .on("end", () => {
        expect(markup).to.not.contain("<esi:");
        expect(markup).to.contain(scriptTag);
        done();
      });

    const listener = ESIListener(ListenerContext({}, {}));

    stream.pipe(setupStream(listener))
      .on("data", (chunk) => {
        markup += chunk;
      })
      .on("finish", () => console.log("FIN"));
  });

  function setupStream({onopentag, ontext, onclosetag}) {
    const htmlParser = new HtmlParser({ preserveWS: true });
    const transformer = new HtmlTransformer(filter);

    return {
      pipe: htmlParser.pipe(transformer),
      on(name, h) {
        console.log(name)
      },
      once(name, h) {
        console.log('once', name)
      },
      emit() {},
    };

    function filter({name, data, text}, next) {
      if (text) {
        return ontext(text, next);
      } else if (name && data) {
        return onopentag(name, data, next);
      } else {
        return onclosetag(name, next);
      }
    }
  }

  it("should not touch JS in script-tag inside <esi:choose>", (done) => {
    let markup = "";

    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"))
      .on("error", (err) => done(err))
      .on("end", () => {
        expect(markup).to.not.contain("<esi:");
        expect(markup).to.contain(scriptTag);
        done();
      });

    stream.pipe(new MTransformer({}, {}))
      .on("data", (chunk) => {
        markup += chunk;
      })
      .on("finish", () => console.log("FIN"));
  });

});

