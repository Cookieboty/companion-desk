import { appleScriptQuote, psQuote } from '../../../src/security/shellEscape';

describe('shellEscape', () => {
  it('psQuote 双写单引号，阻断引号逃逸', () => {
    expect(psQuote("a'b")).toBe("'a''b'");
    // 典型 PowerShell 注入载荷
    expect(psQuote("x'); Remove-Item C:\\ -Recurse; $y='")).toBe(
      "'x''); Remove-Item C:\\ -Recurse; $y='''",
    );
  });

  it('psQuote 结果始终被单引号包裹', () => {
    const q = psQuote('any $var `cmd`');
    expect(q.startsWith("'") && q.endsWith("'")).toBe(true);
  });

  it('appleScriptQuote 转义反斜杠 / 双引号 / 换行', () => {
    expect(appleScriptQuote('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(appleScriptQuote('line1\nline2')).toBe('"line1\\nline2"');
    expect(appleScriptQuote('tab\there')).toBe('"tab\\there"');
  });

  it('appleScriptQuote 阻断双引号逃逸', () => {
    const q = appleScriptQuote('x" do shell script "id');
    // 去掉被反斜杠转义的引号后，只剩首尾两个包裹引号
    const unescaped = q.replace(/\\"/g, '').match(/"/g);
    expect(unescaped).toEqual(['"', '"']);
  });
});
