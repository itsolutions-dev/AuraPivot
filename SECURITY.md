# Security policy

## Reporting a vulnerability

Report privately through GitHub's [security advisory
form](https://github.com/itsolutions-dev/AuraPivot/security/advisories/new).
Do not open a public issue.

Expect an acknowledgement within three working days and an assessment
within ten.

## Scope

The parts of this library that process untrusted input are the places a
vulnerability is most likely to live:

- **`pivot-core/matrix/FormulaEvaluator.ts`** evaluates calculated-field
  formulas. It is a hand-written tokenizer and AST walker specifically to
  avoid `Function()` and `eval`. A formula that escapes the evaluator, reads
  outside its scope, or causes unbounded computation is in scope.
- **`components/Toolbar/sanitizeSvg.ts`** sanitizes caller-supplied SVG for
  custom toolbar icons. Markup that survives sanitization and executes is in
  scope.
- **Dataset handling.** Field names and cell values come from the host
  application's data and are rendered as text; anything that escapes into
  markup is in scope.

## Supported versions

The latest minor release receives security fixes.
