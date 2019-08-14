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
        return writeToResult(() => {
          return handleProcessingInstructions(ensureNoIllegalCharacters(text));
        }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
      } catch (err) {
        return next(err);
      }
    }

    try {
      return writeToResult(ensureNoIllegalCharacters(text, current.plainText), next);
    } catch (err) {
      return next(err);
    }
  }

  function ensureNoIllegalCharacters(text, inPlainText) {
    if (inPlainText) return text;

    // matches
    // - weird quotes
    // - dollar signs not part of an esi expression
    const pattern = /(“|”|\$(?!\w*?\())/g;
    let match;

    while ((match = pattern.exec(text))) {
      const {"1": character, index} = match;
      if (text.charAt(index - 1) === "\\") continue;

      const excerptStart = Math.max(index - 30, 0);
      const excerpt = text.substr(excerptStart, 60);

      throw new Error(`Illegal character "${character}" in "${excerpt}"`);
    }

    return text;
  }

  function handleProcessingInstructions(text) {
    text = text.replace(/\$set_response_code\(\s*(\d{3})\s*,\s*(')((.*?)\2\s*\))?/ig, (_, responseCode, _2, _3, content) => { // set_response_code with replacement markup
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

    text = removeReservedCharacters(text);

    let newText = "";
    let inExpression = false;
    let expressionStart;
    let openParentheses = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === "$") {
        if (!inExpression) {
          expressionStart = i;
        }
        inExpression = true;
      }

      if (!inExpression) {
        newText += char;
      }

      if (inExpression && char === "(") {
        openParentheses++;
      }

      if (inExpression && char === ")") {
        openParentheses--;
        if (openParentheses === 0) {
          inExpression = false;
          const expressionResult = evaluateExpression(text.substring(expressionStart, i + 1), context);
          if (expressionResult !== undefined) {
            newText += expressionResult;
          }
        }
      }
    }

    return newText;
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
      let value = attr[key];
      if (value === "") {
        return `${attributes} ${key}`;
      }
      const [current = {}] = context.tags.slice(-1);
      if (context.inEsiStatementProcessingContext && !current.plainText) {
        value = handleProcessingInstructions(value);
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
