"use strict";

const {pipeline, Readable} = require("stream");
const ESI = require("../lib/ESI");
const fs = require("fs");
const HtmlParser = require("@bonniernews/atlas-html-stream");
const path = require("path");

describe("stream", () => {
  it("takes piped object stream", (done) => {
    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"));
    const chunks = [];

    stream.pipe(new HtmlParser({preserveWS: true})).pipe(new ESI({}))
      .on("data", (chunk) => {
        chunks.push(chunk);
      })
      .on("finish", () => {
        expect(chunks).to.have.length(29);
        done();
      });
  });

  it("can be piped", (done) => {
    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"));
    const chunks = [];

    pipeline([
      stream,
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], (err) => {
      if (err) return done(err);
      expect(chunks).to.have.length(29);
      done();
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("stream can be closed if redirect instruction is used", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $set_redirect('https://blahonga.com')
      </esi:vars>
      <p>Off</p>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let redirect;
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], (err) => {
      if (err) return done(err);
      expect(redirect.statusCode).to.equal(302);
      expect(redirect.location).to.equal("https://blahonga.com");
      done();
    }).on("set_redirect", (statusCode, location) => {
      redirect = {statusCode, location};
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("set redirect instruction emits redirect 302 with location", (done) => {
    const stream = fs.createReadStream(path.join(__dirname, "/redirect.html"));

    const transform = new ESI({});
    let redirect;
    transform.on("set_redirect", (statusCode, location) => {
      redirect = {statusCode, location};
      process.nextTick(() => transform.destroy());
    });

    stream.pipe(new HtmlParser({preserveWS: true})).pipe(transform).on("close", () => {
      expect(redirect.statusCode).to.equal(302);
      expect(redirect.location).to.equal("https://blahonga.com");
      done();
    });
  });

  it("set response code instruction emits event with response code", (done) => {
    const markup = [(`
      <html>
      <head>
      <esi:vars>
        $set_response_code(200)
      </esi:vars>
      </head>
      <body>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p></div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let send;
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], (err) => {
      if (err) return done(err);
      expect(send.statusCode).to.equal(200);
      expect(send.body).to.undefined;
      expect(chunks).to.have.length.above(4);
      done();
    }).on("set_response_code", (statusCode, body) => {
      send = {statusCode, body};
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("set response code with body emits event with code and body", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $set_response_code(200, 'Great success')
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let send;
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], () => {
      expect(send.statusCode).to.equal(200);
      expect(send.body).to.equal("Great success");
      done();
    }).on("set_response_code", function onSetResponseCode(statusCode, body) {
      send = {statusCode, body};
      this.destroy();
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("set response code succeeded by add header emits events even if destroyed on first instruction", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $set_response_code(302)
        $add_header('Location', 'https://example.com')
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let send;
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], () => {
      expect(send.statusCode).to.equal(302);
      expect(send.body).to.undefined;
      expect(send).to.have.property("Location", "https://example.com");
      done();
    }).on("set_response_code", function onResponseCode(statusCode, body) {
      send = {statusCode, body};
      this.destroy(null);
    }).on("add_header", (name, value) => {
      send[name] = value;
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("set location header succeeded by set redirect response code emits both events", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $add_header('Location', 'https://example.com')
        $set_response_code(302)
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let send;
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], () => {
      expect(send.statusCode).to.equal(302);
      expect(send.body).to.undefined;
      expect(send).to.have.property("Location", "https://example.com");
      done();
    }).on("set_response_code", function onResponseCode(statusCode, body) {
      send.statusCode = statusCode;
      send.body = body;
      this.destroy(null);
    }).on("add_header", (name, value) => {
      send = {[name]: value};
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });

  it("closes stream if an esi parse error occur", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $hittepa_funktion()
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    pipeline([
      Readable.from(markup),
      new HtmlParser({preserveWS: true}),
      new ESI({}),
    ], (err) => {
      expect(err).to.be.ok.and.match(/is not implemented/i);
      done();
    }).on("data", (chunk) => {
      chunks.push(chunk);
    });
  });
});
