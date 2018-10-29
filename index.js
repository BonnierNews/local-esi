"use strict";

const url = require("url");
const request = require("request");
const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const transformHtml = require("./lib/transformHtml");
const esiExpressionParser = require("./lib/esiExpressionParser");

function localEsi(html, req, res, next) {
  const context = ListenerContext(req, res);
  const listener = ESIListener(context);
  transformHtml(html, listener, (err, parsed) => {
    if (err) return next(err);
    if (context.replacement) {
      return res.send(context.replacement);
    }
    res.send(parsed);
  });
}

function ListenerContext(req, res) {
  return {
    esiChooseTags: [],
    assigns: {
      "HTTP_COOKIE": req.cookies || {},
      "HTTP_USER_AGENT": {},
      "QUERY_STRING": req.query || {}
    },
    cookies: req.cookies,
    req,
    res,
    inEsiStatementProcessingContext: false,
    inAttempt: false,
    lastAttemptWasError: false,
    inExcept: false,
    includeError: false,
    ignoreUntilNextEndChoose: false,
    replacement: ""
  };
}

function ESIListener(context) {
  const esiTags = {};

  esiTags["esi:except"] = {
    open(attribs, next) {
      context.inExcept = true;
      next();
    },
    close(next) {
      context.inExcept = false;
      next();
    }
  };

  esiTags["esi:choose"] = {
    open(attribs, next) {
      if (!shouldWrite()) {
        context.ignoreUntilNextEndChoose = true;
        return next();
      }
      context.esiChooseTags.push({tagname: "esi:choose", attribs, isChoosing: true });
      return next();
    },
    close(next) {
      if (context.ignoreUntilNextEndChoose) {
        context.ignoreUntilNextEndChoose = false;
      } else {
        context.esiChooseTags.pop();
      }

      return next();
    }
  };

  esiTags["esi:assign"] = {
    open(attribs, next) {
      context.assigns[attribs.name] = attribs.value;
      next();
    }
  };

  esiTags["esi:vars"] = {
    open(attribs, next) {
      context.inEsiStatementProcessingContext = true;
      next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
      next();
    }
  };

  esiTags["esi:include"] = {
    open(attribs, next) {
      if (!shouldWrite()) return next();

      fetchIncluded(attribs, (fetchError, fetchResult) => {
        if (fetchError) {
          return next(fetchError);
        }
        if (attribs.dca !== "esi") {
          return writeToResult(fetchResult, next);
        }
        const listener = ESIListener(ListenerContext(context.req, context.res));
        transformHtml(fetchResult, listener, (parseError, parsedResult) => {
          writeToResult(parsedResult, next);
        });
      });
    }
  };

  esiTags["esi:eval"] = {
    open(attribs, next) {
      if (!shouldWrite()) return next();
      fetchIncluded(attribs, (fetchError, fetchResult) => {
        if (fetchError) {
          return next(fetchError);
        }
        const listener = ESIListener(context);
        transformHtml(fetchResult, listener, (parseError, parsedResult) => {
          writeToResult(parsedResult, next);
        });
      });
    }
  };

  esiTags["esi:try"] = {
    open(attribs, next) {
      next();
    }
  };

  esiTags["esi:attempt"] = {
    open(attribs, next) {
      context.inAttempt = true;
      next();
    }
  };

  esiTags["esi:when"] = {
    open(attribs, next) {
      const lastChooseTag = getLastChooseTag();
      if (lastChooseTag.foundMatchingTestAttribute) {
        lastChooseTag.shouldWrite = false;
        return next();
      }
      const result = evaluateExpression(attribs.test, context);

      lastChooseTag.foundMatchingTestAttribute = result;
      lastChooseTag.shouldWrite = result;
      context.inEsiStatementProcessingContext = true;

      return next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
      next();
    }
  };

  esiTags["esi:otherwise"] = {
    open(attribs, next) {
      getLastChooseTag().shouldWrite = !getLastChooseTag().foundMatchingTestAttribute;
      context.inEsiStatementProcessingContext = true;
      return next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
      next();
    }
  };

  function fetchIncluded(attribs, fetchCallback) {
    const options = {
      headers: Object.assign({}, context.req.headers)
    };

    options.headers.host = undefined;

    let source = attribs.src;

    if (!url.parse(attribs.src).pathname.endsWith("/")) {
      return fetchCallback(new Error("Included URL's path name must end with /"));
    }
    for (const key in context.assigns) {
      if (typeof context.assigns[key] === "string") {
        source = source.replace(`$(${key})`, context.assigns[key]);
      }
    }

    source = source.replace(/\$url_encode\((.*?)\)/, (_, b) => {
      return encodeURIComponent(b);
    });

    let includeUrl = source;
    if (!includeUrl.startsWith("http")) {
      includeUrl = url.resolve(`http://localhost:${context.req.socket.server.address().port}`, source);
    }
    request.get(includeUrl, options, (err, res, body) => {
      if (err) {
        if (context.inAttempt) {
          context.lastAttemptWasError = true;
          return fetchCallback(null, "");
        }
        return fetchCallback(err);
      }
      fetchCallback(null, body);
    });
  }

  return {
    onopentag,
    ontext,
    onclosetag,
  };

  function getLastChooseTag() {
    return context.esiChooseTags[context.esiChooseTags.length - 1];
  }

  function shouldWrite() {
    if (context.ignoreUntilNextEndChoose) {
      return false;
    }
    if (context.inExcept && !context.lastAttemptWasError) {
      return false;
    }

    const lastChooseTag = getLastChooseTag();
    if (lastChooseTag) {
      return lastChooseTag.shouldWrite;
    }

    return true;
  }

  function onopentag(tagname, attribs, next) {
    if (tagname.startsWith("esi:")) {
      const esiFunc = esiTags[tagname];
      if (!esiFunc) {
        throw new Error(`ESI tag ${tagname} not implemented.`);
      }
      return esiFunc.open(attribs, next);
    }

    if (tagname === "!--") {
      return writeToResult("<!--", next);
    }
    writeToResult(`<${tagname}${attributesToString(attribs)}>`, next);
  }

  function ontext(text, next) {
    if (context.inEsiStatementProcessingContext) {
      return writeToResult(handleProcessingInstructions(text), next);
    }

    writeToResult(text, next);
  }

  function handleProcessingInstructions(text) {
    text = text.replace(/\$add_header\('Set-Cookie', '([^']+).*?\)/ig, (_, cookieString) => { // Pål should have all the credit for this
      const splitCookie = cookieString.split(/=|;/);
      if (shouldWrite()) {
        context.res.cookie(splitCookie[0], splitCookie[1].replace(";", ""));
      }
      return "";
    });

    text = text.replace(/\$set_response_code\(\s*(\d{3})\s*\)/ig, (_, responseCode) => {
      if (shouldWrite()) {
        context.res.status(parseInt(responseCode));
      }
      return "";
    });


    text = text.replace(/\$set_response_code\(\s*(\d{3})\s*,\s*(')((.*?)\2\s*\))?/ig, (_, responseCode, _2, _3, content) => {
      if (!shouldWrite()) return "";
      context.res.status(parseInt(responseCode));
      if (content) {
        context.replacement = content;
        return "";
      }
      context.inReplacement = true;
      return "";
    });

    if (context.inReplacement && text === "')") {
      context.inReplacement = false;
      text = "";
    }

    return text;
  }

  function onclosetag(tagname, next) {
    if (tagname.startsWith("esi:")) {
      const esiFunc = esiTags[tagname];
      if (!esiFunc) {
        throw new Error(`ESI tag ${tagname} not implemented.`);
      }

      if (esiFunc.close) {
        return esiFunc.close(next);
      }

      return next();
    }

    if (voidElements.includes(tagname)) return;

    if (tagname === "!--") {
      return writeToResult("-->", next);
    }
    writeToResult(`</${tagname}>`, next);
  }

  function attributesToString(attr) {
    if (!attr) return "";
    return Object.keys(attr).reduce((attributes, key) => {
      const value = attr[key];
      if (value === "") {
        return `${attributes} ${key}`;
      }
      attributes += ` ${key}="${value}"`;
      return attributes;
    }, "");
  }

  function writeToResult(chunk, next) {
    if (context.inReplacement) {
      context.replacement += chunk;
      return next();
    }
    if (shouldWrite()) {
      return next(null, chunk);
    }
    next();
  }
}

function evaluateExpression(test, context) {
  const funcs = {
    Identifier(node, nodeContext = context.assigns) {
      return nodeContext[node.name];
    },
    exists([arg]) {
      return !!getFunc(arg.type)(arg);
    },
    int([arg]) {
      return parseInt(getFunc(arg.type)(arg));
    },
    CallExpression(node) {
      return getFunc(node.callee.name)(node.arguments);
    },
    LogicalExpression(node) {
      const left = getFunc(node.left.type)(node.left);
      const right = getFunc(node.right.type)(node.right);

      if (node.operator === "&" || node.operator === "&&") return left && right;
      if (node.operator === "|" || node.operator === "||") return left || right;

      throw new Error(`Uknown BinaryExpression operator ${node.operator}`);
    },
    BinaryExpression(node) {
      const left = getFunc(node.left.type)(node.left);
      const right = getFunc(node.right.type)(node.right);

      if (node.operator === "==") return left === right;
      if (node.operator === ">=") return left >= right;
      if (node.operator === "<=") return left <= right;

      throw new Error(`Uknown BinaryExpression operator ${node.operator}`);
    },
    MemberExpression(node) {
      const object = getFunc(node.object.type)(node.object);

      if (!object) throw new Error(`Cannot read member from ${JSON.stringify(node.object)}`);

      return getFunc(node.property.type)(node.property, object);
    },
    Literal(node) {
      return node.value;
    },
    UnaryExpression(node) {
      if (node.operator !== "!") {
        throw new Error(`Unary operator ${node.operator} not implemented`);
      }

      return !getFunc(node.argument.type)(node.argument);
    }
  };

  const parsedTree = esiExpressionParser(test);
  return getFunc(parsedTree.type)(parsedTree);

  function getFunc(name) {
    if (!funcs[name]) throw new Error(`${name} is not implemented`);
    return funcs[name];
  }
}

module.exports = localEsi;
