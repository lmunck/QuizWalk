import { describe, expect, it } from 'vitest';
import { MAX_STOPS, stopProblems, walkProblems } from './problems';

const good = (id: string, order: number) => ({
  id,
  order,
  question: 'When was the canal dug?',
  options: ['1670s', '1770s', '1870s'],
  correctIndex: 0,
});

describe('walkProblems', () => {
  it('passes a complete walk', () => {
    const p = walkProblems({ title: 'Harbour' }, [good('a', 0), good('b', 1)]);
    expect(p.blocking).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  it('needs a title and at least one stop', () => {
    const p = walkProblems({ title: '  ' }, []);
    expect(p.blocking.map((x) => x.code)).toEqual(['noTitle', 'noStops']);
    expect(p.blocking[1]?.message).toBe('Add at least one stop');
  });

  it('caps the number of stops', () => {
    const stops = Array.from({ length: MAX_STOPS + 1 }, (_, i) => good(`s${i}`, i));
    expect(walkProblems({ title: 'x' }, stops).blocking.map((x) => x.code)).toEqual([
      'tooManyStops',
    ]);
  });

  it('numbers stops by play order, not by array order', () => {
    const p = walkProblems({ title: 'x' }, [
      { ...good('late', 5), question: '' },
      good('early', 1),
    ]);
    expect(p.blocking).toEqual([
      { code: 'noQuestion', stopId: 'late', stopNumber: 2, message: 'Stop 2 needs a question' },
    ]);
  });

  it('turns stop warnings into quiet notes', () => {
    const p = walkProblems({ title: 'x' }, [{ ...good('a', 0), warnings: ['unverified'] }]);
    expect(p.blocking).toEqual([]);
    expect(p.warnings[0]?.message).toBe('Check this answer');
  });
});

describe('stopProblems', () => {
  it('needs a question', () => {
    expect(stopProblems({ ...good('a', 0), question: ' ' }, 3).blocking[0]?.message).toBe(
      'Stop 3 needs a question',
    );
  });

  it('needs at least two filled answers', () => {
    const codes = stopProblems({ ...good('a', 0), options: ['Yes', ' '] }, 1).blocking.map(
      (x) => x.code,
    );
    expect(codes).toContain('tooFewOptions');
  });

  it('flags an empty answer row among enough filled ones', () => {
    const codes = stopProblems({ ...good('a', 0), options: ['A', 'B', ''] }, 1).blocking.map(
      (x) => x.code,
    );
    expect(codes).toEqual(['emptyOption']);
  });

  it('caps answers at four', () => {
    const codes = stopProblems(
      { ...good('a', 0), options: ['A', 'B', 'C', 'D', 'E'] },
      1,
    ).blocking.map((x) => x.code);
    expect(codes).toEqual(['tooManyOptions']);
  });

  it('needs a correct answer that points at a filled option', () => {
    expect(
      stopProblems({ ...good('a', 0), correctIndex: -1 }, 1).blocking.map((x) => x.code),
    ).toEqual(['noCorrect']);
    expect(
      stopProblems({ ...good('a', 0), correctIndex: 3 }, 1).blocking.map((x) => x.code),
    ).toEqual(['noCorrect']);
  });
});
