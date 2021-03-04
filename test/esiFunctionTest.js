"use strict";

const ck = require("chronokinesis");
const localEsi = require("..");
const toCookieStr = require("./toCookieStr");

describe("functions", () => {
  describe("$add_header", () => {
    it("should set headers when instructed", (done) => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue; HttpOnly')";
      markup += "</esi:vars>";

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(headers).to.have.length(1);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "MyCookie1=SomeValue; HttpOnly");
          done();
        }
      }, done);
    });

    it("should set multiple headers when instructed", (done) => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";
      markup += "$add_header('Set-Cookie', 'MyCookie2=SomeValue2; Path=/; Secure; SameSite=Lax')";
      markup += "</esi:vars>";

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(headers).to.have.length(2);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "MyCookie1=SomeValue;");
          expect(headers[1]).to.have.property("name", "Set-Cookie");
          expect(headers[1]).to.have.property("value", "MyCookie2=SomeValue2; Path=/; Secure; SameSite=Lax");
          done();
        }
      }, done);
    });

    it("should NOT set headers when instructed outside an ESI tag", (done) => {
      const markup = "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal(markup);
          expect(headers).to.have.length(0);
          done();
        }
      }, done);
    });

    it("should set headers when instructed in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            $add_header('Set-Cookie', 'MyCookie1=SomeValue;')
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(authorized)=='false'">
          </esi:when>
          <esi:otherwise>
            $add_header('Set-Cookie', 'MyCookie2=SomeValue2;')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const headers = [];
      function cookie(name, value, options) {
        headers.push({name: "Set-Cookie", value: toCookieStr(name, value, options)});
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(headers).to.have.length(2);
          expect(headers[0]).to.have.property("name", "Set-Cookie");
          expect(headers[0]).to.have.property("value", "MyCookie1=SomeValue;");
          expect(headers[1]).to.have.property("name", "Set-Cookie");
          expect(headers[1]).to.have.property("value", "MyCookie2=SomeValue2;");
          done();
        }
      }, done);
    });

    it("should not set headers when in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            $add_header('Set-Cookie', 'MyCookie1=SomeValue;')
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const headers = [];
      function set(name, value) {
        headers.push({name, value});
      }

      localEsi(markup, { }, {
        set,
        send(body) {
          expect(body).to.equal("");
          expect(headers).to.have.length(0);
          done();
        }
      }, done);
    });
  });

  describe("$set_response_code", () => {
    it("supports $set_response_code with status as only parameter", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code( 401 )
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(401);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement markup", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>hej</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("<p>hej</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement markup in esi:choose", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="'a' == 'b'">
            <p>ignore</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(400, '<p>hej</p>')
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("<p>hej</p>");
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement markup containing what looks like the end of the statement", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>)</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("<p>)</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement string", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, 'OK')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("OK");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
          return this;
        },
        send(body) {
          expect(body).to.equal("<p>Unauthorized</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(401);
          done();
        }
      }, done);
    });

    it("should not set response code in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401)
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(setStatus).to.be.undefined;
          done();
        }
      }, done);
    });

    it("should not set response code or modify body when in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(setStatus).to.be.undefined;
          done();
        }
      }, done);
    });
  });

  describe("$set_redirect", () => {
    it("supports $set_redirect", (done) => {
      const markup = `
        <esi:vars>
          $set_redirect('https://blahonga.com')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
          expect(redirectUrl).to.equal("https://blahonga.com");
          done();
        },
        send: done
      });
    });

    it("supports $set_redirect in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
          expect(redirectUrl).to.equal("https://blahonga.com");
          done();
        }
      });
    });

    it("should evaluate nested multiple chooses when first test evaluates to true", (done) => {
      const markup = `<esi:assign name="blahonga" value="'true'" />
        <esi:choose>
          <esi:when test="$(blahonga)=='true'">
            <esi:choose>
              <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
                <p>hej 1</p>
              </esi:when>
              <esi:otherwise>
                <p>då 1</p>
              </esi:otherwise>
            </esi:choose>
            <esi:choose>
              <esi:when test="$exists($(HTTP_COOKIE{'cookie3'})) | $exists($(HTTP_COOKIE{'cookie4'}))">
                <p>hej 2</p>
              </esi:when>
              <esi:otherwise>
                <p>då 2</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
          <esi:otherwise>
            <p>hej igen</p>
          </esi:otherwise>
        </esi:choose>`.replace(/^\s+|\n/gm, "");
      const expectedMarkup = "<p>hej 1</p><p>då 2</p>";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });


    it("should not set redirect in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
          $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(redirectUrl).to.be.undefined;
          done();
        }
      }, done);
    });
  });

  describe("$base64", () => {
    it("supports $base64_encode", (done) => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'U2VhbkBCYW5hbiE='">
            <p>true</p>
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

    it("supports $base64_decode", (done) => {
      const markup = `
        <esi:assign name="str" value="'U2VhbkBCYW5hbiE='"/>
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'">
            <p>true</p>
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

    it("handles base64_decode with undefined value", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'">
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>false</p>");
          done();
        }
      }, done);
    });

    it("handles base64_encode with undefined value", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'Sean@Banan!'">
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>false</p>");
          done();
        }
      }, done);
    });
  });

  describe("$index", () => {
    it("supports $index", (done) => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$index($(str), 'Banan') > -1">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$index($(str), 'Apple') < 0">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p><p>true again</p>");
          done();
        }
      }, done);
    });
  });

  describe("$str", () => {
    it("supports $str", (done) => {
      const markup = `
        <esi:assign name="int" value="1" />
        <esi:assign name="additionWithStr" value="$str($(int)) + $str($(int))" />
        <esi:assign name="additionWithoutStr" value="$(int) + $(int)" />
        Result: <esi:vars>$(additionWithStr)</esi:vars>,
        Same with $str():
        <esi:choose>
          <esi:when test="$(additionWithStr)==$(additionWithoutStr)">
            yes
          </esi:when>
          <esi:otherwise>
            no
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal("Result: 11,Same with $str():no");
          done();
        }
      }, done);
    });

    it("outputs string representations of values with different types", (done) => {
      const markup = `
        <esi:assign name="bool" value="false" />
        <esi:assign name="int" value="0" />
        <esi:vars>
          <ul>
            <li>$str($(bool))
            <li>$str($(int))
          </ul>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal("" +
            "<ul>" +
              "<li>false" +
              "<li>0" +
            "</ul>"
          );
          done();
        }
      }, done);
    });

    it("outputs None when $str is invoked with non-existing variable", (done) => {
      const markup = `
        <esi:vars>
          $str($(noexist))
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal("None");
          done();
        }
      }, done);
    });

    it.skip("outputs string representations of objects", (done) => {
      const markup = `
        <esi:assign name="list" value="[1, 2]" />
        <esi:assign name="obj" value="{'a': 1, 'b': 2}" />
        <esi:vars>
          <ul>
            <li>$str($(list))
            <li>$str($(obj))
          </ul>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal("" +
            "<ul>" +
              "<li>[1, 2]" +
              "<li>{'a': 1, 'b': 2}" +
            "</ul>"
          );
          done();
        }
      }, done);
    });
  });

  describe("$substr", () => {
    it("supports $substr", (done) => {
      const markup = `
        <esi:assign name="str" value="'abcdef'" />
        <esi:vars>
          <p>$substr('12345678', 2, 4)</p>
          <p>$substr('12345678', 0)</p>
          <p>$substr('12345678', 1)</p>
          <p>$substr('12345678', -2)</p>
          <p>$substr('12345678', 2, 40)</p>
          <p>$substr('12345678', 2, -4)</p>
          <p>$substr($(str), 2, 2)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>3456</p><p>12345678</p><p>2345678</p><p>78</p><p>345678</p><p>34</p><p>cd</p>");
          done();
        }
      }, done);
    });

    it("throws when $substr is invoked with non-existing variable", (done) => {
      const markup = `
        <esi:vars>
          <p>$substr($(str), 2, 2)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send() {
        }
      }, (nextErr) => {
        expect(nextErr).to.not.equal(undefined);
        done();
      });
    });

    it("throws when $substr is invoked without valid params", (done) => {
      const markup = `
        <esi:vars>
          <p>$substr($(str))</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send() {
        }
      }, (nextErr) => {
        expect(nextErr).to.not.equal(undefined);
        done();
      });
    });
  });

  describe("$time", () => {
    before(() => {
      ck.freeze("2019-06-30");
    });

    after(ck.reset);

    it("supports $time", (done) => {
      const markup = `
        <esi:assign name="now" value="$time()" />
        <esi:vars>
          <p>$(now)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const now = Math.round(Date.now() / 1000);
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(`<p>${now}</p>`);
          done();
        }
      }, done);
    });
  });

  describe("$http_time", () => {
    it("supports $http_time", (done) => {
      const markup = `
        <esi:assign name="now" value="$http_time(995319416)" />
        <esi:vars>
          <p>$(now)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>Mon, 16 Jul 2001 21:36:56 GMT</p>");
          done();
        }
      }, done);
    });
  });

  describe("$digest_md5", () => {
    it("creates md5 hash", (done) => {
      const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36";
      const remoteAddress = "83.185.38.31";

      const markup = `
        <esi:assign name="hash" value="$digest_md5($(REMOTE_ADDR) + $(HTTP_USER_AGENT))" />
        <esi:vars>
          <p>$(hash)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, {
        headers: {
          "user-agent": userAgent,
          "x-forwarded-for": remoteAddress,
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>[657885894, 693072170, -1514255750, 111706645]</p>");
          done();
        }
      }, done);
    });
  });

  describe("supports $string_split", () => {
    it("can split a string by a single character as a separator", (done) => {
      const markup = `
      <esi:assign name="commaSeparatedString" value="one,two,three"/>
      <esi:foreach collection="$string_split($(commaSeparatedString), ',')">
        <p>hello!</p>
      </esi:foreach>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(`<p>hello!</p><p>hello!</p><p>hello!</p>`);
          done();
        }
      }, done);
    });

    it("can split a string by multiple characters as a separator", (done) => {
      const markup = `
      <esi:assign name="commaSeparatedString" value="one...two...three"/>
      <esi:foreach collection="$string_split($(commaSeparatedString), '...')">
        <p>hello!</p>
      </esi:foreach>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(`<p>hello!</p><p>hello!</p><p>hello!</p>`);
          done();
        }
      }, done);
    });
  });
});
