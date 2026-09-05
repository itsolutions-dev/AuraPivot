/**
 * Safe calculated-field formula evaluator.
 *
 * Replaces the previous `Function()` constructor approach: formulas are
 * tokenized, parsed into an AST and walked — no dynamic code generation, so
 * user-provided formula strings can never execute arbitrary JavaScript and
 * the library works under a CSP without `unsafe-eval`.
 *
 * Grammar (precedence low → high):
 *   or         := and  ( (OR  | '||') and  )*
 *   and        := eq   ( (AND | '&&') eq   )*
 *   eq         := rel  ( ('=='|'!='|'==='|'!==') rel )*
 *   rel        := add  ( ('<'|'>'|'<='|'>=') add )*
 *   add        := mul  ( ('+'|'-') mul )*
 *   mul        := unary ( ('*'|'/'|'%') unary )*
 *   unary      := ('-'|'+'|'!'|NOT) unary | power
 *   power      := primary ( ('^'|'**') unary )?        // right-associative
 *   primary    := number | ident | ident '(' args ')' | '(' or ')'
 *
 * Functions: IF(cond, then[, else]), ABS(x), MIN(...), MAX(...) —
 * case-insensitive, mirroring the buttons in CalculatedFieldDialog.
 * `^` and the legacy pre-replaced `**` both mean exponentiation; the AND/OR
 * keywords and the legacy `&&`/`||` symbols are interchangeable.
 *
 * Semantics intentionally mirror the old JS evaluation: AND/OR return an
 * operand (not a coerced boolean), `==`/`!=` compare loosely, division by
 * zero yields Infinity and 0/0 yields NaN — the caller maps non-finite
 * results to user-facing errors exactly as before.
 */

export interface FormulaEvalOptions {
  /**
   * Resolves a bare identifier to a numeric value (legacy "chip" references
   * already substituted by the caller normally make this unnecessary).
   * `null`/`undefined` results coerce to 0, matching the old substitution
   * behavior. When the option itself is absent, identifiers are an error.
   */
  resolveIdentifier?: (name: string) => number | null | undefined;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma';

interface Token {
  type: TokenType;
  value: string;
}

const MULTI_CHAR_OPS = ['===', '!==', '**', '==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '^', '<', '>', '!']);
const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
      i += 1;
      continue;
    }
    const rest = src.slice(i);
    const num = NUM_RE.exec(rest);
    if (num) {
      tokens.push({ type: 'num', value: num[0] });
      i += num[0].length;
      continue;
    }
    const ident = IDENT_RE.exec(rest);
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0] });
      i += ident[0].length;
      continue;
    }
    const multi = MULTI_CHAR_OPS.find((op) => rest.startsWith(op));
    if (multi) {
      tokens.push({ type: 'op', value: multi });
      i += multi.length;
      continue;
    }
    if (SINGLE_CHAR_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' in formula`);
  }
  return tokens;
};

// ---------------------------------------------------------------------------
// Parser (recursive descent → AST)
// ---------------------------------------------------------------------------

type AstNode =
  | { type: 'num'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'call'; name: string; args: AstNode[] }
  | { type: 'unary'; op: string; operand: AstNode }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode }
  | { type: 'logical'; op: 'and' | 'or'; left: AstNode; right: AstNode };

const KNOWN_FUNCTIONS: Record<string, { minArgs: number; maxArgs: number }> = {
  if: { minArgs: 2, maxArgs: 3 },
  abs: { minArgs: 1, maxArgs: 1 },
  min: { minArgs: 1, maxArgs: Infinity },
  max: { minArgs: 1, maxArgs: Infinity },
};

const parse = (src: string): AstNode => {
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new Error('Empty formula');
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos];
    if (!t) throw new Error('Unexpected end of formula');
    pos += 1;
    return t;
  };
  const isOp = (t: Token | undefined, ...ops: string[]): boolean =>
    !!t && t.type === 'op' && ops.includes(t.value);
  const isKeyword = (t: Token | undefined, word: string): boolean =>
    !!t && t.type === 'ident' && t.value.toLowerCase() === word;

  const parseOr = (): AstNode => {
    let left = parseAnd();
    while (isOp(peek(), '||') || isKeyword(peek(), 'or')) {
      next();
      left = { type: 'logical', op: 'or', left, right: parseAnd() };
    }
    return left;
  };

  const parseAnd = (): AstNode => {
    let left = parseEquality();
    while (isOp(peek(), '&&') || isKeyword(peek(), 'and')) {
      next();
      left = { type: 'logical', op: 'and', left, right: parseEquality() };
    }
    return left;
  };

  const parseEquality = (): AstNode => {
    let left = parseRelational();
    while (isOp(peek(), '==', '!=', '===', '!==')) {
      const op = next().value;
      left = { type: 'binary', op, left, right: parseRelational() };
    }
    return left;
  };

  const parseRelational = (): AstNode => {
    let left = parseAdditive();
    while (isOp(peek(), '<', '>', '<=', '>=')) {
      const op = next().value;
      left = { type: 'binary', op, left, right: parseAdditive() };
    }
    return left;
  };

  const parseAdditive = (): AstNode => {
    let left = parseMultiplicative();
    while (isOp(peek(), '+', '-')) {
      const op = next().value;
      left = { type: 'binary', op, left, right: parseMultiplicative() };
    }
    return left;
  };

  const parseMultiplicative = (): AstNode => {
    let left = parseUnary();
    while (isOp(peek(), '*', '/', '%')) {
      const op = next().value;
      left = { type: 'binary', op, left, right: parseUnary() };
    }
    return left;
  };

  const parseUnary = (): AstNode => {
    if (isOp(peek(), '-', '+', '!')) {
      const op = next().value;
      return { type: 'unary', op, operand: parseUnary() };
    }
    if (isKeyword(peek(), 'not')) {
      next();
      return { type: 'unary', op: '!', operand: parseUnary() };
    }
    return parsePower();
  };

  const parsePower = (): AstNode => {
    const base = parsePrimary();
    if (isOp(peek(), '^', '**')) {
      next();
      // Right-associative; the exponent may carry its own unary sign.
      return { type: 'binary', op: '^', left: base, right: parseUnary() };
    }
    return base;
  };

  const parsePrimary = (): AstNode => {
    const t = next();
    if (t.type === 'num') return { type: 'num', value: Number(t.value) };
    if (t.type === 'lparen') {
      const inner = parseOr();
      const closing = next();
      if (closing.type !== 'rparen') {
        throw new Error("Expected ')' in formula");
      }
      return inner;
    }
    if (t.type === 'ident') {
      if (peek()?.type === 'lparen') {
        next(); // consume '('
        const name = t.value.toLowerCase();
        const spec = KNOWN_FUNCTIONS[name];
        if (!spec) throw new Error(`Unknown function '${t.value}'`);
        const args: AstNode[] = [];
        if (peek()?.type !== 'rparen') {
          args.push(parseOr());
          while (peek()?.type === 'comma') {
            next();
            args.push(parseOr());
          }
        }
        const closing = next();
        if (closing.type !== 'rparen') {
          throw new Error(`Expected ')' after ${t.value}(…) arguments`);
        }
        if (args.length < spec.minArgs || args.length > spec.maxArgs) {
          throw new Error(
            `${t.value.toUpperCase()}() expects ${
              spec.minArgs === spec.maxArgs
                ? spec.minArgs
                : `${spec.minArgs}–${
                    spec.maxArgs === Infinity ? 'n' : spec.maxArgs
                  }`
            } argument(s), got ${args.length}`,
          );
        }
        return { type: 'call', name, args };
      }
      return { type: 'ident', name: t.value };
    }
    throw new Error(`Unexpected token '${t.value}' in formula`);
  };

  const ast = parseOr();
  const trailing = peek();
  if (trailing) {
    throw new Error(`Unexpected token '${trailing.value}' in formula`);
  }
  return ast;
};

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

const evalNode = (node: AstNode, opts: FormulaEvalOptions): unknown => {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'ident': {
      const resolve = opts.resolveIdentifier;
      if (typeof resolve !== 'function') {
        throw new Error(`Unknown identifier '${node.name}' in formula`);
      }
      const v = resolve(node.name);
      return v === null || v === undefined ? 0 : Number(v);
    }
    case 'unary': {
      const v = evalNode(node.operand, opts);
      if (node.op === '-') return -(v as number);
      if (node.op === '+') return +(v as number);
      return !v;
    }
    case 'logical': {
      const left = evalNode(node.left, opts);
      // Operand-returning short-circuit, matching the old JS && / || output.
      if (node.op === 'and') return left ? evalNode(node.right, opts) : left;
      return left ? left : evalNode(node.right, opts);
    }
    case 'binary': {
      const l = evalNode(node.left, opts) as number;
      const r = evalNode(node.right, opts) as number;
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '%':
          return l % r;
        case '^':
          return l ** r;
        case '<':
          return l < r;
        case '>':
          return l > r;
        case '<=':
          return l <= r;
        case '>=':
          return l >= r;
        case '==':
          return l == r;
        case '!=':
          return l != r;
        case '===':
          return l === r;
        case '!==':
          return l !== r;
        default:
          throw new Error(`Unsupported operator '${node.op}'`);
      }
    }
    case 'call': {
      if (node.name === 'if') {
        const cond = evalNode(node.args[0], opts);
        if (cond) return evalNode(node.args[1], opts);
        return node.args.length > 2 ? evalNode(node.args[2], opts) : undefined;
      }
      const args = node.args.map((a) => Number(evalNode(a, opts)));
      if (node.name === 'abs') return Math.abs(args[0]);
      if (node.name === 'min') return Math.min(...args);
      if (node.name === 'max') return Math.max(...args);
      throw new Error(`Unknown function '${node.name}'`);
    }
    default:
      throw new Error('Invalid formula node');
  }
};

/**
 * Parses and evaluates a formula expression. Throws on syntax errors and on
 * unknown identifiers or functions; the caller is expected to catch and
 * surface the message.
 */
export const evaluateFormulaExpression = (
  src: string,
  opts: FormulaEvalOptions = {},
): unknown => evalNode(parse(src), opts);

/**
 * Syntax-only validation: parses the expression, tolerating bare identifiers
 * (unsubstituted field references). Throws with a descriptive message when
 * the formula is malformed.
 */
export const parseFormulaExpression = (src: string): void => {
  parse(src);
};
