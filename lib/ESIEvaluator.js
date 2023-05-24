/* eslint-disable no-use-before-define */
"use strict";

const { assign, test, replace } = require("./evaluateExpression");
const ESIBase = require("./ESIBase");
const HtmlParser = require("../../atlas-html-stream/src/HtmlParser.js");

class ESITag {
  constructor(context) {
    this.context = context;
  }
  open(data, controller) {
  }
  close(controller) {
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
  close(controller) {
    if (!this.children.includes("esi:attempt")) {
      controller.error(new Error("esi:try without esi:attempt not allowed"));
      return;
    }
    this.children.length = 0;
  }
}

class ESIAttempt extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:attempt is not allowed outside esi:try");
    }
  }
  open(data, controller) {
    this.context.inAttempt = true;
  }
}

class ESIExcept extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:except is not allowed outside esi:try");
    }
  }
  open(data, controller) {
    this.context.inExcept = true;
  }
  close(controller) {
    this.context.inExcept = false;
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
  open(data, controller) {
    this.context.chooses.push({ testMatched: false, chosen: false });
  }
  close(controller) {
    if (!this.children.includes("esi:when")) {
      controller.error(new Error("esi:choose without esi:when not allowed"));
      return;
    }
    this.children.length = 0;
    this.context.chooses.pop();
    return;
  }
}

class ESIWhen extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:when is not allowed outside esi:choose");
    }
  }
  open(data, controller) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];

    let result;
    try {
      result = test(data.test, context);
    } catch (err) {
      controller.error(err);
      return;
    }

    if (lastChoose.testMatched) {
      lastChoose.chosen = false;
      return;
    }

    if (data.matchname) {
      context.assigns[data.matchname] = result;
    }

    lastChoose.testMatched = lastChoose.chosen = !!result;

    return;
  }
}

class ESIOtherwise extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:otherwise is not allowed outside esi:choose");
    }
  }
  open(data, controller) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];
    lastChoose.chosen = !lastChoose.testMatched;
    return;
  }
}

class ESIText extends ESITag {
  get plainText() {
    return true;
  }
}

class ESIAssign extends ESITag {
  open(data, controller) {
    const context = this.context;
    if (!context.shouldWrite()) {
      return;
    }

    const value = data.value;
    try {
      context.assigns[data.name] = assign(value, context);
    } catch (err) {
      if (/unknown keyword/i.test(err.message)) {
        context.assigns[data.name] = value;
      } else {
        controller.error(err);
        return;
      }
    }
  }
}

class ESIBreak extends ESITag {
  open(data, controller) {
    const context = this.context;
    if (!context.inForeach) {
      controller.error(new Error("esi:choose without esi:when not allowed"));
      return;
    }
    context.breakHit = context.breakHit || context.shouldWrite();
    if (context.breakHit) {
      controller.enqueue({ name: "esi:break" });
    }
  }
}

class ESIEval extends ESITag {
  async open(data, controller) {
    // console.log('ESIEval', data);
    const context = this.context;
    if (!context.shouldWrite()) return;

    const readableStream = await context.fetch(data);
    // console.log("ESIEval readableStream", readableStream);

    if (!readableStream) {
      // controller.error("No response");
      return;
    }

    // const textDecoderStream = new TextDecoderStream();
    let decoder = new TextDecoder();
    const textDecoderStream = new TransformStream({
      transform(chunk, controller) {
        // console.log("in decodeTransform", chunk);
        controller.enqueue(decoder.decode(chunk));
      },
    });

    const parserTransformer = new HtmlParser({ preserveWS: true });
    const parserTransformStream = new TransformStream(parserTransformer);

    const esiTransformer = new ESIBase(new ESIEvaluator(context.clone(true)));
    const esiTransformStream = new TransformStream(esiTransformer);

    const transformedStream = readableStream
      .pipeThrough(textDecoderStream)
      .pipeThrough(parserTransformStream)
      .pipeThrough(esiTransformStream);

    const reader = transformedStream.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      controller.enqueue(value);
    }
    // const chunks = [];
    // pipeline([
    //   context.fetch(data),
    //   new HTMLStream({ preserveWS: true }),
    //   new ESIBase(new ESIEvaluator(context.clone(true))),
    // ], (err) => {
    //   if (err) {
    //     if (err.inAttempt) return next();
    //     return next(err);
    //   }
    //   return context.writeToResult(chunks, controller);
    // }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIInclude extends ESITag {
  async open(data, controller) {
    // console.log('ESIInclude', data);
    const context = this.context;
    if (!context.shouldWrite()) return;

    const readableStream = await context.fetch(data);
    // console.log("ESIEval readableStream", readableStream);

    // const textDecoderStream = new TextDecoderStream();
    let decoder = new TextDecoder();
    const textDecoderStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(decoder.decode(chunk));
      },
    });

    const parserTransformer = new HtmlParser({ preserveWS: true });
    const parserTransformStream = new TransformStream(parserTransformer);

    const esiTransformer = new ESIBase(new ESIEvaluator(context.clone()));
    const esiTransformStream = new TransformStream(esiTransformer);

    const transformedStream = readableStream
      .pipeThrough(textDecoderStream)
      .pipeThrough(parserTransformStream)
      .pipeThrough(esiTransformStream);

    const reader = transformedStream.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      controller.enqueue(value);
    }
  //   const chunks = [];
  //   const streams = [
  //     context.fetch(data),
  //     new HTMLStream({ preserveWS: true }),
  //   ];
  //   if (data.dca === "esi") {
  //     streams.push(new ESIBase(new ESIEvaluator(context.clone())));
  //   }
  //   pipeline(streams, (err) => {
  //     if (err) {
  //       if (err.inAttempt) return;
  //       controller.error(err);
  //       return;
  //     }
  //     return context.writeToResult(chunks, controller);
  //   }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIForEach extends ESITag {
  open(data, controller) {
    const context = this.context;
    context.items = assign(data.collection, context);
    if (!Array.isArray(context.items)) {
      context.items = Object.entries(context.items);
    }
    context.itemVariableName = data.item || "item";

    context.foreachChunks = [];
    return;
  }
  async close(controller) {
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

    // console.log("buffered", buffered);
    const readableStream = new ReadableStream({
      pull(c) {
        buffered.forEach((chunk) => {
          c.enqueue(chunk);
        });
        c.close();
      },
    });

    const esiTransformer = new ESIBase(new ESIEvaluator(localContext));
    const esiTransformStream = new TransformStream(esiTransformer);

    const transformedStream = readableStream
      .pipeThrough(esiTransformStream);
    const reader = transformedStream.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value.name === "esi:break") {
        // console.log("esi break?");
        this.pause();
        // controller.enqueue(null);
        return;
      }
      controller.enqueue(value);
    }

    // pipeline([
    //   Readable.from(buffered),
    //   new ESIBase(new ESIEvaluator(localContext)),
    // ], (err) => {
    //   if (err) return next(err);
    //   return context.writeToResult(chunks, controller);
    // }).on("data", function onData(chunk) {
    //   if (chunk.name === "esi:break") {
    //     this.pause();
    //     return process.nextTick(() => this.push(null));
    //   }

    //   chunks.push(chunk);
    // });
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

class ESIEvaluator {
  constructor(context) {
    this.context = context;
  }
  onopentag(name, data, controller) {
    // console.log(`ESIEvaluator open ${name}`);
    // console.log("ESIEvaluator open enqueueing text onopentag");
    // controller.enqueue({ text: "onopentag" });
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ name, data });
      return;
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
          controller.error(err);
          return;
        }
      }
      if (esiFunc?.assertParent) {
        try {
          esiFunc.assertParent(parent);
        } catch (err) {
          controller.error(err);
          return;
        }
      }
      if (!wasInPlainText) return esiFunc.open(data, controller);
    }

    // console.log(`ESIEvaluator open writeToResult ${name}`);
    context.writeToResult({ name, data: this.makeAttributes(data) }, controller);
  }
  onclosetag(name, controller) {
    // console.log(`ESIEvaluator close ${name}`);
    const context = this.context;
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({ name });
      return;
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) return popped.close(controller);
        return;
      }
    }

    context.writeToResult({ name }, controller);
  }
  ontext(text, controller) {
    // console.log(`ESIEvaluator ontext ${text}`);

    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ text });
      return;
    }

    if (!context.isProcessing()) {
      return context.writeToResult({ text }, controller);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      return context.writeToResult((currentContext) => {
        const result = { text: replace(text, currentContext || context) };
        context.bufferingString = false;
        return result;
      }, controller); // handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return;
      } else {
        controller.error(err);
        return;
      }

      return;
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
}

module.exports = ESIEvaluator;
