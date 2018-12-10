"use strict";

const localEsi = require("..");

describe("esi:text", () => {
  it("leaves text content of esi:text as is", (done) => {
    const markup = `
      <esi:text>
        {"approved":"true"}
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal("{\"approved\":\"true\"}");
        done();
      }
    }, done);
  });

  it("does not parse esi in esi:text", (done) => {
    const markup = `
      <esi:text>
        <esi:vars>{"approved":"true"}</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal("<esi:vars>{\"approved\":\"true\"}</esi:vars>");
        done();
      }
    }, done);
  });

  it("escaped chars inside esi:text are kept", (done) => {
    const markup = `
      <esi:text>
        <esi:vars>{"approved":"\\"quote\\""}</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal("<esi:vars>{\"approved\":\"\\\"quote\\\"\"}</esi:vars>");
        done();
      }
    }, done);
  });

  it("escaped chars outside in esi context but outside esi:text removes escape escape char", (done) => {
    const markup = `
      <p>\\"quote 0\\"</p>
      <esi:vars><p>\\"quote 1\\"</p></esi:vars>
      <esi:text><p>\\"quote 2\\"</p></esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal("<p>\\\"quote 0\\\"</p><p>\"quote 1\"</p><p>\\\"quote 2\\\"</p>");
        done();
      }
    }, done);
  });
});
