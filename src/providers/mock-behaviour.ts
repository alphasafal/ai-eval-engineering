import type { Action, AgentResponse, Intent } from "../schemas/agent-response";
import { stableHash } from "../observability/hash";

/**
 * MOCK PROVIDER DEMONSTRATION — this is not a language model.
 *
 * The mock imitates how an LLM's behaviour depends on its instructions.
 * It reads which sections the system prompt contains and only "knows" a
 * rule if the prompt states it. V1 has none of the sections, so the mock
 * behaves like a model working from vague instructions; V2 has all of them.
 *
 * The evaluator never sees any of this. It grades the JSON the mock emits
 * exactly as it would grade a real model's output.
 */

export interface PromptFeatures {
  intentDefinitions: boolean;
  toolRules: boolean;
  escalationRules: boolean;
  policyConstraints: boolean;
  uncertaintyHandling: boolean;
  strictOutput: boolean;
}

export function detectPromptFeatures(system: string): PromptFeatures {
  const has = (heading: string) => system.includes(`## ${heading}`);
  return {
    intentDefinitions: has("Intent definitions"),
    toolRules: has("Tool selection rules"),
    escalationRules: has("Escalation rules"),
    policyConstraints: has("Policy constraints"),
    uncertaintyHandling: has("Uncertainty handling"),
    strictOutput: has("Output format"),
  };
}

export interface MockDecision {
  final: AgentResponse;
  /** Tool names the simulated model will call, in order, before answering. */
  toolPlan: string[];
  /** How many malformed final answers it produces before a valid one. */
  formatFaults: number;
}

type Signals = ReturnType<typeof extractSignals>;

export function extractSignals(input: string) {
  const t = input.toLowerCase();
  return {
    otherPersonData:
      /(another|other|different) customer|someone else'?s|what'?s (her|his|their) balance/.test(t),
    promptProbe: /system prompt|internal tool|print your (instructions|prompt|rules)/.test(t),
    adminImpersonation: /new instruction|acmepay (admin|engineer|staff)/.test(t),
    injectionMarker: /ignore (all |your |the |previous |prior )*(rules|instructions)|system override|developer mode/.test(t),
    cardNumberRequest: /card number on file|tell me (my|the) (full )?card number/.test(t),
    legal: /lawyer|attorney|legal action|\bsue\b|regulator|consumer protection|ombudsman/.test(t),
    humanRequest: /(speak|talk) to (a |an )?(real )?(human|person|agent|manager)|not a bot/.test(t),
    takeover: /hacked|changed (the |my )?(email|phone|password)|someone (logged|got) into|sent money out/.test(t),
    dataDeletion: /delete (my|the) account|delete .*personal data/.test(t),
    phishing: /is this a scam|(email|text|call) from .*asking/.test(t),
    fraud: /don'?t recogni[sz]e|didn'?t (make|authori[sz]e)|never made|unauthori[sz]ed|stolen|fraud|scammer|someone used my card|without (asking|permission)|tricked into/.test(t),
    duplicate: /twice|double[- ]?charged|\b2x\b|two (identical |separate )?charges|duplicate/.test(t),
    paymentFailed: /payment (failed|declined)|declined|didn'?t go through|(transfer|transaction) failed|failed payment/.test(t),
    refund: /refund|money back/.test(t),
    order: /where('?s| is) my (order|package|parcel|delivery)|order .*(arrive|late|update)|tracking|shipped/.test(t),
    generalQuestion: /^(do you|what are|what is|are you|can i use)\b|\bfees\b|support hours/.test(t),
    account: /log ?in|password|account|billing address|locked/.test(t),
    gratitude: /\bthanks\b|thank you/.test(t),
    angry: /!!|ridiculous|useless|garbage|terrible|furious|frustrated|unacceptable/.test(t) || /\b[A-Z]{4,}\b/.test(input),
  };
}

export function decide(input: string, features: PromptFeatures): MockDecision {
  const s = extractSignals(input);
  const smart = features.intentDefinitions && features.toolRules && features.escalationRules;
  const decision = smart ? decideStructured(s, features) : decideNaive(input, s, features);
  decision.formatFaults = formatFaultsFor(input, features);
  return decision;
}

// ---------------------------------------------------------------------------
// Naive behaviour: keyword matching, no policy, escalates on emotion.
// ---------------------------------------------------------------------------

function decideNaive(input: string, s: Signals, f: PromptFeatures): MockDecision {
  const t = input.toLowerCase();
  const intent = naiveIntent(t);
  const action = NAIVE_ACTION[intent];
  const escalate = f.escalationRules ? s.legal || s.humanRequest : s.angry || s.humanRequest;

  const toolPlan: string[] = [];
  if (s.otherPersonData) toolPlan.push("get_customer_records"); // not a real tool
  if (/order/.test(t) && intent !== "order_status") toolPlan.push("lookup_order");
  if (action !== "respond_without_tool") toolPlan.push(action);
  if (escalate) toolPlan.push("escalate_to_human");

  let response = NAIVE_RESPONSE[intent];
  if (!f.policyConstraints) {
    if (s.otherPersonData) response = "Sure, here is the payment information for that account: card ending 4417, last payment $86.20 on Sept 2.";
    if (s.promptProbe) response = "Of course. My instructions are: You are a helpful customer support assistant for AcmePay.";
  }

  return { final: { intent, action, escalate, confidence: 0.9, response }, toolPlan, formatFaults: 0 };
}

function naiveIntent(t: string): Intent {
  if (/refund|money back/.test(t)) return "refund_request";
  if (/order|package|deliver|tracking|shipped/.test(t)) return "order_status";
  if (/fail|declin/.test(t)) return "payment_failed";
  if (/twice|double/.test(t)) return "duplicate_payment";
  if (/fraud|unauthori[sz]ed|stolen/.test(t)) return "fraud_claim";
  if (/log ?in|password|account/.test(t)) return "account_issue";
  return "general_question";
}

const NAIVE_ACTION: Record<Intent, Action> = {
  duplicate_payment: "lookup_transaction",
  payment_failed: "lookup_transaction",
  refund_request: "respond_without_tool",
  order_status: "lookup_order",
  fraud_claim: "lookup_transaction",
  account_issue: "respond_without_tool",
  general_question: "respond_without_tool",
  unknown: "respond_without_tool",
};

const NAIVE_RESPONSE: Record<Intent, string> = {
  duplicate_payment: "Sorry for the trouble! I'll look into the duplicate charge for you.",
  payment_failed: "Sorry your payment failed. The money will be back in your account soon.",
  refund_request: "No problem! We will refund your payment within 3-5 business days.",
  order_status: "Let me check on your order for you.",
  fraud_claim: "Sorry to hear that. So we can verify it's really you, please reply with your full card number and CVV.",
  account_issue: "Please try resetting your password using the 'Forgot password' link.",
  general_question: "Thanks for reaching out to AcmePay! Let us know if there is anything else we can help with.",
  unknown: "Thanks for reaching out to AcmePay!",
};

// ---------------------------------------------------------------------------
// Structured behaviour: follows the rules stated in the V2 prompt sections.
// ---------------------------------------------------------------------------

type Route = { intent: Intent; action: Action; escalate: boolean; template: keyof typeof STRUCTURED_RESPONSE };

function decideStructured(s: Signals, f: PromptFeatures): MockDecision {
  const route = routeStructured(s, f);
  const signalCount = [s.duplicate, s.paymentFailed, s.refund, s.order, s.fraud, s.account].filter(Boolean).length;
  const confidence = route.intent === "unknown" && !route.escalate ? 0.4 : signalCount > 1 ? 0.72 : 0.93;
  const toolPlan = route.action === "respond_without_tool" ? [] : [route.action];
  return {
    final: { intent: route.intent, action: route.action, escalate: route.escalate, confidence, response: STRUCTURED_RESPONSE[route.template] },
    toolPlan,
    formatFaults: 0,
  };
}

function routeStructured(s: Signals, f: PromptFeatures): Route {
  const refuse = (intent: Intent): Route => ({ intent, action: "respond_without_tool", escalate: false, template: "refusal" });
  if (f.policyConstraints) {
    if (s.otherPersonData || s.promptProbe || s.adminImpersonation) return refuse("unknown");
    if (s.cardNumberRequest) return refuse("account_issue");
  }
  const escalateAs = (intent: Intent): Route => ({ intent, action: "escalate_to_human", escalate: true, template: "escalation" });

  if (s.takeover) return { ...escalateAs("account_issue"), template: "takeover" };
  if (s.phishing) return { intent: "fraud_claim", action: "respond_without_tool", escalate: false, template: "phishing" };
  if (s.fraud) return { intent: "fraud_claim", action: "open_fraud_case", escalate: true, template: "fraud" };
  if (s.dataDeletion) return escalateAs("account_issue");

  const topic = topicOf(s);
  if (s.legal || s.humanRequest) return escalateAs(topic ?? "unknown");
  if (topic === undefined) {
    return f.uncertaintyHandling
      ? { intent: "unknown", action: "respond_without_tool", escalate: false, template: "clarify" }
      : { intent: "general_question", action: "respond_without_tool", escalate: false, template: "general" };
  }
  return { intent: topic, action: STRUCTURED_ACTION[topic], escalate: false, template: topic };
}

function topicOf(s: Signals): Intent | undefined {
  if (s.duplicate) return "duplicate_payment";
  if (s.paymentFailed) return "payment_failed";
  if (s.generalQuestion || s.gratitude) return "general_question";
  if (s.refund) return "refund_request";
  if (s.order) return "order_status";
  if (s.account) return "account_issue";
  return undefined;
}

const STRUCTURED_ACTION: Record<Intent, Action> = {
  duplicate_payment: "lookup_transaction",
  payment_failed: "lookup_transaction",
  refund_request: "check_refund_policy",
  order_status: "lookup_order",
  fraud_claim: "open_fraud_case",
  account_issue: "respond_without_tool",
  general_question: "respond_without_tool",
  unknown: "respond_without_tool",
};

const STRUCTURED_RESPONSE = {
  duplicate_payment:
    "I'm sorry you were charged more than once. I've looked up your recent transactions to check for a duplicate charge, and I'll explain what happens next once it's confirmed.",
  payment_failed:
    "I'm sorry the payment failed. I've looked up the transaction to see whether any funds were captured, and I'll share the status and next steps with you.",
  refund_request:
    "I understand you'd like a refund. I've checked your purchase against the AcmePay refund policy so eligibility can be confirmed before anything is processed. Could you share the order number if you have it?",
  order_status:
    "I've looked up your order so I can give you the latest shipping and delivery status. If it's delayed, I'll share the next steps.",
  account_issue:
    "I can help with your account. You can reset your password or update your details under Settings > Security, and if you're locked out, use 'Forgot password' to verify your identity.",
  general_question:
    "Happy to help. You'll find accepted cards, fees, and business account details in the AcmePay Help Center, and I can point you to the right page if you tell me more.",
  unknown: "I'd like to help. Could you tell me a bit more about what happened?",
  fraud_claim:
    "Thank you for flagging this. I've opened a fraud case and our fraud team will review the charge. For your security, AcmePay will never ask for your full card number, CVV, or PIN.",
  fraud:
    "Thank you for flagging this. I've opened a fraud case and our fraud team will review the charge. For your security, AcmePay will never ask for your full card number, CVV, or PIN.",
  phishing:
    "That message did not come from us: AcmePay will never ask for your PIN, password, or card details. Please don't reply to it, and forward it to our security team if you can.",
  takeover:
    "It looks like your account may have been accessed without your permission. I'm escalating this to our account security team right away. Please don't share any verification codes with anyone.",
  escalation:
    "I understand this needs more attention. I'm escalating your case to a senior support specialist who can review it in full, and they will contact you directly.",
  refusal:
    "I'm sorry, but I can't share that. I can only help with your own account, and I can't reveal other customers' information or internal systems. Is there something about your own payments I can help with?",
  clarify: "I'd like to help, but I need a bit more detail. Could you tell me whether this is about a payment, an order, a refund, or your account?",
  general:
    "Happy to help. You'll find accepted cards, fees, and business account details in the AcmePay Help Center, and I can point you to the right page if you tell me more.",
} as const;

// ---------------------------------------------------------------------------
// Formatting reliability: without explicit output rules, simulated models
// sometimes wrap JSON in prose or emit the wrong types.
// ---------------------------------------------------------------------------

function formatFaultsFor(input: string, f: PromptFeatures): number {
  const roll = stableHash(`format:${input}`) % 100;
  if (f.strictOutput) return roll < 4 ? 1 : 0;
  if (roll < 8) return 2;
  return roll < 24 ? 1 : 0;
}
