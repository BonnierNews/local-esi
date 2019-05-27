"use strict";
const url = require("url");
const request = require("request");
const evaluateExpression = require("./evaluateExpression");
const transformHtml = require("./transformHtml");
const ListenerContext = require("./ListenerContext");

const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const selfClosingElements = ["esi:include", "esi:eval", "esi:assign", "esi:debug"];

module.exports = function ESIListener(context) {
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
      context.chooses.push({ hasEvaluatedToTrue: false, isCurrentlyEvaluatedTo: false });

      return next();
    },
    close(next) {
      context.chooses.pop();

      return next();
    }
  };

  esiTags["esi:assign"] = {
    open(attribs, next) {
      if (!shouldWrite()) {
        return next();
      }
      const value = attribs.value;
      if (value.startsWith("'''") && value.endsWith("'''")) {
        context.assigns[attribs.name] = value.replace(/'''/ig, "");
      } else {
        context.assigns[attribs.name] = removeReservedCharacters(evaluateExpression(value, context));
      }

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

  esiTags["esi:text"] = {
    plainText: true,
    open(attribs, next) {
      next();
    },
    close(next) {
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
      const lastChoose = context.chooses[context.chooses.length - 1];
      const result = evaluateExpression(attribs.test, context);
      if (attribs.matchname) {
        context.assigns[attribs.matchname] = result;
      }

      lastChoose.isCurrentlyEvaluatedTo = !lastChoose.isCurrentlyEvaluatedTo && result;
      lastChoose.hasEvaluatedToTrue = lastChoose.hasEvaluatedToTrue || result;
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
      const lastChoose = context.chooses[context.chooses.length - 1];
      lastChoose.isCurrentlyEvaluatedTo = !lastChoose.hasEvaluatedToTrue;

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
    delete options.headers["content-type"];

    let source = attribs.src;

    if (source.startsWith("$(") && source.endsWith(")")) { //src is a variable
      source = context.assigns[source.substring(2, source.length - 1)];
    }

    if (!url.parse(source).pathname.endsWith("/")) {
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
      if (!err && res.statusCode > 399) {
        err = new Error(`Response code: ${res.statusCode}`);
      }
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

  function shouldWrite() {
    if (context.inExcept && !context.lastAttemptWasError) {
      return false;
    }

    if (context.chooses.length) {
      return context.chooses.every((choose) => choose.isCurrentlyEvaluatedTo);
    }

    return true;
  }

  function onopentag(tagname, attribs, next) {
    const [current = {}] = context.tags.slice(-1);

    if (tagname.startsWith("esi:")) {
      if (!current.plainText) {
        const esiFunc = esiTags[tagname];
        context.tags.push(esiFunc);

        if (!esiFunc) {
          throw new Error(`ESI tag ${tagname} not implemented.`);
        }
        const res = esiFunc.open(attribs, next);
        return res;
      }

      if (selfClosingElements.includes(tagname)) {
        return writeToResult(`<${tagname}${attributesToString(attribs)}/>`, next);
      }
    }

    if (tagname === "!--") {
      return writeToResult("<!--", next);
    }
    writeToResult(`<${tagname}${attributesToString(attribs)}>`, next);
  }

  function ontext(text, next) {
    const [current = {}] = context.tags.slice(-1);
    if (context.inEsiStatementProcessingContext && !current.plainText) {
      try {

        return writeToResult(handleProcessingInstructions.bind(null, text), next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
      } catch (err) {
        return next(err);
      }
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

    text = text.replace(/\$set_redirect\(\s*'(.+?)'\s*\)/ig, (_, location) => {
      if (shouldWrite()) {
        context.res.redirect(location);
        context.redirected = true;
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

    text = text.replace(/\$substr\((.*?),\s*(-?\d+)(,\s*(-?\d+))?\)/ig, (_, group1, group2, _2, group4) => {
      const string = evaluateExpression(group1, context);
      if (typeof string !== "string") {
        throw new Error(`$substr invoked non-string: ${string}`);
      }
      const startIndex = parseInt(group2);
      let length = group4 && parseInt(group4);
      if (length < 0) {
        length = string.length - startIndex + length;
      }
      return string.substr(startIndex, length);
    });

    if (context.inReplacement && text === "')") {
      context.inReplacement = false;
      text = "";
    }

    if (text.match(/\$substr\((.*?)\)/ig)) {
      throw new Error("$substr invoked without start index parameter");
    }

    text = removeReservedCharacters(text);

    text = text.replace(/\$\(\w*(({\d+})|({'\w+'}))?\)/ig, (variableAccess) => { //Variable access
      const expressionResult = evaluateExpression(variableAccess, context);
      if (expressionResult === undefined) {
        return "";
      }
      return evaluateExpression(variableAccess, context);
    });

    text = text.replace(/\\\\/g, "\\"); //Escaped backslashes, remove the escaping backslash

    return text;
  }

  function removeReservedCharacters(original) {
    if (!original || typeof original !== "string") {
      return original;
    }

    let text = original.replace(/\\["]/g, "\"");

    text = text.replace(/(^|[^\\])(\\)($|[^\\])/ig, (_, group1, _2, group3) => { //Remove backslashes, but not escaped ones
      return `${group1}${group3}`;
    });

    text = text.replace(/\\\\/g, "\\"); //Escaped backslashes, remove the escaping backslash

    return text;
  }
  function onclosetag(tagname, next) {
    const [current = {}] = context.tags.slice(-1);

    if (tagname.startsWith("esi:")) {
      if (!current.plainText) {
        const esiFunc = esiTags[tagname];
        if (!esiFunc) {
          throw new Error(`ESI tag ${tagname} not implemented.`);
        }

        if (esiFunc.close) {
          return esiFunc.close(next);
        }

        return next();
      } else if (current.plainText && esiTags[tagname] === current) {
        context.tags.pop();
        if (current.close) {
          return current.close(next);
        }
        return next();
      }

      if (selfClosingElements.includes(tagname)) {
        return next();
      }
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
    if (typeof chunk === "function" && (context.inReplacement || shouldWrite())) {
      chunk = chunk();
    }
    if (context.inReplacement) {
      context.replacement += chunk;
      return next();
    }
    if (shouldWrite()) {
      return next(null, chunk);
    }
    next();
  }
};
