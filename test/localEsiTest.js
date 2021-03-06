"use strict";

const localEsi = require("../index");
const nock = require("nock");
const toCookieStr = require("./toCookieStr");

describe("local ESI", () => {
  describe("html", () => {
    it("should not touch regular markup (notably)", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          const quotedAndEscaped = markup
            .replace(
              "/some/where/",
              "\"/some/where/\""
            )
            .replace(
              "'{\"linkUrl\": \"/some/where/\"}'",
              "\"{&quot;linkUrl&quot;: &quot;/some/where/&quot;}\"",
            );
          expect(body).to.equal(quotedAndEscaped);
          done();
        }
      }, done);
    });

    it("should not touch regular markup in esi context", (done) => {
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

      localEsi(`<esi:vars>${markup}</esi:vars>`, {}, {
        send(body) {
          expect(body).to.equal(markup);
          done();
        }
      }, done);
    });

    it("should not touch multi-byte characters", (done) => {
      const prefix = "<!DOCTYPE html><html><head><title>This is a title</title></head><body>";
      const suffix = "</body></html>";
      const characters = Array(9817).fill("Töst").join("");
      const markup = prefix + characters + suffix;
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(markup);
          done();
        }
      }, done);
    });

    it("should not touch JS in script-tag inside <esi:choose>", (done) => {
      const scriptTag = `<script>!function(){"use strict";window.foobar=function(e){var n=document.getElementsByClassName(e)[0];}();</script>`; //eslint-disable-line quotes

      const markup = `<!DOCTYPE html><html><head><title>This is a title</title></head><body>Test: <b>Testsson</b>
      <esi:choose>
        <esi:when test="1 == 1">
          ${scriptTag}
        </esi:when>
      </esi:choose>
      </body></html>`;

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.contain(scriptTag);
          done();
        }
      }, done);
    });

    it("should not touch JS in script-tag inside <esi:vars>", (done) => {
      const scriptTag = `<script>!function(){"use strict";window.foobar=function(e){var n=document.getElementsByClassName(e)[0];}();</script>`; //eslint-disable-line quotes

      const markup = `<!DOCTYPE html><html><head><title>This is a title</title></head><body>Test: <b>Testsson</b>
      <esi:vars>
        ${scriptTag}
      </esi:vars>
      </body></html>`;

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.contain(scriptTag);
          done();
        }
      }, done);
    });

    it("supports weird quotes like “ and ” inside esi:choose", (done) => {
      const innerText = "Here's a quote by Wayne Gretzky: “You miss 100% of the shots you don't take“. <br> Here's a quote by Homer Simpson: ”do'h”. This text should be valid in any ESI context.";
      const markup = `<esi:choose><esi:when test="1==1">${innerText}</esi:when></esi:choose>`;

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(innerText);
          done();
        }
      }, done);
    });
  });

  describe("esi:choose", () => {
    it("should render the otherwise statement of an esi:choose when not matching our specific test", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(HTTP_COOKIE{'someCookie'})) | $exists($(HTTP_COOKIE{'someOtherCookie'}))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      localEsi(markup, { cookies: { someThirdCookie: "no" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should render the when statement of an esi:choose when testing existance of assigned esi variable", (done) => {
      let markup = "<esi:assign name=\"user_email\" value=\"'jan.bananberg@test.com'\"/>";
      markup += "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>When</pre>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should render the otherwise statement of an esi:choose when missing assigned esi variable", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle test of assigned variable value", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("does assign variable in when if test evaluates to true", (done) => {
      const markup = `
        <esi:assign name="myVar" value="'false'" />
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='2' & $(REQUEST_PATH)=='/hanubis-introversion/'">
            <esi:assign name="myVar" value="'true'" />
          </esi:when>
        </esi:choose>
        <esi:vars>
          $(myVar)
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { query: { q: "2", p: "1"}, path: "/hanubis-introversion/" }, {
        send(body) {
          expect(body).to.equal("true");
          done();
        }
      }, done);
    });

    it("does NOT assign variable in when if test evaluates to false", (done) => {
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

      localEsi(markup, { query: { q: "2", p: "1"} }, {
        send(body) {
          expect(body).to.equal("false");
          done();
        }
      }, done);
    });

    it("should not evaluate nested choose when in otherwise if first test evaluates to true", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not evaluate crashing code in when if criteria evaluates to false", (done) => {
      const markup = `<esi:assign name="blahonga" value="'false'" />
      <esi:choose>
        <esi:when test="$(blahonga)=='true'">
          $substr($(nonexisting), 0)
        </esi:when>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle nested choose in when when test evaluates to true", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("supports nested esi:choose when all match", (done) => {
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
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not render anything if outer choose is false", (done) => {
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
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not render anything if outer choose is false (very nested chooses)", (done) => {
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
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("hides nested esi:choose outcome if first level evaluates to false", (done) => {
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

      localEsi(markup, { query: { q: "2", p: "1"} }, {
        send(body) {
          expect(body).to.equal("");
          done();
        }
      }, done);
    });

    it("should support OR test when first criteria is true", (done) => {
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
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support OR test when second criteria is true", (done) => {
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
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support OR test when no criteria is true", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support test with unary expression", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when when both are true", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when where the first evaluates to false", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when and otherwise where both whens are false", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when and otherwise where the first when is true", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with &&", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_COOKIE{'intCookie'}) == 1 && $(HTTP_COOKIE{'intCookie'}) == 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with int function call", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) == 1">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 1 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with !=", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) != 1">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 2 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with >= and <=", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) >= 1 && $int($(HTTP_COOKIE{'int_cookie'})) <= 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 50 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with comparison to unexisting cookie parsed as int", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'non-existing-cookie'})) == 0">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: {} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle multiple unneeded parentheses", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="($int($(HTTP_COOKIE{'int_cookie'})) >= 1) && ($int($(HTTP_COOKIE{'int_cookie'})) <= 59)">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 50 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle QUERY_STRING", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='blahong'">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { query: { q: "blahong" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle HTTP HEADER", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_HOST)=='http://www.example.com'">
            <p>Welcome to example.com</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Welcome to example.com</p>";
      localEsi(markup, { headers: { "host": "http://www.example.com" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle custom HTTP HEADER", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_X_CUSTOM_HEADER)">
            <p>Custom header identified</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Custom header identified</p>";
      localEsi(markup, { headers: { "x-custom-header": "My header value" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("keyword true false", (done) => {
      const markup = `
        <esi:assign name="test" value="true"/>
        <esi:choose>
          <esi:when test="$(test) == true">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });

  describe("esi:eval", () => {
    it("should fetch and evaluate esi:eval", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not included instructions as if in processing context (functions inside and ESI-tag) by default", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="'a' == 'a'">`; //eslint-disable-line quotes
      markup += "$add_header('Set-Cookie', 'before_cookie=val1')";
      markup += "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";
      markup += "$add_header('Set-Cookie', 'after_cookie=val1')";
      markup += "</esi:when>";
      markup += "</esi:choose>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')");


      const headers = [];
      function set(name, value) {
        headers.push({name, value});
      }

      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        set,
        cookie,
        send(body) {
          expect(body).to.equal("$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')<p>efter</p>");
          expect(headers).to.have.length(2);
          expect(headers[0]).to.have.property("value", "before_cookie=val1");
          expect(headers[1]).to.have.property("value", "after_cookie=val1");
          done();
        }
      }, done);
    });

    it("but it should support a new processing context from the included instructions", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="'a' == 'a'">`; //eslint-disable-line quotes
      markup += "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";
      markup += "</esi:when>";
      markup += "</esi:choose>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')</esi:vars>");


      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send(body) {
          expect(body).to.equal("<p>efter</p>");
          expect(headers).to.have.length(1);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT");
          done();
        }
      }, done);
    });

    it("should handle re-assign variable value from esi:eval", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should be able to eval source without trailing slash", (done) => {
      const markup = "<esi:eval src=\"/mystuff\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff")
        .reply(200, "Tjabo");

      const headers = [];
      function set(name, value) {
        headers.push({name, value});
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        set,
        send(body) {
          expect(body).to.equal("Tjabo<p>efter</p>");
          done();
        }
      }, done);
    });
  });

  describe("esi:include", () => {
    it("should fetch and insert esi:include with relative url when dca=none", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch and evaluate esi:include with relative url when dca=esi", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234", {
        reqheaders: { cookie: "da_cookie=cookie_value"}
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          cookie: "da_cookie=cookie_value"
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch and evaluate esi:include with absolute url", (done) => {
      const markup = "<esi:include src=\"http://mystuff.com/\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", {
        reqheaders: { host: "mystuff.com"}
      })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should handle include source query parameters", (done) => {
      let markup = "<esi:assign name=\"user_email\" value=\"'sammy_g@test.com'\"/>";
      markup += "<esi:include src=\"/mystuff/?a=b&user=$url_encode($(user_email))\" dca=\"esi\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .query({
          a: "b",
          user: "sammy_g@test.com"
        })
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p>");
          done();
        }
      }, done);
    });

    it("should handle errors when esi:including using esi:try", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
          done();
        }
      }, done);
    });

    it("should handle errors when esi:including using esi:try and dca=esi", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
          done();
        }
      }, done);
    });

    it("should handle successfull response when esi:including using esi:try", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>innan</p><p>Frid och fröjd</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should call next with error when the response to an esi:include returns 500 (outside try/attempt)", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send() {
          done(new Error("We should not be here"));
        }
      }, (err) => {
        expect(err).to.not.be.undefined;
        expect(err).to.not.be.null;
        done();
      });
    });

    it("should not execute esi:assign from esi:include in the original scope", (done) => {
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
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should add header when instructed from included source when dca=esi", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')</esi:vars>");


      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send(body) {
          expect(body).to.equal("<p>efter</p>");
          expect(headers).to.have.length(1);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT");
          done();
        }
      }, done);
    });

    it("should add headers when instructed via query parameter", (done) => {
      const markup =
        "<esi:choose>\n" +
        "  <esi:when test=\"$(QUERY_STRING{'add-headers'}) == 'true'\">" +
        "    <esi:vars>" +
        "      $add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT')" +
        "      $add_header('Set-Cookie', 'my_cookie2=val2; path=/; HttpOnly; Expires=Wed, 31 Aug 2019 00:00:00 GMT')" +
        "    </esi:vars>" +
        "  </esi:when>" +
        "</esi:choose>";

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, {
        query: { "add-headers": true },
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send() {
          expect(headers).to.have.length(2);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "my_cookie=val1; path=/; HttpOnly; Expires=Wed, 30 Aug 2019 00:00:00 GMT");
          expect(headers[1]).to.have.property("name", "Set-Cookie");
          expect(headers[1]).to.have.property("value", "my_cookie2=val2; path=/; HttpOnly; Expires=Wed, 31 Aug 2019 00:00:00 GMT");

          done();
        }
      }, done);
    });

    it("should not add header when instructed from included source when dca=none", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars>");

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send(body) {
          expect(body).to.equal("<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars><p>efter</p>");
          expect(headers).to.have.length(0);
          done();
        }
      }, done);
    });

    it("should handle path without trailing slash, even when in esi:try", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("Alles gut");
          done();
        }
      }, done);
    });

    it("should fetch without content-type header when using esi:include", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", {
        badheaders: ["content-type", "application/x-www-form-urlencoded"]
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        }
      }, {
        send(body) {
          expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch without content-type header when using esi:eval", (done) => {
      const markup = "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", {
        badheaders: ["content-type", "application/x-www-form-urlencoded"]
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        }
      }, {
        send() {
          done();
        }
      }, done);
    });

    it("should support esi:include when entire URL is a variable", (done) => {
      let markup = "<esi:assign name=\"daurl\" value=\"'http://mystuff.com/'\"/>";
      markup += "<esi:include src=\"$(daurl)\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", {
        reqheaders: { host: "mystuff.com"}
      })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should support esi:include when URL contains a variable", (done) => {
      let markup = "<esi:assign name=\"host\" value=\"'mystuff.com'\"/>";
      markup += "<esi:include src=\"http://$(host)/path/\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", {
        reqheaders: { host: "mystuff.com"}
      })
        .get("/path/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should support esi:include when URL contains a HTTP_COOKIE", (done) => {
      const markup = "<esi:include src=\"/foo$(HTTP_COOKIE{'MyCookie'})/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/foobar/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        cookies: { MyCookie: "bar" },
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });
  });

  describe("esi:text", () => {
    it("supports esi:text", (done) => {
      const markup = "<esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("supports esi:text inside esi:choose", (done) => {
      const markup = "<esi:choose><esi:when test=\"$(QUERY_STRING{'q'})=='blahong'\"><esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text></esi:when></esi:choose>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      localEsi(markup, { query: { q: "blahong" }}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("supports esi:text with JSON containg escaped citation inside esi:choose", (done) => {
      const json = {"test": "[\"BI_News\"]" };
      const markup = `<esi:choose>
      <esi:when test="1==1">
      <esi:text>${JSON.stringify(json)}</esi:text>
      </esi:when>
      </esi:choose>`;

      localEsi(markup, {}, {
        send(body) {
          try {
            const object = JSON.parse(body);
            expect(object).to.eql(json);
            done();
          } catch (error) {
            done(error);
          }
        }
      });
    });
  });

  describe("esi:assign", () => {
    it("should evaluate value expression", (done) => {
      const markup = `
        <esi:assign name="cookie_val" value="$(HTTP_COOKIE{'cookie1'})" />
        <esi:vars>
          $(cookie_val)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "jklöjl";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support assignment from regex result", (done) => {
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
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not crash when assigning from non-existing value expression", (done) => {
      const markup = `
        <esi:assign name="cookie_val" value="$(HTTP_COOKIE{'cookie1'})" />
        <esi:vars>
          $(cookie_val)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });

  describe("esi:foreach", () => {
    it("loops through supplied array collection", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("loops through supplied object collection", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("preserves state between iterations", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("allows breaking out of foreach", (done) => {
      const markup = `
        <ul>
          <esi:foreach collection="[0, 1, 2]">
            <li>$(item)</li>
            <esi:choose>
              <esi:when test="$(item) == 1">
                <esi:break />
              </esi:when>
            </esi:choose>
          </esi:foreach>
        </ul>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = `
        <ul>
            <li>0</li>
            <li>1</li>
        </ul>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });

  describe("illegal characters", () => {
    const illegalCharacters = [
      "$"
    ];

    illegalCharacters.forEach((character) => {
      it(`doesn't crash on illegal "${character}" character outside esi context`, (done) => {
        const html = `<p>This text contains expected ${character} character</p>`;

        localEsi(html, {}, {
          send(body) {
            expect(body).to.equal(html);
            done();
          }
        }, unexpectedCallback.bind(null, done));
      });

      it(`crashes on unexpected illegal "${character}" character inside esi context`, (done) => {
        const html = `<p>This text contains unexpected ${character} character</p>`;
        const markup = `<esi:vars>${html}</esi:vars>`;

        localEsi(markup, {}, {send: unexpectedCallback.bind(null, done, null)}, (err) => {
          expect(err).to.exist;
          expect(err.message, "wrong error").to.include("Unexpected char  ");
          done();
        });
      });

      it(`doesn't crash on illegal "${character}" character inside <esi:text></esi:text>`, (done) => {
        const html = `<p>This text contains expected ${character} character</p>`;
        const markup = `<esi:vars><esi:text>${html}</esi:text></esi:vars>`;

        localEsi(markup, {}, {
          send(body) {
            expect(body).to.equal(html);
            done();
          }
        }, unexpectedCallback.bind(null, done));
      });

      it(`doesn't crash on escaped illegal "${character}" character`, (done) => {
        const html = `<p>This text contains expected \\${character} character</p>`;
        const markup = `<esi:vars>${html}</esi:vars>`;

        localEsi(markup, {}, {
          send(body) {
            expect(body).to.equal(html.replace("\\", ""));
            done();
          }
        }, unexpectedCallback.bind(null, done));
      });
    });

    function unexpectedCallback(done, err, result) {
      if (err) return done(err);
      done(new Error(`Unexpected result: ${result}`));
    }
  });

  describe("has and has_i operator", () => {
    it("supports has operator", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports has_i operator", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports comparison of undefined identifier", (done) => {
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

      localEsi(
        markup,
        {},
        {
          send(body) {
            expect(body).to.equal(
              "<p>'banan' has ''</p>" +
              "<p>'' has ''</p>" +
              "<p>'banan' has_i ''</p>" +
              "<p>'' has_i ''</p>"
            );
            done();
          },
        },
        done
      );
    });

    it("supports comparison of numbers and strings", (done) => {
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

      localEsi(
        markup,
        {},
        {
          send(body) {
            expect(body).to.equal(
              "<p>10 has 1</p>" +
              "<p>'10' has 1</p>" +
              "<p>10 has '1'</p>" +
              "<p>10 has_i 1</p>" +
              "<p>'10' has_i 1</p>" +
              "<p>10 has_i '1'</p>"
            );
            done();
          },
        },
        done
      );
    });
  });

  describe("matches and matches_i operator", () => {
    it("supports matches operator", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports matches_i operator", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports matches operator with matchname property", (done) => {
      const markup = `
          <esi:choose>
          <esi:when test="'blahonga25blahingi' matches '''(blahonga)(\\d*)(5bla)'''" matchname="number">
            <p>$(number{0}) $(number{2})</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>blahonga25bla 2</p>");
          done();
        }
      }, done);
    });

    it("does not crash when matches is invoked on non-existing value", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p></p>");
          done();
        }
      }, done);
    });

    it("does not crash when matches_i is invoked on non-existing value", (done) => {
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

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p></p>");
          done();
        }
      }, done);
    });
  });

  describe("outputting variables", () => {
    it("outputs the value of variables in context of esi:vars", (done) => {
      const markup = `
        <esi:assign name="game1" value="'Sim city'"/>
        <p>$(game1)</p>
        <esi:vars>
          <p>Some $(game1) text</p>
          <p>$(HTTP_COOKIE{'cookie1'})</p>
          <p>$(non_existings)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { cookies: { cookie1: "Kaka nummer ett" } }, {
        send(body) {
          expect(body).to.equal("<p>$(game1)</p><p>Some Sim city text</p><p>Kaka nummer ett</p><p></p>");
          done();
        }
      }, done);
    });

    it("outputs the value of variables in attributes when in context of esi:vars", (done) => {
      const markup = `
      <esi:assign name="namn" value="'Roger!'"/>
      <esi:vars>
        <input name="blahonga" value="$(namn)">
        <esi:text><input name="blahonga2" value="$(namn)"></esi:text>
      </esi:vars>
      <input name="blahonga3" value="$(namn)">
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal("<input name=\"blahonga\" value=\"Roger!\"><input name=\"blahonga2\" value=\"$(namn)\"><input name=\"blahonga3\" value=\"$(namn)\">");
          done();
        }
      }, done);
    });
  });

  describe("reserved characters and escaping", () => {
    it("does not removes backslashes outside processing context", (done) => {
      const markup = `
        <p>\\Program Files\\Game\\Fun.exe.</p>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
          done();
        }
      }, done);
    });

    it("removes backslashes in processing context", (done) => {
      const markup = `
        <esi:vars>
          <p>\\Program Files\\Game\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>Program FilesGameFun.exe.</p>");
          done();
        }
      }, done);
    });

    it("supports escaping backslashes with backslash in processing context", (done) => {
      const markup = `
        <esi:vars>
          <p>\\\\Program Files\\\\Game\\\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
          done();
        }
      }, done);
    });

    it("does not support espacing backslashes in processing context with tripple quotes", (done) => {
      const markup = `
        <esi:vars>
          <p>'''\\Program Files\\Game\\Fun.exe.'''</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>'''Program FilesGameFun.exe.'''</p>");
          done();
        }
      }, done);
    });

    it("removes backslashes when assigning variables", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>/mystuff/</p>");
          done();
        }
      }, done);
    });

    it("supports escaping using backslash when assigning variables", (done) => {
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

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>\\/my\\stuff/</p>");
          done();
        }
      }, done);
    });

    it("supports escaping using tripple quotes when assigning variables", (done) => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="'''\\/my\\stuff/'''" />
        <esi:include src="$(daurl)" dca="none"/><p>efter</p>
      `.replace(/^\s+|\n/gm, "");

      nock("http://my:80")
        .get("/stuff/")
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });
  });

  describe("math operators", () => {
    it("should handle addition", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle subtraction", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle multiplication", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle division", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle modulo division", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });

  describe("collection", () => {
    it("should handle collection", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal("Ja");
          done();
        }
      }, done);
    });

    it("handles collection with identifiers", (done) => {
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

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal("Ja");
          done();
        }
      }, done);
    });
  });
});
