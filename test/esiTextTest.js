"use strict";

const {parse} = require("../");

describe("esi:text", () => {
  it("leaves text content of esi:text as is", async () => {
    const markup = `
      <esi:text>
        {"approved":"true"}
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    const {body} = await parse(markup);
    expect(body).to.equal("{\"approved\":\"true\"}");
  });

  it("does not parse esi in esi:text", async () => {
    const markup = `
      <esi:text>
        <esi:vars>{"approved":"true"}</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    const {body} = await parse(markup);
    expect(body).to.equal("<esi:vars>{\"approved\":\"true\"}</esi:vars>");
  });

  it("escaped chars inside esi:text are kept", async () => {
    const markup = `
      <esi:text>
        <esi:vars>{"approved":"\\"quote\\""}</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    const {body} = await parse(markup);
    expect(body).to.equal("<esi:vars>{\"approved\":\"\\\"quote\\\"\"}</esi:vars>");
  });

  it("remove escaped quotes inside esi context unless esi:text", async () => {
    const markup = `
      <p>\\"quote 0\\"</p>
      <esi:vars><p>\\"quote 1\\"</p></esi:vars>
      <esi:text><p>\\"quote 2\\"</p></esi:text>
      `.replace(/^\s+|\n/gm, "");

    const {body} = await parse(markup);
    expect(body).to.equal("<p>\\\"quote 0\\\"</p><p>\"quote 1\"</p><p>\\\"quote 2\\\"</p>");
  });

  it("keeps esi markup in esi:text", async () => {
    const markup = `
      <esi:text>
        <esi:include src="/p"/>
        <esi:debug/>
        <esi:eval src="/p"/>
        <esi:assign name="user_email" value="No1"/>
        <esi:vars>No2</esi:vars>
      </esi:text>
      `.replace(/^\s+|\n/gm, "");

    const {body} = await parse(markup);
    expect(body).to.equal("<esi:include src=\"/p\"/><esi:debug/><esi:eval src=\"/p\"/><esi:assign name=\"user_email\" value=\"No1\"/><esi:vars>No2</esi:vars>");
  });
});
