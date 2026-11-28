import { describe, expect, it } from 'vitest';

import { applyVerdicts, screen, writePlace, writeTrivia } from '../bank/write';
import { fakeFetch, fixture } from '../testing';
import { fakeLlm } from './fake';
import { geminiLlm, parseJsonReply } from './gemini';
import { costUsd, priceAt } from './pricing';

const recorded = fixture('gemini-write');
const models = { writer: 'gemini-3.8-flash', checker: 'gemini-4-argon' };

describe('Gemini', () => {
  it('asks for JSON against a schema, with the key in a header, and reads the recorded reply', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const llm = geminiLlm('test-key', fakeFetch([{ match: () => true, body: recorded }], calls));
    const res = await llm.json<{ questions: { question: string }[] }>({
      model: 'gemini-3.8-flash',
      system: 'sys',
      prompt: 'Write 3 questions',
      schema: { type: 'object' },
      thinking: 'low',
    });
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    expect((calls[0]!.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(calls[0]!.init!.body as string);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(res.data.questions).toHaveLength(3);
    expect(res.usage.model).toBe('gemini-3.8-flash');
    expect(res.usage.inputTokens).toBeGreaterThan(100);
    expect(res.usage.outputTokens).toBeGreaterThan(100);
  });

  it('waits and tries again after a 429 with a retry delay', async () => {
    let n = 0;
    const llm = geminiLlm('k', async () => {
      n++;
      return n === 1
        ? new Response(JSON.stringify({ error: { details: [{ retryDelay: '0.01s' }] } }), {
            status: 429,
          })
        : new Response(JSON.stringify(recorded), { status: 200 });
    });
    const res = await llm.json({ model: 'm', system: '', prompt: '', schema: {} });
    expect(n).toBe(2);
    expect(res.data).toBeTruthy();
  });

  it('fails clearly on a blocked or empty answer, and on a bad request', async () => {
    const empty = geminiLlm(
      'k',
      fakeFetch([{ match: () => true, body: { promptFeedback: { blockReason: 'SAFETY' } } }]),
    );
    await expect(empty.json({ model: 'm', system: '', prompt: '', schema: {} })).rejects.toThrow(
      'No answer (SAFETY)',
    );
    const bad = geminiLlm('k', fakeFetch([{ match: () => true, status: 400, body: {} }]));
    await expect(bad.json({ model: 'm', system: '', prompt: '', schema: {} })).rejects.toThrow(
      'HTTP 400',
    );
  });

  it('reads JSON inside a code fence', () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonReply('nope')).toThrow('Not JSON');
  });
});

describe('prices', () => {
  it('follows the announced price changes', () => {
    const before = Date.parse('2026-11-27T12:00:00Z');
    const after = Date.parse('2026-12-02T12:00:00Z');
    expect(priceAt('gemini-4-argon', before)).toMatchObject({ inputPerM: 2, outputPerM: 10 });
    expect(priceAt('gemini-4-argon', after)).toMatchObject({ inputPerM: 4, outputPerM: 20 });
    expect(priceAt('gemini-3.8-flash', Date.parse('2027-02-01'))).toMatchObject({ inputPerM: 1.5 });
    expect(() => priceAt('unknown-model', before)).toThrow('No price');
  });

  it('bills thinking as output', () => {
    const u = {
      model: 'gemini-3.8-flash',
      inputTokens: 1e6,
      outputTokens: 5e5,
      thinkingTokens: 5e5,
    };
    expect(costUsd(u, Date.parse('2026-11-27'))).toBeCloseTo(0.75 + 3.75, 6);
  });
});

describe('writing and checking', () => {
  const good = {
    question: 'Which bird can fly backwards?',
    correct: 'Hummingbird',
    wrong: ['Robin', 'Sparrow', 'Owl'],
    explanation: 'Its wings let it.',
  };

  it('drops malformed questions and repeats before the check', () => {
    const { ok, dropped } = screen(
      [good, { ...good }, { ...good, question: 'Who is currently king?' }, { ...good, wrong: [] }],
      [],
    );
    expect(ok).toHaveLength(1);
    expect(dropped.map((d) => d.reason)).toEqual([
      'repeat',
      'time-bound fact',
      'needs three wrong answers',
    ]);
    expect(screen([good], [{ question: good.question, correct: 'x' }]).ok).toHaveLength(0);
  });

  it('keeps only questions with an explicit pass', () => {
    const qs = [good, { ...good, question: 'B?' }, { ...good, question: 'C?' }];
    const res = applyVerdicts(qs, {
      verdicts: [
        { index: 0, pass: true },
        { index: 1, pass: false, reason: 'wrong year' },
      ],
    });
    expect(res.kept).toEqual([good]);
    expect(res.dropped.map((d) => d.reason)).toEqual(['check: wrong year', 'check: no verdict']);
  });

  it('writes with the writer, checks with the checker, and tells it the pool’s answers', async () => {
    const llm = fakeLlm();
    const res = await writeTrivia(
      llm,
      models,
      { category: 'nature', subcategory: 'birds', difficulty: 'kids' },
      10,
      [{ question: 'Old?', correct: 'Penguin' }],
    );
    expect(llm.calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-4-argon']);
    expect(llm.calls[0]!.prompt).toContain('- Penguin');
    expect(llm.calls[0]!.prompt).toContain('children aged 8 to 12');
    expect(res.kept).toHaveLength(8);
    expect(res.dropped).toHaveLength(2);
    expect(res.usage).toHaveLength(2);
  });

  it('writes place questions only from the article, with a difficulty each', async () => {
    const llm = fakeLlm();
    const res = await writePlace(llm, models, { name: 'Nyhavn', text: 'A canal.', lang: 'da' }, 5);
    expect(llm.calls[0]!.prompt).toContain('Use only facts stated in the Wikipedia article');
    expect(llm.calls[0]!.prompt).toContain('write the questions in English');
    expect(llm.calls[1]!.prompt).toContain('A canal.');
    expect(res.kept.length).toBe(4);
    expect(res.kept.every((q) => q.difficulty)).toBe(true);
  });
});
