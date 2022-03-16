"use strict";

const { parse } = require("./..");

describe("assert", () => {
  it("esi:assign as first child of esi:choose throws", async () => {
    const markup = `
    <esi:choose>
      <esi:assign name="my_cookie" value="$(HTTP_COOKIE{'cookie_1'})" />
      <esi:when test="$exists($(my_cookie))">
        <p>hej</p>
      </esi:when>
    </esi:choose>`;

    try {
      await parse(markup, { cookie: { cookie_1: "content" } });
    } catch (e) {
      // eslint-disable-next-line no-var
      var err = e;
    }

    expect(err).to.exist;
    expect(err.message).to.match(/esi:assign is not allowed inside a esi:choose/);
  });

  it("esi:vars as first child of esi:choose throws", async () => {
    const markup = `
    <esi:choose>
      <esi:vars>
        $(HTTP_COOKIE{'cookie_1})
      </esi:vars>
      <esi:when test="$exists($(HTTP_COOKIE{'cookie_1}))">
        <p>hej</p>
      </esi:when>
    </esi:choose>`;

    try {
      await parse(markup, { cookie: { cookie_1: "content" } });
    } catch (e) {
      // eslint-disable-next-line no-var
      var err = e;
    }

    expect(err).to.exist;
    expect(err.message).to.match(/esi:vars is not allowed inside a esi:choose/);
  });

  it("esi:assign inside esi:choose throws", async () => {
    const markup = `
    <esi:choose>
      <esi:when test="$exists($(my_cookie))">
        <p>hej</p>
      </esi:when>
      <esi:assign name="my_cookie" value="$(HTTP_COOKIE{'cookie_1'})" />
    </esi:choose>`;

    try {
      await parse(markup, { cookie: { cookie_1: "content" } });
    } catch (e) {
      // eslint-disable-next-line no-var
      var err = e;
    }

    expect(err).to.exist;
    expect(err.message).to.match(/esi:assign is not allowed inside a esi:choose/);
  });
});
