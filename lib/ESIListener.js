"use strict";

const ListenerContext = require("./ListenerContext");
const request = require("request");
const transformHtml = require("./transformHtml");
const url = require("url");
const {assign, test, replace} = require("./evaluateExpression");

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
      try {
        context.assigns[attribs.name] = assign(value, context);
      } catch (err) {
        if (/unknown keyword/i.test(err.message)) context.assigns[attribs.name] = value;
        else return next(err);
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
        const wasInProcessingContext = context.inEsiStatementProcessingContext;
        context.inEsiStatementProcessingContext = false;
        const listener = ESIListener(context);
        transformHtml(fetchResult, listener, (parseError, parsedResult) => {
          if (parseError) {
            return next(parseError);
          }
          writeToResult(parsedResult, (err, value) => {
            context.inEsiStatementProcessingContext = wasInProcessingContext;
            next(err, value);
          });
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
      const result = test(attribs.test, context);
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

    let includeUrl = replace(attribs.src, context);
    if (!includeUrl.startsWith("http")) {
      includeUrl = url.resolve(`http://localhost:${context.req.socket.server.address().port}`, includeUrl);
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
      if (context.buffering && current.text) {
        text = current.text + text;
      }

      try {
        return writeToResult(() => {
          return replace(text, context);
        }, next);
      } catch (err) {
        if (err.message.includes("Found end of file before end")) {
          context.buffering = true;
          current.text = text;
          return next();
        }

        return next(err);
      }
    }

    context.buffering = false;

    try {
      return writeToResult(text, next);
    } catch (err) {
      return next(err);
    }
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
      let value = attr[key];
      if (value === "") {
        return `${attributes} ${key}`;
      }
      const [current = {}] = context.tags.slice(-1);
      if (context.inEsiStatementProcessingContext && !current.plainText) {
        value = replace(value, context);
      }
      attributes += ` ${key}="${value}"`;
      return attributes;
    }, "");
  }

  function writeToResult(chunk, next) {
    if (context.buffering) {
      const [current = {}] = context.tags.slice(-1);
      if (typeof chunk === "function") {
        chunk = chunk();
      }

      current.text += chunk;

      return next();
    }

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
