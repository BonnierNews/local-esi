/* eslint-disable no-use-before-define */
import { pipeline, Readable } from "stream";

import HTMLStream from "@bonniernews/atlas-html-stream";

import { assign, test, replace } from "./evaluateExpression.js";
import ESIBase from "./ESIBase.js";

class ESITag {
  constructor(context) {
    this.context = context;
  }
  open(data, next) {
    next();
  }
  close(next) {
    next();
  }
}

class ESITry extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:attempt", "esi:except" ].includes(name)) {
      throw new Error(`${name} is not allowed inside an esi:try`);
    }
  }
  open(data, next) {
    this.context.tries.push({ success: true, chunks: [] });
    return next();
  }
  close(next) {
    if (!this.children.includes("esi:attempt")) {
      return next(new Error("esi:try without esi:attempt not allowed"));
    }
    this.children.length = 0;

    const { chunks } = this.context.tries.pop();
    if (this.context.tries.length) {
      this.context.tries.at(-1).chunks.push(...chunks);
      return next();
    }

    this.context.writeToResult(chunks, next);
  }
}

class ESIAttempt extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:attempt is not allowed outside esi:try");
    }
  }
  open(data, next) {
    this.context.tries.at(-1).inAttempt = true;
    next();
  }
  close(next) {
    this.context.tries.at(-1).inAttempt = false;
    if (!this.context.tries.at(-1).success) {
      this.context.tries.at(-1).chunks.length = 0;
    }
    next();
  }
}

class ESIExcept extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:except is not allowed outside esi:try");
    }
  }
  open(data, next) {
    this.context.tries.at(-1).inExcept = true;
    next();
  }
  close(next) {
    this.context.tries.at(-1).inExcept = false;
    next();
  }
}

class ESIChoose extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:when", "esi:otherwise" ].includes(name)) {
      throw new Error(`${name} is not allowed inside a esi:choose`);
    }
  }
  open(data, next) {
    this.context.chooses.push({ testMatched: false, chosen: false });
    return next();
  }
  close(next) {
    if (!this.children.includes("esi:when")) {
      return next(new Error("esi:choose without esi:when not allowed"));
    }
    this.children.length = 0;
    this.context.chooses.pop();
    return next();
  }
}

class ESIWhen extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:when is not allowed outside esi:choose");
    }
  }
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];

    let result;
    try {
      result = test(data.test, context);
    } catch (err) {
      return next(err);
    }

    if (lastChoose.testMatched) {
      lastChoose.chosen = false;
      return next();
    }

    if (data.matchname) {
      context.assigns[data.matchname] = result;
    }

    lastChoose.testMatched = lastChoose.chosen = !!result;

    return next();
  }
}

class ESIOtherwise extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:otherwise is not allowed outside esi:choose");
    }
  }
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];
    lastChoose.chosen = !lastChoose.testMatched;
    return next();
  }
}

class ESIText extends ESITag {
  get plainText() {
    return true;
  }
}

class ESIAssign extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) {
      return next();
    }

    const value = data.value;
    try {
      context.assigns[data.name] = assign(value, context);
    } catch (err) {
      if (/unknown keyword/i.test(err.message)) context.assigns[data.name] = value;
      else return next(err);
    }

    next();
  }
}

class ESIBreak extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.inForeach) return next(new Error("esi:break outside esi:foreach"));
    context.breakHit = context.breakHit || context.shouldWrite();
    return context.breakHit ? next(null, { name: "esi:break" }) : next();
  }
}

class ESIEval extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    pipeline([
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
      new ESIBase(new ESIEvaluator(context.clone(true))),
    ], (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIInclude extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    const streams = [
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
    ];
    if (data.dca === "esi") {
      streams.push(new ESIBase(new ESIEvaluator(context.clone())));
    }
    pipeline(streams, (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIForEach extends ESITag {
  open(data, next) {
    const context = this.context;
    context.items = assign(data.collection, context);
    if (!Array.isArray(context.items)) {
      context.items = Object.entries(context.items);
    }
    context.itemVariableName = data.item || "item";

    context.foreachChunks = [];
    return next();
  }
  close(next) {
    const context = this.context;
    const foreachChunks = context.foreachChunks;
    delete context.foreachChunks;

    let buffered = [];

    for (let value of context.items) {
      if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;

      buffered = buffered.concat([ { name: "esi:assign", data: { name: context.itemVariableName, value: value.toString() } }, { name: "esi:assign" } ], foreachChunks);
    }

    const localContext = context.subContext();
    localContext.inForeach = true;
    const chunks = [];

    pipeline([
      Readable.from(buffered),
      new ESIBase(new ESIEvaluator(localContext)),
    ], (err) => {
      if (err) return next(err);
      return context.writeToResult(chunks, next);
    }).on("data", function onData(chunk) {
      if (chunk.name === "esi:break") {
        this.pause();
        return process.nextTick(() => this.push(null));
      }

      chunks.push(chunk);
    });
  }
}

const EsiTags = {
  "esi:assign": ESIAssign,
  "esi:attempt": ESIAttempt,
  "esi:break": ESIBreak,
  "esi:choose": ESIChoose,
  "esi:except": ESIExcept,
  "esi:otherwise": ESIOtherwise,
  "esi:text": ESIText,
  "esi:try": ESITry,
  "esi:vars": ESITag,
  "esi:when": ESIWhen,
  "esi:eval": ESIEval,
  "esi:include": ESIInclude,
  "esi:foreach": ESIForEach,
};

export default class ESIEvaluator {
  constructor(context) {
    this.context = context;
  }
  onopentag(name, data, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ name, data });
      return next();
    }

    if (name.startsWith("esi:")) {
      const Tag = EsiTags[name];
      const wasInPlainText = context.isInPlainText();
      if (!Tag && !wasInPlainText) {
        throw new Error(`ESI tag ${name} not implemented.`);
      }
      let esiFunc;
      if (Tag) esiFunc = new Tag(context);
      const tags = context.tags;
      const idx = context.tags.push(esiFunc);
      const parent = tags[idx - 2];
      if (parent?.assertChild) {
        try {
          parent.assertChild(name);
        } catch (err) {
          return next(err);
        }
      }
      if (esiFunc?.assertParent) {
        try {
          esiFunc.assertParent(parent);
        } catch (err) {
          return next(err);
        }
      }
      if (!wasInPlainText) return esiFunc.open(data, next);
    }

    if (context.tries.length) {
      next = this.bufferEvaluated.bind(this, next);
    }

    context.writeToResult({ name, data: this.makeAttributes(data) }, next);
  }
  onclosetag(name, next) {
    const context = this.context;
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({ name });
      return next();
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) return popped.close(next);
        return next();
      }
    }

    if (context.tries.length) {
      next = this.bufferEvaluated.bind(this, next);
    }

    context.writeToResult({ name }, next);
  }
  ontext(text, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ text });
      return next();
    }

    if (!context.isProcessing()) {
      return context.writeToResult({ text }, next);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      if (context.tries.length) {
        next = this.bufferEvaluated.bind(this, next);
      }

      return context.writeToResult((currentContext) => {
        const result = { text: replace(text, currentContext || context) };
        context.bufferingString = false;
        return result;
      }, next); // handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return next();
      }

      return next(err);
    }
  }
  makeAttributes(data) {
    if (!data) return {};

    const context = this.context;
    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      if (context.isProcessing()) {
        value = replace(value, context);
      }
      attributes[key] = value || "";
      return attributes;
    }, {});
  }
  bufferEvaluated(next, error, chunk) {
    if (error || !chunk) return next(error, chunk);

    this.context.tries.at(-1).chunks.push(chunk);
    next();
  }
}
