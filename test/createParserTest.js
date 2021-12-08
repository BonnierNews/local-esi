"use strict";

const {ESI} = require("..");
const fs = require("fs");
const HtmlParser = require("@bonniernews/atlas-html-stream");
const path = require("path");

describe("parse ESI", () => {
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

  it("emits redirect instruction", (done) => {
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
});

