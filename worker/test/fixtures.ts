import type { GroundingFile, TrurlRequest } from '../../core/schema';

/** A small grounding in the shape pipeline/grounding.py writes. 1arith has a reviewed display and note; df-prm has neither. */
export function grounding(): GroundingFile {
  return {
    schema_version: 1,
    planes: { 'number-theory': 'Number theory', logic: 'Logic', 'algebra-symmetry': 'Algebra and symmetry' },
    landmarks: {
      '1arith': {
        name: 'Fundamental theorem of arithmetic',
        kind: 'theorem',
        statement: 'M : \\mathbb{N} \\to R',
        source: '|- M : NN -1-1-onto-> R',
        comment: 'The function M maps the set of positive integers one-to-one onto the set of prime factorizations R.',
        display: 'Every positive integer is a product of primes in exactly one way.',
        note: 'Think of each number as a recipe of primes; the recipe is unique.',
      },
      'df-prm': {
        name: 'Definition of a prime number',
        kind: 'definition',
        statement: '\\mathbb{P} = \\{ p \\in \\mathbb{N} | \\{ n \\in \\mathbb{N} | n \\parallel p \\} \\approx 2_o \\}',
        source: '|- Prime = { p e. NN | { n e. NN | n || p } ~~ 2o }',
        comment: 'Define the set of prime numbers.',
      },
    },
    moments: {
      'nt-1-road': {
        plane: 'number-theory',
        stretch: 'nt-1',
        kind: 'road',
        landmarks: ['df-prm', '1arith'],
        earns: ['1arith'],
        question: 'Could any number be taken apart into primes in two different ways, not counting order?',
        rubric: 'The visitor says every whole number above 1 splits into primes in exactly one way.',
        rubric_reviewed: false,
      },
      'nt-1-sieve': {
        plane: 'number-theory',
        stretch: 'nt-1',
        kind: 'sieve',
        landmarks: ['df-prm', '1arith'],
        earns: ['df-prm'],
        question: 'Look at the numbers left standing. What do they have in common?',
        rubric: 'The visitor says a prime has only 1 and itself as divisors, and nothing falls after 7 because of the square root of 100.',
        rubric_reviewed: false,
      },
    },
  };
}

/** The facts of a visit in which the activity was done (core/doing.ts), and of one in which it was not */
export const DID_THE_SIEVE = { predicted: [], struck: [2, 3, 5, 7], stopped: true };
export const DID_THE_ROAD = { predicted: [12, 18, 8], struck: [], stopped: false };
export const DID_NOTHING = { predicted: [], struck: [], stopped: false };

/** By default a request for the sieve moment from a visitor who has done the sieve */
export function request(over: Partial<TrurlRequest> = {}): TrurlRequest {
  return {
    schema_version: 2,
    plane: 'number-theory',
    stretch: 'nt-1',
    moment: 'nt-1-sieve',
    landmark: 'df-prm',
    looking_at: 'plaza:97',
    earned: [],
    doing: DID_THE_SIEVE,
    dialogue: [],
    utterance: 'why did nothing fall after seven?',
    ...over,
  };
}
