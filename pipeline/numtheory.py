"""The arithmetic behind the number theory plane: primes, factorizations, π(x).

Everything the plane shows about a number comes from here, never from a typed table.
pipeline/tests/test_numtheory.py checks it against plain trial division, which shares no code
with the sieves below.
"""

from __future__ import annotations

import math

SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def primes_up_to(n: int) -> list[int]:
    """The sieve of Eratosthenes."""
    if n < 2:
        return []
    flags = bytearray([1]) * (n + 1)
    flags[0] = flags[1] = 0
    for p in range(2, math.isqrt(n) + 1):
        if flags[p]:
            flags[p * p :: p] = bytes(len(range(p * p, n + 1, p)))
    return [i for i, f in enumerate(flags) if f]


def pi_table(n: int) -> list[int]:
    """t[x] = the number of primes at most x, for 0 <= x <= n."""
    out = [0] * (n + 1)
    seen = set(primes_up_to(n))
    count = 0
    for x in range(n + 1):
        count += x in seen
        out[x] = count
    return out


_spf_cache: list[int] = [0, 1]


def _smallest_prime_factors(n: int) -> list[int]:
    """spf[k] = the smallest prime factor of k (spf[1] = 1), grown on demand."""
    global _spf_cache
    if n < len(_spf_cache):
        return _spf_cache
    size = max(n, 2 * len(_spf_cache))
    spf = list(range(size + 1))
    for p in range(2, math.isqrt(size) + 1):
        if spf[p] == p:
            for m in range(p * p, size + 1, p):
                if spf[m] == m:
                    spf[m] = p
    _spf_cache = spf
    return spf


def factorize(n: int) -> list[int]:
    """The prime factors of n with multiplicity, smallest first. [] for 1."""
    if n < 1:
        raise ValueError(f"cannot factorize {n}")
    spf = _smallest_prime_factors(n)
    out = []
    while n > 1:
        p = spf[n]
        out.append(p)
        n //= p
    return out


def estimate(x: float) -> float:
    """x / ln x, the prime number theorem's approximation of π(x). Natural logarithm."""
    return x / math.log(x)


def superscript(n: int) -> str:
    return str(n).translate(SUPERSCRIPT)


def factorization_label(n: int) -> str:
    """"12 = 2² · 3". Computed, never typed."""
    fs = factorize(n)
    if not fs:
        return f"{n} has no prime factors"
    if len(fs) == 1:
        return f"{n} is prime"
    parts = []
    for p in sorted(set(fs)):
        k = fs.count(p)
        parts.append(f"{p}{superscript(k)}" if k > 1 else str(p))
    return f"{n} = " + " · ".join(parts)
