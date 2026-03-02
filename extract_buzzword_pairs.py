import json
import re
from pathlib import Path


SOURCE_TXT = Path(__file__).with_name("georgia-tech-strategic-plan-2020-2030.txt")
OUT_JSON = Path(__file__).with_name("buzzword_pairs.json")


PAIRS = [
    ("Diversity", "women"),
    ("Diversity", "racial minorities"),
    ("Access", "low-income students"),
    ("Access", "rural communities"),
    ("Inclusive", "underrepresented groups"),
    ("Innovation", "sustainability"),
    ("Global", "international"),
    ("Leadership", "humanities"),
    ("Entrepreneurship", "minority entrepreneurs"),
    ("Well-being", "mental health"),
]


PATTERNS: dict[str, str] = {
    "Diversity": r"\bdiversity\b",
    "women": r"\bwomen\b",
    # Allow "racial and ethnic minorities" as well as "racial minorities"
    "racial minorities": r"\bracial(?:\s+and\s+ethnic)?\s+minorit(?:y|ies)\b",
    "Access": r"\baccess\b",
    "low-income students": r"\blow[-\s]income\s+students?\b",
    "rural communities": r"\brural\s+communities\b",
    "Inclusive": r"\binclusive\b",
    "underrepresented groups": r"\bunderrepresented\s+groups\b",
    "Innovation": r"\binnovation\b",
    "sustainability": r"\bsustainability\b|\bsustainable\b",
    "Global": r"\bglobal(ly)?\b",
    "international": r"\binternational\b",
    "Leadership": r"\bleadership\b|\bleaders?\b",
    "humanities": r"\bhumanities\b",
    "Entrepreneurship": r"\bentrepreneurship\b|\bentrepreneur(s)?\b",
    "minority entrepreneurs": r"\bminority\s+entrepreneur(s)?\b",
    "Well-being": r"\bwell[-\s]?being\b",
    "mental health": r"\bmental\s+health\b",
}


def normalize(raw: str) -> str:
    raw = re.sub(r"\n--\s*\d+\s+of\s+\d+\s*--\n", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"(\w)-\n(\w)", r"\1-\2", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw


def count(text: str, pattern: str) -> int:
    return len(re.findall(pattern, text, flags=re.IGNORECASE))


def main() -> None:
    text = normalize(SOURCE_TXT.read_text(encoding="utf-8"))

    counts: dict[str, int] = {}
    for term, pat in PATTERNS.items():
        counts[term] = count(text, pat)

    out_pairs = [
        {
            "a": a.upper(),
            "b": b.upper(),
            "a_raw": a,
            "b_raw": b,
            "a_count": counts.get(a, 0),
            "b_count": counts.get(b, 0),
        }
        for a, b in PAIRS
    ]

    OUT_JSON.write_text(
        json.dumps(
            {"pairs": out_pairs, "counts": counts},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(out_pairs)} pairs to {OUT_JSON.name}")


if __name__ == "__main__":
    main()

