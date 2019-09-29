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

  it("closes stream if redirect instruction is emitted", (done) => {
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
    transform.on("redirect", (statusCode, location) => {
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

  it("closes stream if send body instruction is emitted", (done) => {
    const markup = [(`
      <html><body>
      <esi:vars>
        $set_response_code(400, '<p>Bad</p>')
      </esi:vars>
    `)]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const stream = convert(markup);
    const chunks = [];

    const transform = localEsi.createStream({});
    let send;
    transform.on("send-body", (statusCode, body) => {
      send = {statusCode, body};
    });
    transform.on("data", (chunk) => {
      chunks.push(chunk);
    });

    stream.pipe(transform).on("end", () => {
      expect(send.statusCode).to.equal(400);
      expect(send.body).to.equal("<p>Bad</p>");
      expect(chunks).to.deep.equal([{name: "html", data: {}}, {name: "body", data: {}}]);
      done();
    });
  });
});

