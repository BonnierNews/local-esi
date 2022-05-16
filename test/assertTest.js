"use strict";

const { parse } = require("./..");

describe("assert", () => {
  describe("esi:choose", () => {
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

  describe("esi:try", () => {
    it("esi:try without esi:attempt and esi:except throws", async () => {
      const markup = "<esi:try></esi:try>";

      let err;
      try {
        await parse(markup);
      } catch (e) {
        err = e;
      }

      expect(err).to.exist;
      expect(err.message).to.match(/esi:try without esi:attempt and esi:except not allowed/);
    });

    it("esi:try without esi:except throws", async () => {
      const markup = `
        <esi:try>
          <esi:attempt></esi:attempt>
        </esi:try>
      `;

      let err;
      try {
        await parse(markup);
      } catch (e) {
        err = e;
      }

      expect(err).to.exist;
      expect(err.message).to.match(/esi:try without esi:attempt and esi:except not allowed/);
    });

    it("esi:try without esi:attempt throws", async () => {
      const markup = `
        <esi:try>
          <esi:except></esi:except>
        </esi:try>
      `;

      let err;
      try {
        await parse(markup);
      } catch (e) {
        err = e;
      }

      expect(err).to.exist;
      expect(err.message).to.match(/esi:try without esi:attempt and esi:except not allowed/);
    });

    it("esi:attempt outside of esi:try throws", async () => {
      const markup = `
        <esi:vars>
          <esi:attempt></esi:attempt>
        </esi:vars>
      `;

      let err;
      try {
        await parse(markup);
      } catch (e) {
        err = e;
      }

      expect(err).to.exist;
      expect(err.message).to.match(/esi:attempt is not allowed outside of a esi:try/);
    });

    it("esi:except outside of esi:try throws", async () => {
      const markup = `
        <esi:vars>
          <esi:except></esi:except>
        </esi:vars>
      `;

      let err;
      try {
        await parse(markup);
      } catch (e) {
        err = e;
      }

      expect(err).to.exist;
      expect(err.message).to.match(/esi:except is not allowed outside of a esi:try/);
    });
  });
});
