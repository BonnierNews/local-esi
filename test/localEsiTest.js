import nock from "nock";

import * as api from "../index.js";

const { parse } = api;

describe("local ESI", () => {
  describe("api", () => {
    it("exposes expected api", () => {
      expect(api).to.have.property("ESI").that.is.a("function");
      expect(api).to.have.property("HTMLWriter").that.is.a("function");
      expect(api).to.have.property("parse").that.is.a("function");
    });
  });

  describe("html", () => {
    it("should not touch regular markup (notably)", async () => {
      const markup = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>This is a title</title>
          </head>
          <body>
            Test: <b>Testsson</b>
            <a href=/some/where/>link</a>
            <div data-something='{"linkUrl": "/some/where/"}'>component</div>
            <script async src="path/to/script.js"></script>
          </body>
        </html>`.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});

      const quotedAndEscaped = markup
        .replace(
          "/some/where/",
          "\"/some/where/\""
        )
        .replace(
          "'{\"linkUrl\": \"/some/where/\"}'",
          "\"{&quot;linkUrl&quot;: &quot;/some/where/&quot;}\""
        );

      expect(body).to.equal(quotedAndEscaped);
    });

    it("should not touch regular markup in esi context", async () => {
      const markup = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>This is a title</title>
          </head>
          <body>
            Test: <b>Testsson</b>
            <script async src="path/to/script.js"></script>
          </body>
        </html>`.replace(/^\s+|\n/gm, "");

      const { body } = await parse(`<esi:vars>${markup}</esi:vars>`);
      expect(body).to.equal(markup);
    });

    it("should not touch multi-byte characters", async () => {
      const prefix = "<!DOCTYPE html><html><head><title>This is a title</title></head><body>";
      const suffix = "</body></html>";
      const characters = Array(9817).fill("Töst").join("");
      const markup = prefix + characters + suffix;

      const { body } = await parse(markup);
      expect(body).to.equal(markup);
    });

    it("should not touch JS in script-tag inside <esi:choose>", async () => {
      const scriptTag = `<script>!function(){"use strict";window.foobar=function(e){var n=document.getElementsByClassName(e)[0];}();</script>`; // eslint-disable-line quotes

      const markup = `<!DOCTYPE html><html><head><title>This is a title</title></head><body>Test: <b>Testsson</b>
      <esi:choose>
        <esi:when test="1 == 1">
          ${scriptTag}
        </esi:when>
      </esi:choose>
      </body></html>`;

      const { body } = await parse(markup);
      expect(body).to.contain(scriptTag);
    });

    it("should not touch JS in script-tag inside <esi:vars>", async () => {
      const scriptTag = `<script>!function(){"use strict";window.foobar=function(e){var n=document.getElementsByClassName(e)[0];}();</script>`; // eslint-disable-line quotes

      const markup = `<!DOCTYPE html><html><head><title>This is a title</title></head><body>Test: <b>Testsson</b>
      <esi:vars>
        ${scriptTag}
      </esi:vars>
      </body></html>`;

      const { body } = await parse(markup);
      expect(body).to.contain(scriptTag);
    });

    it("supports weird quotes like “ and ” inside esi:choose", async () => {
      const innerText = "Here's a quote by Wayne Gretzky: “You miss 100% of the shots you don't take“. <br> Here's a quote by Homer Simpson: ”do'h”. This text should be valid in any ESI context.";
      const markup = `<esi:choose><esi:when test="1==1">${innerText}</esi:when></esi:choose>`;

      const { body } = await parse(markup);
      expect(body).to.equal(innerText);
    });
  });

  describe("esi:choose", () => {
    it("should render the otherwise statement of an esi:choose when not matching our specific test", async () => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(HTTP_COOKIE{'someCookie'})) | $exists($(HTTP_COOKIE{'someOtherCookie'}))">`; // eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("should render the when statement of an esi:choose when testing existance of assigned esi variable", async () => {
      let markup = "<esi:assign name=\"user_email\" value=\"'jan.bananberg@test.com'\"/>";
      markup += "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; // eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>When</pre>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("should render the otherwise statement of an esi:choose when missing assigned esi variable", async () => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; // eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("should handle test of assigned variable value", async () => {
      const markup = `<esi:assign name="someVar" value="'true'" />
      <esi:choose>
        <esi:when test="$(someVar)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>hej</p>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("does assign variable in when if test evaluates to true", async () => {
      const markup = `
        <esi:assign name="myVar" value="'false'" />
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='2' & $(REQUEST_PATH)=='/hanubis-introversion/' & $(GEO{'country_code'})=='CN'">
            <esi:assign name="myVar" value="'true'" />
          </esi:when>
        </esi:choose>
        <esi:vars>
          $(myVar)
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {
        headers: { ["x-localesi-geo"]: JSON.stringify({ country_code: "CN" }) },
        query: { q: "2", p: "1" },
        path: "/hanubis-introversion/",
      });
      expect(body).to.equal("true");
    });

    it("does NOT assign variable in when if test evaluates to false", async () => {
      const markup = `
        <esi:assign name="myVar" value="'false'" />
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='1'">
            <esi:assign name="myVar" value="'true'" />
          </esi:when>
        </esi:choose>
        <esi:vars>
          $(myVar)
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { query: { q: "2", p: "1" } });
      expect(body).to.equal("false");
    });

    it("should not evaluate nested choose when in otherwise if first test evaluates to true", async () => {
      const markup = `<esi:assign name="blahonga" value="'true'" />
      <esi:choose>
        <esi:when test="$(blahonga)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <esi:choose>
            <esi:when test="$exists($(user_email))">
              <p>hej igen</p>
            </esi:when>
            <esi:otherwise>
              <p>då</p>
            </esi:otherwise>
          </esi:choose>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>hej</p>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("should not evaluate crashing code in when if criteria evaluates to false", async () => {
      const markup = `<esi:assign name="blahonga" value="'false'" />
      <esi:choose>
        <esi:when test="$(blahonga)=='true'">
          $substr($(nonexisting), 0)
        </esi:when>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("");
    });

    it("should handle nested choose in when when test evaluates to true", async () => {
      const markup = `<esi:assign name="var_a" value="'true'" />
      <esi:choose>
        <esi:when test="$(var_a)=='true'">
          <esi:choose>
            <esi:when test="$exists($(user_email))">
              <p>hej</p>
            </esi:when>
            <esi:otherwise>
              <p>då</p>
            </esi:otherwise>
          </esi:choose>
        </esi:when>
        <esi:otherwise>
          <p>då igen</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>då</p>";

      const { body } = await parse(markup);
      expect(body).to.equal(expectedMarkup);
    });

    it("supports nested esi:choose when all match", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='1'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>Hej</p>
              </esi:when>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";

      const { body } = await parse(markup, { query: { q: "1", p: "1" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should not render anything if outer choose is false", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='0'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='0'">
                <p>1</p>
              </esi:when>
              <esi:otherwise>
                <p>2</p>
              </esi:otherwise>
            </esi:choose>

            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>3</p>
              </esi:when>
              <esi:otherwise>
                <p>4</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      const { body } = await parse(markup, { query: { q: "1", p: "1" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should not render anything if outer choose is false (very nested chooses)", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='0'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='0'">
                <esi:choose>
                  <esi:when test="$(QUERY_STRING{'p'})=='1'">
                    <p>3</p>
                  </esi:when>
                  <esi:otherwise>
                    <p>4</p>
                  </esi:otherwise>
                </esi:choose>
                <esi:choose>
                  <esi:when test="$(QUERY_STRING{'p'})=='1'">
                    <p>3</p>
                  </esi:when>
                  <esi:otherwise>
                    <p>4</p>
                  </esi:otherwise>
                </esi:choose>
              </esi:when>
              <esi:otherwise>
                <p>2</p>
              </esi:otherwise>
            </esi:choose>

            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>3</p>
              </esi:when>
              <esi:otherwise>
                <p>4</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      const { body } = await parse(markup, { query: { q: "1", p: "1" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("hides nested esi:choose outcome if first level evaluates to false", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='1'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>Hej</p>
              </esi:when>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { query: { q: "2", p: "1" } });
      expect(body).to.equal("");
    });

    it("should support OR test when first criteria is true", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Approved</p>";
      const { body } = await parse(markup, { cookies: { cookie1: "jklöjl" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support OR test when second criteria is true", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Approved</p>";
      const { body } = await parse(markup, { cookies: { cookie1: "jklöjl" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support OR test when no criteria is true", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Rejected</p>";

      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support test with unary expression", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>Rejected</p>
          </esi:when>
          <esi:otherwise>
            <p>Approved</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Rejected</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support choose with multiple when when both are true", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="!$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>First when</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support choose with multiple when where the first evaluates to false", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="!$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Second when</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support choose with multiple when and otherwise where both whens are false", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Otherwise</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support choose with multiple when and otherwise where the first when is true", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>First when</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support choose with multiple overlapping when takes the first truthy when", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 1">
            <p>First when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 2">
            <p>Second when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 3">
            <p>Third when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 4">
            <p>Fourth when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let result;

      result = await parse(markup, { cookies: { cookie1: "0" } });
      expect(result.body, "0").to.equal("<p>Otherwise</p>");

      result = await parse(markup, { cookies: { cookie1: "2" } });
      expect(result.body, "2").to.equal("<p>First when</p>");

      result = await parse(markup, { cookies: { cookie1: "3" } });
      expect(result.body, "3").to.equal("<p>First when</p>");

      result = await parse(markup, { cookies: { cookie1: "4" } });
      expect(result.body, "4").to.equal("<p>First when</p>");
    });

    it("runs through multiple overlapping whens to detect syntax errors", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 1">
            <p>First when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 2">
            <p>Second when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'})) > 3">
            <p>Third when</p>
          </esi:when>
          <esi:when test="$int($(HTTP_COOKIE{'cookie1'}) > 4">
            <p>Fourth when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let err;
      try {
        await parse(markup, { cookies: { cookie1: "2" } });
      } catch (e) {
        err = e;
      }

      expect(err).to.match(/Unclosed CallExpression/);
    });

    it("should support when test with &&", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_COOKIE{'intCookie'}) == 1 && $(HTTP_COOKIE{'intCookie'}) == 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support when test with int function call", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) == 1">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { cookies: { int_cookie: 1 } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support when test with !=", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) != 1">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { cookies: { int_cookie: 2 } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support when test with >= and <=", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) >= 1 && $int($(HTTP_COOKIE{'int_cookie'})) <= 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { cookies: { int_cookie: 50 } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support when test with comparison to unexisting cookie parsed as int", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'non-existing-cookie'})) == 0">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { cookies: {} });
      expect(body).to.equal(expectedMarkup);
    });

    it("should handle multiple unneeded parentheses", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="($int($(HTTP_COOKIE{'int_cookie'})) >= 1) && ($int($(HTTP_COOKIE{'int_cookie'})) <= 59)">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { cookies: { int_cookie: 50 } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should handle QUERY_STRING", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='blahong'">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, { query: { q: "blahong" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should handle HTTP HEADER", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_HOST)=='http://www.example.com'">
            <p>Welcome to example.com</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Welcome to example.com</p>";
      const { body } = await parse(markup, { headers: { host: "http://www.example.com" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should handle custom HTTP HEADER", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_X_CUSTOM_HEADER)">
            <p>Custom header identified</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Custom header identified</p>";
      const { body } = await parse(markup, { headers: { "x-custom-header": "My header value" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("keyword true false", async () => {
      const markup = `
        <esi:assign name="test" value="true"/>
        <esi:choose>
          <esi:when test="$(test) == true">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });
  });

  describe("esi:eval", () => {
    it("should fetch and evaluate esi:eval", async () => {
      const markup = "<div><esi:eval src=\"http://mystuff/\" dca=\"none\"/></div>";
      const evalResponse = `<esi:choose>
        <esi:when test="$exists($(HTTP_COOKIE{'cookie_1'})) | $exists($(HTTP_COOKIE{'cookie_2'}))">
        </esi:when>
        <esi:otherwise>
          <p>hej</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, evalResponse);
      const expectedMarkup = "<div><p>hej</p></div>";

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("relative source use HTTP_HOST to build url", async () => {
      const markup = "<div><esi:eval src=\"/\" dca=\"none\"/></div>";
      const evalResponse = `<esi:choose>
        <esi:when test="$exists($(HTTP_COOKIE{'cookie_1'})) | $exists($(HTTP_COOKIE{'cookie_2'}))">
        </esi:when>
        <esi:otherwise>
          <p>hej</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, evalResponse);

      const expectedMarkup = "<div><p>hej</p></div>";

      const { body } = await parse(markup, { headers: { host: "mystuff" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("relative source use localhost option before HTTP_HOST to build url", async () => {
      const markup = "<div><esi:eval src=\"/\" dca=\"none\"/></div>";
      const evalResponse = `<esi:choose>
        <esi:when test="$exists($(HTTP_COOKIE{'cookie_1'})) | $exists($(HTTP_COOKIE{'cookie_2'}))">
        </esi:when>
        <esi:otherwise>
          <p>hej</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      nock("http://localhost:1234")
        .get("/")
        .reply(200, evalResponse);

      const expectedMarkup = "<div><p>hej</p></div>";

      const { body } = await parse(markup, {
        headers: { host: "mystuff" },
        localhost: "localhost:1234",
      });
      expect(body).to.equal(expectedMarkup);
    });

    it("should not included instructions as if in processing context (functions inside and ESI-tag) by default", async () => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="'a' == 'a'">`; // eslint-disable-line quotes
      markup += "$add_header('Set-Cookie', 'before_cookie=val1')";
      markup += "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";
      markup += "$add_header('Set-Cookie', 'after_cookie=val1')";
      markup += "</esi:when>";
      markup += "</esi:choose>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')");

      const { body, headers } = await parse(markup, { localhost: "localhost:1234" });

      expect(body).to.equal("$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')<p>efter</p>");
      expect(headers).to.have.property("set-cookie").that.deep.equal([
        "before_cookie=val1",
        "after_cookie=val1",
      ]);
    });

    it("but it should support a new processing context from the included instructions", async () => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="'a' == 'a'">`; // eslint-disable-line quotes
      markup += "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";
      markup += "</esi:when>";
      markup += "</esi:choose>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')</esi:vars>");

      const { body, headers } = await parse(markup, { localhost: "localhost:1234" });

      expect(body).to.equal("<p>efter</p>");
      expect(headers).to.have.property("set-cookie").that.deep.equal([ "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT" ]);
    });

    it("should handle re-assign variable value from esi:eval", async () => {
      const markup = `<esi:assign name="some_variable" value="'true'" />
      <esi:eval src="http://mystuff/" dca="none"/>
      <esi:choose>
        <esi:when test="$(some_variable)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const evalResponse = "<esi:assign name=\"some_variable\" value=\"'false'\" />".replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, evalResponse);

      const expectedMarkup = "<p>då</p>";

      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should be able to eval source without trailing slash", async () => {
      const markup = "<esi:eval src=\"/mystuff\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff")
        .reply(200, "Tjabo");

      const { body } = await parse(markup, { localhost: "localhost:1234" });

      expect(body).to.equal("Tjabo<p>efter</p>");
    });

    it("should handle connection errors when used within esi:attempt", async () => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:eval src=\"/mystuff/\" dca=\"esi\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
    });

    it("should include header from \"setheader\" attribute", async () => {
      nock("http://mystuff/", { reqheaders: { "Extra-Header": "Basic" } })
        .get("/basic")
        .reply(200, "basic header is included");
      nock("http://mystuff", { reqheaders: { "Extra-header": "Case insensitive" } })
        .get("/case-insensitive")
        .reply(200, "header name is case insensitive");
      nock("http://mystuff", { reqheaders: { "Extra-Header": "Value from expression" } })
        .get("/value-from-expression")
        .reply(200, "expressions are evaluated");

      const { body } = await parse(`
        <esi:assign name="headerValue" value="'Value from expression'" />
        <esi:eval src="http://mystuff/basic" setheader="Extra-Header:Basic"/>
        <esi:eval src="http://mystuff/case-insensitive" setheader="extra-header:Case insensitive"/>
        <esi:eval src="http://mystuff/value-from-expression" setheader="Extra-Header:$(headerValue)"/>
      `.replace(/^\s+|\n/gm, ""), {});

      expect(body).to.equal(`
        basic header is included
        header name is case insensitive
        expressions are evaluated
      `.replace(/^\s+|\n/gm, ""));
    });
  });

  describe("esi:include", () => {
    it("should fetch and insert esi:include with relative url when dca=none", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
    });

    it("should fetch and evaluate esi:include with relative url when dca=esi", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234", { reqheaders: { cookie: "da_cookie=cookie_value" } })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, {
        localhost: "localhost:1234",
        headers: { cookie: "da_cookie=cookie_value" },
      });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should fetch and evaluate esi:include with absolute url", async () => {
      const markup = "<esi:include src=\"http://mystuff.com/\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", { reqheaders: { host: "mystuff.com" } })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should handle include source query parameters", async () => {
      let markup = "<esi:assign name=\"user_email\" value=\"'sammy_g@test.com'\"/>";
      markup += "<esi:include src=\"/mystuff/?a=b&user=$url_encode($(user_email))\" dca=\"esi\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .query({
          a: "b",
          user: "sammy_g@test.com",
        })
        .reply(200, "<p>hej</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p>");
    });

    it("should handle errors when esi:including using esi:try", async () => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
    });

    it("should handle errors when esi:including using esi:try and dca=esi", async () => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"esi\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
    });

    it("should handle connection errors when esi:including using esi:try", async () => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"esi\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
    });

    it("should handle successfull response when esi:including using esi:try", async () => {
      let markup = "<p>innan</p>";
      markup += "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";
      markup += "<p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p>Frid och fröjd</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>innan</p><p>Frid och fröjd</p><p>efter</p>");
    });

    it("should call next with error when the response to an esi:include returns 500 (outside try/attempt)", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      const err = await parse(markup, { localhost: "localhost:1234" }).catch((e) => e);

      expect(err).to.match(/500/);
    });

    it("should not execute esi:assign from esi:include in the original scope", async () => {
      const markup = `<esi:assign name="some_variable" value="'true'" />
      <esi:include src="http://mystuff/" dca="esi"/>
      <esi:choose>
        <esi:when test="$(some_variable)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const includeResponse = `<esi:assign name="some_variable" value="'false'" />
          <esi:choose>
          <esi:when test="$(some_variable)=='true'">
            <p>hej</p>
          </esi:when>
          <esi:otherwise>
            <p>då</p>
          </esi:otherwise>
        </esi:choose>`.replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, includeResponse);

      const expectedMarkup = "<p>då</p><p>hej</p>";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });

    it("should add header when instructed from included source when dca=esi", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')</esi:vars>");

      const { body, headers } = await parse(markup, { localhost: "localhost:1234" });

      expect(body).to.equal("<p>efter</p>");
      expect(headers).to.have.property("set-cookie").that.deep.equal([ "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT" ]);
    });

    it("should add headers when instructed via query parameter", async () => {
      const markup =
        "<esi:choose>\n" +
        "  <esi:when test=\"$(QUERY_STRING{'add-headers'}) == 'true'\">" +
        "    <esi:vars>" +
        "      $add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')" +
        "      $add_header('Set-Cookie', 'my_cookie2=val2; path=/; HttpOnly; Expires=Wed, 31 Aug 2019 00:00:00 GMT')" +
        "    </esi:vars>" +
        "  </esi:when>" +
        "</esi:choose>";

      const { headers } = await parse(markup, {
        query: { "add-headers": true },
        localhost: "localhost:1234",
      });

      expect(headers).to.have.property("set-cookie").that.deep.equal([
        "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT",
        "my_cookie2=val2; path=/; HttpOnly; Expires=Wed, 31 Aug 2019 00:00:00 GMT",
      ]);
    });

    it("should not add header when instructed from included source when dca=none", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars>");

      const { body, headers } = await parse(markup, { localhost: "localhost:1234" });

      expect(body).to.equal("<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars><p>efter</p>");
      expect(headers).to.be.undefined;
    });

    it("should handle path without trailing slash, even when in esi:try", async () => {
      nock("http://localhost:1234")
        .get("/mystuff")
        .reply(200, "Alles gut");

      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("Alles gut");
    });

    it("should fetch without content-type header when using esi:include", async () => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", { badheaders: [ "content-type", "application/x-www-form-urlencoded" ] })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, {
        localhost: "localhost:1234",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
    });

    it("should fetch without content-type header when using esi:eval", async () => {
      const markup = "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", { badheaders: [ "content-type", "application/x-www-form-urlencoded" ] })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, {
        localhost: "localhost:1234",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });

      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should support esi:include when entire URL is a variable", async () => {
      let markup = "<esi:assign name=\"daurl\" value=\"'http://mystuff.com/'\"/>";
      markup += "<esi:include src=\"$(daurl)\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", { reqheaders: { host: "mystuff.com" } })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should support esi:include when URL contains a variable", async () => {
      let markup = "<esi:assign name=\"host\" value=\"'mystuff.com'\"/>";
      markup += "<esi:include src=\"http://$(host)/path/\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", { reqheaders: { host: "mystuff.com" } })
        .get("/path/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should support esi:include when URL contains a HTTP_COOKIE", async () => {
      const markup = "<esi:include src=\"/foo$(HTTP_COOKIE{'MyCookie'})/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/foobar/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      const { body } = await parse(markup, {
        cookies: { MyCookie: "bar" },
        localhost: "localhost:1234",
      });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });

    it("should include header from \"setheader\" attribute", async () => {
      nock("http://mystuff/", { reqheaders: { "Extra-Header": "Basic" } })
        .get("/basic")
        .reply(200, "basic header is included");
      nock("http://mystuff", { reqheaders: { "Extra-header": "Case insensitive" } })
        .get("/case-insensitive")
        .reply(200, "header name is case insensitive");
      nock("http://mystuff", { reqheaders: { "Extra-Header": "Value from expression" } })
        .get("/value-from-expression")
        .reply(200, "expressions are evaluated");

      const { body } = await parse(`
        <esi:assign name="headerValue" value="'Value from expression'" />
        <esi:include src="http://mystuff/basic" setheader="Extra-Header:Basic"/>
        <esi:include src="http://mystuff/case-insensitive" setheader="extra-header:Case insensitive"/>
        <esi:include src="http://mystuff/value-from-expression" setheader="Extra-Header:$(headerValue)"/>
      `.replace(/^\s+|\n/gm, ""), {});

      expect(body).to.equal(`
        basic header is included
        header name is case insensitive
        expressions are evaluated
      `.replace(/^\s+|\n/gm, ""));
    });
  });

  describe("esi:text", () => {
    it("supports esi:text", async () => {
      const markup = "<esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("supports esi:text inside esi:choose", async () => {
      const markup = "<esi:choose><esi:when test=\"$(QUERY_STRING{'q'})=='blahong'\"><esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text></esi:when></esi:choose>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      const { body } = await parse(markup, { query: { q: "blahong" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("supports esi:text with JSON containg escaped citation inside esi:choose", async () => {
      const json = { test: "[\"BI_News\"]" };
      const markup = `<esi:choose>
      <esi:when test="1==1">
      <esi:text>${JSON.stringify(json)}</esi:text>
      </esi:when>
      </esi:choose>`;

      const { body } = await parse(markup, {});
      const object = JSON.parse(body);
      expect(object).to.eql(json);
    });
  });

  describe("esi:assign", () => {
    it("should evaluate value expression", async () => {
      const markup = `
        <esi:assign name="cookie_val" value="$(HTTP_COOKIE{'cookie1'})" />
        <esi:vars>
          $(cookie_val)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "jklöjl";
      const { body } = await parse(markup, { cookies: { cookie1: "jklöjl" } });
      expect(body).to.equal(expectedMarkup);
    });

    it("should support assignment from regex result", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="'blahonga25blahingi' matches '''(blahonga)(\\d*)(5bla)'''" matchname="number_match">
            <esi:assign name="number" value="$(number_match{2})" />
          </esi:when>
        </esi:choose>
        <esi:vars>
          $(number)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "2";
      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("should not crash when assigning from non-existing value expression", async () => {
      const markup = `
        <esi:assign name="cookie_val" value="$(HTTP_COOKIE{'cookie1'})" />
        <esi:vars>
          $(cookie_val)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      const { body } = await parse(markup, { });
      expect(body).to.equal(expectedMarkup);
    });
  });

  describe("esi:foreach", () => {
    it("loops through supplied array collection", async () => {
      const markup = `
        <ul>
          <esi:foreach collection="[0, 1, 2]">
            <li>$(item)</li>
          </esi:foreach>
        </ul>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <ul>
            <li>0</li>
            <li>1</li>
            <li>2</li>
        </ul>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("loops through supplied object collection", async () => {
      const markup = `
        <dl>
          <esi:foreach collection="{'a': 0, 'b': 1, 'c': 2}">
            <dt>$(item{0})</dt>
            <dd>$(item{1})</dd>
          </esi:foreach>
        </dl>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <dl>
            <dt>a</dt>
            <dd>0</dd>
            <dt>b</dt>
            <dd>1</dd>
            <dt>c</dt>
            <dd>2</dd>
        </dl>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("preserves state between iterations", async () => {
      const markup = `
        <ul>
          <esi:assign name="sum" value="0" />
          <esi:foreach collection="[0, 1, 2, 3, 4, 5]">
            <esi:assign name="sum" value="$(sum) + $(item)" />
            <li>$(item)</li>
            <esi:choose>
              <esi:when test="$(item) > 1">
                <esi:break />
              </esi:when>
            </esi:choose>
          </esi:foreach>
        </ul>
        <esi:vars>
          <div>$(sum)</div>
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <ul>
            <li>0</li>
            <li>1</li>
            <li>2</li>
        </ul>
        <div>3</div>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("can access values from a Dictionary variable (via single-quoted key)", async () => {
      // Note: ESI supports variable access using both with or without single-quotes, but local-esi requires the single-quotes
      const markup = `
        <esi:assign name="pizzaIngredients" value="{'cheese': 'true', 'avocado': 'false'}" />
        <p><esi:vars>Does a pizza have avocado: $(pizzaIngredients{'avocado'})</esi:vars></p>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <p>Does a pizza have avocado: false</p>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("allows breaking out of foreach", async () => {
      const markup = `
        <ul>
          <esi:foreach collection="[0, 1, 2]">
            <li>$(item)</li>
            <esi:choose>
              <esi:when test="$(item) == 1">
                <li>bork</li>
                <esi:break />
                <li>borken</li>
              </esi:when>
            </esi:choose>
          </esi:foreach>
        </ul>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <ul>
            <li>0</li>
            <li>1</li>
            <li>bork</li>
        </ul>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });

    it("can handle named item variables in foreach", async () => {
      const markup = `
        <ul>
          <esi:foreach item="myItemVariable" collection="[1,2,3]">
            <esi:vars>
              <li>$(myItemVariable)</li>
            </esi:vars>
          </esi:foreach>
        </ul>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <ul>
            <li>1</li>
            <li>2</li>
            <li>3</li>
        </ul>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal(expectedMarkup);
    });
  });

  describe("esi:try", () => {
    it("outputs passing attempt block", async () => {
      const markup = `
        <esi:try>
          <esi:attempt>
            <p>hej</p>
          </esi:attempt>
          <esi:except>
            <p>då</p>
          </esi:except>
        </esi:try>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>hej</p>");
    });

    it("outputs except block on failing attempt", async () => {
      const markup = `
        <esi:try>
          <esi:attempt>
            <esi:eval src="/fail" />
          </esi:attempt>
          <esi:except>
            <p>då</p>
          </esi:except>
        </esi:try>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>då</p>");
    });

    it("omits failing attempt block", async () => {
      const markup = `
        <esi:try>
          <esi:attempt>
            <esi:eval src="/fail" />
          </esi:attempt>
        </esi:try>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("");
    });

    it("omits content before failing attempt", async () => {
      const markup = `
        <esi:try>
          <esi:attempt>
            <p>hej</p>
            <esi:eval src="/fail" />
            <p>hopp</>
          </esi:attempt>
          <esi:except>
            <p>då</p>
          </esi:except>
        </esi:try>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>då</p>");
    });

    it("attempt / except is isolated to each try", async () => {
      const markup = `
        <esi:try>
          <esi:attempt>
            <esi:eval src="/fail" />
            <p>hej 1</p>

            <esi:try>
              <esi:attempt>
                <p>hej 2</p>
              </esi:attempt>
              <esi:except>
                <p>då 2</p>
              </esi:except>
            </esi:try>
          </esi:attempt>
          <esi:except>
            <p>då 1</p>

            <esi:try>
              <esi:attempt>
                <p>hej 3</p>
              </esi:attempt>
              <esi:except>
                <p>då 3</p>
              </esi:except>
            </esi:try>
          </esi:except>
        </esi:try>

        <esi:try>
          <esi:attempt>
            <p>hej 4</p>
          </esi:attempt>
          <esi:except>
            <p>då 4</p>
          </esi:except>
        </esi:try>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body.replace(/^\s+|\n/gm, "")).to.equal(`
        <p>då 1</p>
        <p>hej 3</p>
        <p>hej 4</p>
      `.replace(/^\s+|\n/gm, ""));
    });

    it("omits passing attempt inside non matching choose/when block", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="0">
            don't render this

            <esi:try>
              <esi:attempt>
                or this
              </esi:attempt>
            </esi:try>
          </esi:when>
          <esi:otherwise>
            instead render this
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("instead render this");
    });
  });

  describe("illegal characters", () => {
    const illegalCharacters = [
      "$",
    ];

    illegalCharacters.forEach((character) => {
      it(`doesn't crash on illegal "${character}" character outside esi context`, async () => {
        const html = `<p>This text contains expected ${character} character</p>`;
        const { body } = await parse(html);
        expect(body).to.equal(html);
      });

      it(`crashes on unexpected illegal "${character}" character inside esi context`, async () => {
        const html = `<p>This text contains unexpected ${character} character</p>`;
        const markup = `<esi:vars>${html}</esi:vars>`;

        const err = await parse(markup).catch((e) => e);
        expect(err).to.exist;
        expect(err.message, "wrong error").to.include("Unexpected char  ");
      });

      it(`doesn't crash on illegal "${character}" character inside <esi:text></esi:text>`, async () => {
        const html = `<p>This text contains expected ${character} character</p>`;
        const markup = `<esi:vars><esi:text>${html}</esi:text></esi:vars>`;

        const { body } = await parse(markup);
        expect(body).to.equal(html);
      });

      it(`doesn't crash on escaped illegal "${character}" character`, async () => {
        const html = `<p>This text contains expected \\${character} character</p>`;
        const markup = `<esi:vars>${html}</esi:vars>`;

        const { body } = await parse(markup);
        expect(body).to.equal(html.replace("\\", ""));
      });
    });
  });

  describe("has and has_i operator", () => {
    it("supports has operator", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$(str) has 'Banan'">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) has 'banan'">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>true</p>");
    });

    it("supports has_i operator", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$(str) has_i 'banan'">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) has_i 'Apple'">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>true</p>");
    });

    it("supports comparison of undefined identifier", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$(undefined) has 'banan'">
            <p>'' has 'banan'</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="'banan' has $(undefined)">
            <p>'banan' has ''</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(undefined) has $(not_defined)">
            <p>'' has ''</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(undefined) has_i 'banan'">
            <p>'' has_i "bana''</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="'banan' has_i $(undefined)">
            <p>'banan' has_i ''</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(undefined) has_i $(not_defined)">
            <p>'' has_i ''</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal(
        "<p>'banan' has ''</p>" +
        "<p>'' has ''</p>" +
        "<p>'banan' has_i ''</p>" +
        "<p>'' has_i ''</p>"
      );
    });

    it("supports comparison of numbers and strings", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="10 has 1">
            <p>10 has 1</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="'10' has 1">
            <p>'10' has 1</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="10 has '1'">
            <p>10 has '1'</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="10 has 2">
            <p>10 has 2</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="10 has_i 1">
            <p>10 has_i 1</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="'10' has_i 1">
            <p>'10' has_i 1</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="10 has_i '1'">
            <p>10 has_i '1'</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="10 has_i 2">
            <p>10 has_i 2</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal(
        "<p>10 has 1</p>" +
        "<p>'10' has 1</p>" +
        "<p>10 has '1'</p>" +
        "<p>10 has_i 1</p>" +
        "<p>'10' has_i 1</p>" +
        "<p>10 has_i '1'</p>"
      );
    });
  });

  describe("matches and matches_i operator", () => {
    it("supports matches operator", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$(str) matches 'B.nan'">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) matches 'b.Nan'">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>true</p>");
    });

    it("supports matches_i operator", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$(str) matches_i 'b.Nan'">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) matches_i 'Apple'">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>true</p>");
    });

    it("supports matches operator with matchname property", async () => {
      const markup = `
          <esi:choose>
          <esi:when test="'blahonga25blahingi' matches '''(blahonga)(\\d*)(5bla)'''" matchname="number">
            <p>$(number{0}) $(number{2})</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>blahonga25bla 2</p>");
    });

    it("does not crash when matches is invoked on non-existing value", async () => {
      const markup = `
          <esi:choose>
            <esi:when test="$(neh) matches '''(blahonga)(\\d*)(5bla)'''" matchname="damatch">
              <p>$(damatch{0}) $(number{2})</p>
            </esi:when>
          </esi:choose>
          <esi:vars>
          <p>$(damatch{0})$(number{2})</p>
          </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p></p>");
    });

    it("does not crash when matches_i is invoked on non-existing value", async () => {
      const markup = `
          <esi:choose>
            <esi:when test="$(neh) matches_i '''(blahonga)(\\d*)(5bla)'''" matchname="damatch">
              <p>$(damatch{0}) $(number{2})</p>
            </esi:when>
          </esi:choose>
          <esi:vars>
          <p>$(damatch{0})$(number{2})</p>
          </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p></p>");
    });
  });

  describe("outputting variables", () => {
    it("outputs the value of variables in context of esi:vars", async () => {
      const markup = `
        <esi:assign name="game1" value="'Sim city'"/>
        <p>$(game1)</p>
        <esi:vars>
          <p>Some $(game1) text</p>
          <p>$(HTTP_COOKIE{'cookie1'})</p>
          <p>$(non_existings)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { cookies: { cookie1: "Kaka nummer ett" } });
      expect(body).to.equal("<p>$(game1)</p><p>Some Sim city text</p><p>Kaka nummer ett</p><p></p>");
    });

    it("outputs the value of variables in attributes when in context of esi:vars", async () => {
      const markup = `
      <esi:assign name="namn" value="'Roger!'"/>
      <esi:vars>
        <input name="blahonga" value="$(namn)">
        <esi:text><input name="blahonga2" value="$(namn)"></esi:text>
      </esi:vars>
      <input name="blahonga3" value="$(namn)">
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal("<input name=\"blahonga\" value=\"Roger!\"><input name=\"blahonga2\" value=\"$(namn)\"><input name=\"blahonga3\" value=\"$(namn)\">");
    });
  });

  describe("reserved characters and escaping", () => {
    it("does not removes backslashes outside processing context", async () => {
      const markup = `
        <p>\\Program Files\\Game\\Fun.exe.</p>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
    });

    it("removes backslashes in processing context", async () => {
      const markup = `
        <esi:vars>
          <p>\\Program Files\\Game\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>Program FilesGameFun.exe.</p>");
    });

    it("supports escaping backslashes with backslash in processing context", async () => {
      const markup = `
        <esi:vars>
          <p>\\\\Program Files\\\\Game\\\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
    });

    it("does not support espacing backslashes in processing context with tripple quotes", async () => {
      const markup = `
        <esi:vars>
          <p>'''\\Program Files\\Game\\Fun.exe.'''</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, { });
      expect(body).to.equal("<p>'''Program FilesGameFun.exe.'''</p>");
    });

    it("removes backslashes when assigning variables", async () => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="'\\/my\\stuff/'" />
        <esi:include src="$(daurl)" dca="none"/>
        <esi:vars>
          <p>$(daurl)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p>hej</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>/mystuff/</p>");
    });

    it("supports escaping using backslash when assigning variables", async () => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="'\\\\/my\\\\stuff/'" />
        <esi:include src="$(daurl)" dca="none"/>
        <esi:vars>
          <p>$(daurl)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      nock("http://my:80")
        .get("/stuff/")
        .reply(200, "<p>hej</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>\\/my\\stuff/</p>");
    });

    it("supports escaping using tripple quotes when assigning variables", async () => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="'''\\/my\\stuff/'''" />
        <esi:include src="$(daurl)" dca="none"/><p>efter</p>
      `.replace(/^\s+|\n/gm, "");

      nock("http://my:80")
        .get("/stuff/")
        .reply(200, "<p>hej</p>");

      const { body } = await parse(markup, { localhost: "localhost:1234" });
      expect(body).to.equal("<p>hej</p><p>efter</p>");
    });
  });

  describe("math operators", () => {
    it("should handle addition", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="4 + 2 == 6">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>`;
      const expectedMarkup = "Ja";

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal(expectedMarkup);
    });

    it("should handle subtraction", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="4 + 2 == 6">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>
        `;
      const expectedMarkup = "Ja";

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal(expectedMarkup);
    });

    it("should handle multiplication", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="10 * 7 == 70">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>
        `;
      const expectedMarkup = "Ja";

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal(expectedMarkup);
    });

    it("should handle division", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="100 / 10 == 7">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>
        `;
      const expectedMarkup = "Nej";

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal(expectedMarkup);
    });

    it("should handle modulo division", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="4 % 2 == 0">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>
        `;
      const expectedMarkup = "Ja";

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal(expectedMarkup);
    });
  });

  describe("collection", () => {
    it("should handle collection", async () => {
      const markup = `
        <esi:assign name="myColl" value="[1, 2]" />
        <esi:choose>
          <esi:when test="$(myColl{0}) == 1">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>`;

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal("Ja");
    });

    it("handles collection with identifiers", async () => {
      const markup = `
        <esi:assign name="myVar1" value="1" />
        <esi:assign name="myVar2" value="2" />
        <esi:assign name="myColl" value="[$(myVar1), $(myVar2)]" />
        <esi:choose>
          <esi:when test="$(myColl{0}) == 1">
            Ja
          </esi:when>
          <esi:otherwise>
            Nej
          </esi:otherwise>
        </esi:choose>`;

      const { body } = await parse(markup, {});
      expect(body.trim()).to.equal("Ja");
    });
  });
});
