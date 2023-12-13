import ESIEvaluator from "./ESIEvaluator.js";
import ListenerContext from "./ListenerContext.js";
import ESIBase from "./ESIBase.js";

export default class ESI extends ESIBase {
  constructor(options) {
    const evaluator = new ESIEvaluator(new ListenerContext(options));
    super(evaluator);
    this.context.emitter = new EventTarget();
  }
}
