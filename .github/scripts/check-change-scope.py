#!/usr/bin/env python3
"""Check a committed Git diff against an externally supplied path allowlist."""

import argparse
import os
import re
import subprocess
import sys


def commit_id(value):
    if not re.fullmatch(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})", value):
        raise argparse.ArgumentTypeError("expected a full Git commit hash")
    return value.lower()


def repository_path(value):
    if any(part in {"", ".", ".."} for part in value.split("/")):
        raise argparse.ArgumentTypeError("expected an exact repository-relative file path")
    return os.fsencode(value)


def git(repository, *arguments, check=True):
    return subprocess.run(
        ["git", "--no-replace-objects", "-C", repository, *arguments],
        capture_output=True,
        check=check,
        env={**os.environ, "GIT_NO_LAZY_FETCH": "1"},
    )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "Supply the trusted baseline, the exact candidate under review, and the "
            "approved paths from outside the candidate branch. Use a trusted Git "
            "checkout. Exit codes: 0 within scope, 1 outside scope, 2 invalid check."
        ),
    )
    parser.add_argument("--repo", required=True, help="path to the Git repository")
    parser.add_argument("--base", required=True, type=commit_id, help="trusted baseline commit")
    parser.add_argument("--candidate", required=True, type=commit_id, help="candidate commit")
    parser.add_argument(
        "--allow",
        required=True,
        action="append",
        type=repository_path,
        metavar="PATH",
        help="exact repository-relative file path (repeat for each approved file)",
    )
    args = parser.parse_args()

    try:
        for commit in (args.base, args.candidate):
            resolved = git(args.repo, "rev-parse", "--verify", f"{commit}^{{commit}}")
            if resolved.stdout.strip() != commit.encode("ascii"):
                print(f"Invalid check: {commit} is not the exact ID of a commit.", file=sys.stderr)
                return 2

        ancestry = git(
            args.repo, "merge-base", "--is-ancestor", args.base, args.candidate, check=False
        )
        if ancestry.returncode == 1:
            print("Invalid check: baseline is not an ancestor of the candidate.", file=sys.stderr)
            return 2
        ancestry.check_returncode()

        # Disabling rename detection lists the old and new paths independently.
        diff = git(
            args.repo,
            "diff",
            "--no-renames",
            "--no-relative",
            "--no-ext-diff",
            "--no-textconv",
            "--ignore-submodules=none",
            "--name-only",
            "-z",
            args.base,
            args.candidate,
            "--",
        )
    except (subprocess.CalledProcessError, OSError) as error:
        detail = str(error)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            detail = os.fsdecode(error.stderr).strip()
        print(f"Invalid check: {detail}", file=sys.stderr)
        return 2

    changed_paths = set(diff.stdout.split(b"\0")) - {b""}
    out_of_scope = sorted(changed_paths.difference(args.allow))
    if out_of_scope:
        for path in out_of_scope:
            print(f"Outside approved scope: {os.fsdecode(path)!r}", file=sys.stderr)
        return 1

    print(f"Within approved scope: {len(changed_paths)} changed path(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
