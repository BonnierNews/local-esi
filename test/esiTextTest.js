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

  it("escaped quotes in tag attributes inside json property nested in esi:text are kept", (done) => {
    const markup = `
      <esi:text>
        {"items":[{"content":"<div class=\\"div_class_tag\\"><p class=\\"p_class_tag\\">TEXT</p></div>","type":"html-widget"}]}
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(JSON.parse(body).items[0].content).to.equal("<div class=\"div_class_tag\"><p class=\"p_class_tag\">TEXT</p></div>");
        done();
      }
    }, done);
  });

  it("remove escaped quotes inside esi context unless esi:text", (done) => {
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

  it("keeps esi markup in esi:text", (done) => {
    const markup = `
      <esi:text>
        <esi:include src="/p"/>
        <esi:debug/>
        <esi:eval src="/p"/>
        <esi:assign name="user_email" value="No1"/>
        <esi:vars>No2</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal("<esi:include src=\"/p\"/><esi:debug/><esi:eval src=\"/p\"/><esi:assign name=\"user_email\" value=\"No1\"/><esi:vars>No2</esi:vars>");
        done();
      }
    }, done);
  });
});
