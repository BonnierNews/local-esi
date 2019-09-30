"use strict";

const fs = require("fs");
const localEsi = require("..");
const path = require("path");
const {convert} = require("../lib/transformHtml");

describe("stream", () => {
  it("can be piped", (done) => {
    const stream = fs.createReadStream(path.join(__dirname, "/esi.html"));
    const chunks = [];

    stream.pipe(localEsi.createStream({}, {}))
      .on("data", (chunk) => {
        chunks.push(chunk);
      })
      .on("finish", () => {
        expect(chunks).to.have.length(29);
        done();
      });
  });

  it("closes stream if redirect instruction is used", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $set_redirect('https://blahonga.com')
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const stream = convert(markup);
    const chunks = [];

    const transform = localEsi.createStream({});
    let redirect;
    transform.on("set_redirect", (statusCode, location) => {
      redirect = {statusCode, location};
    });
    transform.on("data", (chunk) => {
      chunks.push(chunk);
    });

    stream.pipe(transform).on("end", () => {
      expect(redirect.statusCode).to.equal(302);
      expect(redirect.location).to.equal("https://blahonga.com");
      expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
      done();
    });
  });

  [200, 201, 206].forEach((responseCode) => {
    it(`continues stream if response code (${responseCode}) instruction is used`, (done) => {
      const markup = [(`
        <html><body>
        <esi:vars>
          $set_response_code(${responseCode})
        </esi:vars>
      `)]
        .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
        .join("")
        .replace(/^\s+|\n/gm, "");

      const stream = convert(markup);
      const chunks = [];

      const transform = localEsi.createStream({});
      let send;
      transform.on("set_response_code", (statusCode, body) => {
        send = {statusCode, body};
      });
      transform.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.pipe(transform).on("end", () => {
        expect(send.statusCode).to.equal(responseCode);
        expect(send.body).to.undefined;
        expect(chunks).to.have.length.above(2);
        done();
      });
    });

    it(`closes stream if response code (${responseCode}) with body`, (done) => {
      const markup = [(`
        <html><body>
        <esi:vars>
          $set_response_code(${responseCode}, 'Great success')
        </esi:vars>
      `)]
        .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
        .join("")
        .replace(/^\s+|\n/gm, "");

      const stream = convert(markup);
      const chunks = [];

      const transform = localEsi.createStream({});
      let send;
      transform.on("set_response_code", (statusCode, body) => {
        send = {statusCode, body};
      });
      transform.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.pipe(transform).on("end", () => {
        expect(send.statusCode).to.equal(responseCode);
        expect(send.body).to.equal("Great success");
        expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
        done();
      });
    });
  });

  [301, 302, 303, 307, 308].forEach((responseCode) => {
    it(`closes stream if redirect response code (${responseCode}) instruction is followed by add location header`, (done) => {
      const markup = [(`
        <html><body>
        <esi:vars>
          $set_response_code(${responseCode})
          $add_header('Location', 'https://example.com')
        </esi:vars>
      `)]
        .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
        .join("")
        .replace(/^\s+|\n/gm, "");

      const stream = convert(markup);
      const chunks = [];

      const transform = localEsi.createStream({});
      let send;
      transform.on("set_response_code", (statusCode, body) => {
        send = {statusCode, body};
      });
      transform.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.pipe(transform).on("end", () => {
        expect(send.statusCode).to.equal(responseCode);
        expect(send.body).to.undefined;
        expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
        done();
      });
    });

    it(`closes stream if location header is followed by redirect response code (${responseCode})`, (done) => {
      const markup = [(`
        <html><body>
        <esi:vars>
          $add_header('Location', 'https://example.com')
          $set_response_code(${responseCode})
        </esi:vars>
      `)]
        .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
        .join("")
        .replace(/^\s+|\n/gm, "");

      const stream = convert(markup);
      const chunks = [];

      const transform = localEsi.createStream({});
      let send;
      transform.on("set_response_code", (statusCode, body) => {
        send = {statusCode, body};
      });
      transform.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.pipe(transform).on("end", () => {
        expect(send.statusCode).to.equal(responseCode);
        expect(send.body).to.undefined;
        expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
        done();
      });
    });
  });

  [400, 401, 404, 500, 501].forEach((responseCode) => {
    it(`closes stream if error response code (${responseCode}) instruction is used`, (done) => {
      const markup = [(`
        <html><body>
        <esi:vars>
          $set_response_code(${responseCode})
        </esi:vars>
      `)]
        .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
        .join("")
        .replace(/^\s+|\n/gm, "");

      const stream = convert(markup);
      const chunks = [];

      const transform = localEsi.createStream({});
      let send;
      transform.on("set_response_code", (statusCode, body) => {
        send = {statusCode, body};
      });
      transform.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.pipe(transform).on("end", () => {
        expect(send.statusCode).to.equal(responseCode);
        expect(send.body).to.undefined;
        expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
        done();
      });
    });
  });

  it("closes stream if an error occur", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $hittepa_funktion()
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const stream = convert(markup);

    const transform = localEsi.createStream({});

    const chunks = [];
    let error;

    transform.on("data", (chunk) => {
      chunks.push(chunk);
    }).on("error", (err) => {
      error = err;
    });

    stream.on("end", () => {
      expect(error).to.be.ok.and.match(/is not implemented/i);
      expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
      done();
    }).pipe(transform);
  });
});

