"""The arithmetic behind the number theory plane (pipeline/numtheory.py), checked against
independent code written here: plain trial division, which shares nothing with the sieve.
"""

import math

import pytest

from pipeline.numtheory import (
    estimate,
    factorization_label,
    factorize,
    pi_table,
    primes_up_to,
    superscript,
)


def trial_division(n: int) -> list[int]:
    """The textbook method, deliberately naive."""
    out = []
    d = 2
    while d * d <= n:
        while n % d == 0:
            out.append(d)
            n //= d
        d += 1
    if n > 1:
        out.append(n)
    return out


def is_prime_by_division(n: int) -> bool:
    return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))


def test_factorize_matches_trial_division_up_to_100000():
    for n in range(1, 100_001):
        got = factorize(n)
        assert got == trial_division(n), n
        assert math.prod(got) == n
        assert got == sorted(got)


def test_factorize_of_one_is_empty_and_below_one_is_an_error():
    assert factorize(1) == []
    for bad in (0, -7):
        with pytest.raises(ValueError):
            factorize(bad)


def test_primes_up_to_100_are_the_25_primes():
    ps = primes_up_to(100)
    assert len(ps) == 25
    assert ps == [n for n in range(2, 101) if is_prime_by_division(n)]
    assert primes_up_to(1) == []
    assert primes_up_to(2) == [2]


def test_primes_up_to_10000_match_division():
    assert primes_up_to(10_000) == [n for n in range(2, 10_001) if is_prime_by_division(n)]


def test_pi_at_known_values():
    t = pi_table(10**6)
    assert [t[10**k] for k in range(2, 7)] == [25, 168, 1229, 9592, 78498]
    assert t[0] == 0 and t[1] == 0 and t[2] == 1


def test_pi_table_by_counting_primes_up_to_10000():
    t = pi_table(10_000)
    count = 0
    for n in range(10_001):
        count += is_prime_by_division(n)
        assert t[n] == count, n


def test_estimate_uses_the_natural_logarithm():
    assert estimate(10**6) == pytest.approx(10**6 / math.log(10**6))
    assert estimate(10**6) == pytest.approx(72382.41, abs=0.01)
    # A common slip is log10, which would give about 166667.
    assert estimate(10**6) < 100_000


def test_superscripts():
    assert superscript(2) == "²"
    assert superscript(6) == "⁶"
    assert superscript(10) == "¹⁰"


@pytest.mark.parametrize(
    "n,text",
    [
        (1, "1 has no prime factors"),
        (13, "13 is prime"),
        (12, "12 = 2² · 3"),
        (64, "64 = 2⁶"),
        (96, "96 = 2⁵ · 3"),
        (100, "100 = 2² · 5²"),
        (30, "30 = 2 · 3 · 5"),
    ],
)
def test_factorization_label(n, text):
    assert factorization_label(n) == text
