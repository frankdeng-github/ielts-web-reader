"""Publish the result of an owner-approved scope check to the exact PR head."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys


STATUS_CONTEXT = "scope/approved-paths"


def api(endpoint, payload=None):
    options = {} if payload is None else {"input": json.dumps(payload)}
    arguments = [] if payload is None else ["--method", "POST", "--input", "-"]
    output = subprocess.check_output(["gh", "api", endpoint, *arguments], text=True, **options)
    return json.loads(output)


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    repo = os.environ["GITHUB_REPOSITORY"]
    owner = event["repository"]["owner"]
    if event["repository"]["full_name"] != repo or event["sender"]["id"] != owner["id"]:
        sys.exit("Only the repository owner can approve a scope.")

    request = event["client_payload"]
    number = request["pr"]
    base = request["base"]
    head = request["head"]
    paths = request["paths"]
    if type(number) is not int or number < 1:
        sys.exit("Expected a positive integer PR number.")
    if not all(isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40}", sha) for sha in (base, head)):
        sys.exit("Expected exact lowercase base and head commit SHAs.")
    if not isinstance(paths, list) or not paths or not all(isinstance(path, str) for path in paths):
        sys.exit("Expected a nonempty list of exact approved paths.")

    pull = api(f"repos/{repo}/pulls/{number}")
    if (
        pull["state"] != "open"
        or pull["base"]["repo"]["full_name"] != repo
        or pull["base"]["ref"] != "main"
        or pull["base"]["sha"] != base
        or pull["head"]["sha"] != head
    ):
        sys.exit("The approved base or head no longer matches the open PR.")

    def publish(state, description):
        api(f"repos/{repo}/statuses/{head}", {
            "state": state,
            "description": description,
            "context": STATUS_CONTEXT,
            "target_url": f"https://github.com/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        })

    publish("pending", "Checking approved changed paths")
    git = ["git", "-C", sys.argv[1]]
    try:
        # Fetch objects for diffing. No PR files are checked out or executed.
        subprocess.run([
            *git, "fetch", "--no-tags", f"https://github.com/{repo}.git",
            "+refs/heads/main:refs/scope/base",
            f"+refs/pull/{number}/head:refs/scope/head",
        ], check=True)
        fetched = subprocess.check_output([
            *git, "rev-parse", "refs/scope/base", "refs/scope/head",
        ], text=True).splitlines()
        if fetched != [base, head]:
            publish("failure", "PR or main advanced; approve the current revisions")
            return 1

        command = [
            sys.executable, str(Path(__file__).with_name("check-change-scope.py")),
            "--repo", sys.argv[1], "--base", base, "--candidate", head,
        ]
        for path in paths:
            command.append(f"--allow={path}")
        result = subprocess.run(command).returncode
    except (OSError, subprocess.CalledProcessError, ValueError):
        publish("failure", "Unable to verify the approved scope")
        raise

    if result == 0:
        publish("success", "All candidate changes are in the approved paths")
    else:
        description = "Changed paths exceed the approval" if result == 1 else "Unable to verify the approved scope"
        publish("failure", description)
    return result


if __name__ == "__main__":
    sys.exit(main())
