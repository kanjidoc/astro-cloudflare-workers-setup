#!/usr/bin/env python3
"""Preflight checker for Astro 6 + Cloudflare Workers site setup.

Run this BEFORE starting the setup skill. It verifies every command-line tool
and account you need for a full Astro 6 + Cloudflare Workers project, prints a
scannable report, and exits 0 only when all HARD requirements are satisfied.

Design constraints (intentional):
  * Python 3 standard library ONLY -- this must run on a brand-new machine
    with nothing installed but a Python 3.8+ interpreter.
  * Cross-platform: macOS, Linux, Windows.
  * No subprocess call may crash the script: a missing binary raises
    FileNotFoundError, which is caught everywhere, and every call has a short
    timeout so a hung tool cannot stall the report.

Exit codes:
  0  -- every hard requirement met (WARN-only is still 0)
  1  -- one or more hard requirements failed
"""

import platform
import re
import subprocess
import sys

# Astro 6 requires Node.js 22 or newer. Astro dropped support for Node 18/20
# starting with v6, so anything below 22 will fail at `npm create astro`.
MIN_NODE_MAJOR = 22

# Cap on every subprocess call. Version probes are instant; this only exists so
# a misbehaving tool (e.g. one that opens a prompt) cannot hang the checker.
SUBPROCESS_TIMEOUT = 10


# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------

# ANSI color codes, used only on a real terminal. Plain text everywhere else
# (pipes, CI logs, redirects) so the report never contains escape garbage.
_USE_COLOR = sys.stdout.isatty()
_COLORS = {
    "green": "\033[32m",
    "red": "\033[31m",
    "yellow": "\033[33m",
    "cyan": "\033[36m",
    "bold": "\033[1m",
    "reset": "\033[0m",
}


def _color(text, name):
    """Wrap text in an ANSI color, or return it unchanged when not a TTY."""
    if not _USE_COLOR:
        return text
    return f"{_COLORS[name]}{text}{_COLORS['reset']}"


# ASCII-only status markers. These render identically on every terminal,
# including Windows consoles that lack Unicode glyph support.
MARKERS = {
    "OK": ("[ OK ]", "green"),
    "FAIL": ("[FAIL]", "red"),
    "WARN": ("[WARN]", "yellow"),
    "INFO": ("[INFO]", "cyan"),
}


def print_line(status, name, detail):
    """Print one check result: marker, padded name, and detected state."""
    marker, color = MARKERS[status]
    print(f"  {_color(marker, color)} {name:<14} {detail}")


def print_remediation(message):
    """Print an indented 'how to fix it' line under a FAIL or WARN."""
    print(f"         -> {message}")


def print_header(title):
    """Print a section header (TOOLS / ACCOUNTS)."""
    print()
    print(_color(title, "bold"))


# --------------------------------------------------------------------------
# Subprocess wrapper
# --------------------------------------------------------------------------

def run_command(args):
    """Run a command and return (ok, combined_output).

    `ok` is True only when the binary exists, did not time out, and exited 0.
    Every failure mode -- missing binary, timeout, OS error -- is caught here so
    no caller ever has to handle an exception. stdout and stderr are merged
    because some tools (notably `gh`) report status on stderr.
    """
    try:
        result = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=SUBPROCESS_TIMEOUT,
            text=True,
        )
    except FileNotFoundError:
        # The binary is not installed / not on PATH -- the common "missing tool"
        # case. Treated as a normal negative result, never an error.
        return False, ""
    except subprocess.TimeoutExpired:
        return False, ""
    except OSError:
        # Defensive: e.g. a non-executable file shadowing the real binary.
        return False, ""
    return result.returncode == 0, (result.stdout or "")


# --------------------------------------------------------------------------
# Platform-aware remediation text
# --------------------------------------------------------------------------

_SYSTEM = platform.system()  # 'Darwin', 'Linux', or 'Windows'.


def install_hint(tool):
    """Return an OS-specific install instruction for a given tool name."""
    hints = {
        "node": {
            "Darwin": "Install Node 22+ from nodejs.org, or `brew install node`, "
                      "or use nvm: `nvm install 22`.",
            "Linux": "Install Node 22+ from nodejs.org, or use nvm: "
                     "`nvm install 22` (distro packages are often outdated).",
            "Windows": "Install Node 22+ from nodejs.org, or use nvm-windows.",
        },
        "git": {
            "Darwin": "Install with `brew install git`, or from git-scm.com.",
            "Linux": "Install with your package manager, e.g. "
                     "`sudo apt install git` / `sudo dnf install git`.",
            "Windows": "Install Git for Windows from git-scm.com.",
        },
        "gh": {
            "Darwin": "Install the GitHub CLI with `brew install gh`.",
            "Linux": "Install the GitHub CLI -- see cli.github.com "
                     "for your distro's package.",
            "Windows": "Install the GitHub CLI with `winget install GitHub.cli`, "
                       "or see cli.github.com.",
        },
        "curl": {
            "Darwin": "curl ships with macOS; if missing, `brew install curl`.",
            "Linux": "Install with `sudo apt install curl` / "
                     "`sudo dnf install curl`.",
            "Windows": "curl ships with Windows 10+; otherwise see curl.se.",
        },
        "dig": {
            "Darwin": "Optional. Install with `brew install bind` if you want "
                      "local DNS checks.",
            "Linux": "Optional. Install with `sudo apt install dnsutils` / "
                     "`sudo dnf install bind-utils`.",
            "Windows": "Optional. `dig` is not standard on Windows; "
                       "`nslookup` is the built-in alternative.",
        },
    }
    # Fall back to the Linux text for any unrecognized platform.
    return hints.get(tool, {}).get(_SYSTEM, hints.get(tool, {}).get("Linux", ""))


# --------------------------------------------------------------------------
# Result accounting
# --------------------------------------------------------------------------

class Report:
    """Tally of check outcomes, used to drive the summary and exit code."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0

    def record(self, status):
        if status == "OK":
            self.passed += 1
        elif status == "FAIL":
            self.failed += 1
        elif status == "WARN":
            self.warnings += 1
        # INFO lines are advisory and deliberately not counted.


# --------------------------------------------------------------------------
# Individual checks
# --------------------------------------------------------------------------

def parse_first_int(text):
    """Return the first integer found in `text`, or None if there is none."""
    match = re.search(r"\d+", text)
    return int(match.group()) if match else None


def check_node(report):
    """Verify Node.js is installed and at least version 22 (Astro 6 minimum)."""
    ok, output = run_command(["node", "--version"])
    if not ok:
        print_line("FAIL", "node", "not found on PATH")
        print_remediation(install_hint("node"))
        report.record("FAIL")
        return

    version = output.strip()  # e.g. "v22.16.0"
    major = parse_first_int(version)
    if major is None:
        # node ran but produced something unparseable -- treat as a hard fail
        # rather than guessing.
        print_line("FAIL", "node", f"unrecognized version output: {version!r}")
        print_remediation(install_hint("node"))
        report.record("FAIL")
        return

    if major < MIN_NODE_MAJOR:
        print_line("FAIL", "node", f"{version} (need >= {MIN_NODE_MAJOR})")
        print_remediation(
            f"Astro 6 requires Node {MIN_NODE_MAJOR}+. " + install_hint("node")
        )
        report.record("FAIL")
        return

    print_line("OK", "node", f"{version} (>= {MIN_NODE_MAJOR} required)")
    report.record("OK")


def check_npm(report):
    """Verify npm is present. It ships with Node, so this mostly catches a
    broken or partial Node install."""
    ok, output = run_command(["npm", "--version"])
    if not ok:
        print_line("FAIL", "npm", "not found on PATH")
        print_remediation(
            "npm ships with Node.js -- reinstall Node. " + install_hint("node")
        )
        report.record("FAIL")
        return

    print_line("OK", "npm", output.strip())
    report.record("OK")


def check_git(report):
    """Verify git is installed -- required to init the repo and push to GitHub."""
    ok, output = run_command(["git", "--version"])
    if not ok:
        print_line("FAIL", "git", "not found on PATH")
        print_remediation(install_hint("git"))
        report.record("FAIL")
        return

    # `git --version` prints e.g. "git version 2.45.2"; show just the number.
    version = output.strip().replace("git version", "").strip() or output.strip()
    print_line("OK", "git", version)
    report.record("OK")


def check_gh(report):
    """Verify the GitHub CLI is installed AND authenticated.

    Returns the authenticated GitHub login name (str) when available, else None.
    The login is reused by the ACCOUNTS section so `gh auth status` is run once.
    """
    ok, version_output = run_command(["gh", "--version"])
    if not ok:
        print_line("FAIL", "gh", "GitHub CLI not found on PATH")
        print_remediation(install_hint("gh"))
        report.record("FAIL")
        return None

    # `gh --version` first line is e.g. "gh version 2.55.0 (2024-07-31)".
    first_line = version_output.splitlines()[0] if version_output else "gh"
    version = first_line.replace("gh version", "").strip() or first_line

    # Installed -- now confirm the user is logged in. `gh auth status` exits
    # non-zero and prints to stderr (merged into stdout here) when not signed in.
    auth_ok, auth_output = run_command(["gh", "auth", "status"])
    if not auth_ok:
        print_line("FAIL", "gh", f"{version} -- installed but NOT authenticated")
        print_remediation("Sign in with `gh auth login` and choose GitHub.com.")
        report.record("FAIL")
        return None

    login = parse_gh_login(auth_output)
    detail = f"{version} -- authenticated"
    if login:
        detail += f" as {login}"
    print_line("OK", "gh", detail)
    report.record("OK")
    return login


def parse_gh_login(auth_output):
    """Extract the account login from `gh auth status` output, or None.

    The line looks like: 'Logged in to github.com account USERNAME (...)' on
    newer gh, or '... as USERNAME (...)' on older releases -- handle both.
    """
    match = re.search(r"account\s+(\S+)", auth_output)
    if not match:
        match = re.search(r"Logged in to \S+ as\s+(\S+)", auth_output)
    return match.group(1) if match else None


def check_python(report):
    """Report the running interpreter. Trivially present (it is running this),
    so this is informational confirmation, never a failure."""
    version = platform.python_version()  # e.g. "3.14.3"
    print_line("OK", "python3", f"{version} (this interpreter)")
    report.record("OK")


def check_curl(report):
    """Verify curl is present -- later setup steps use it to verify the
    deployed site responds with the right headers."""
    ok, output = run_command(["curl", "--version"])
    if not ok:
        print_line("FAIL", "curl", "not found on PATH")
        print_remediation(install_hint("curl"))
        report.record("FAIL")
        return

    first_line = output.splitlines()[0] if output else "curl"
    print_line("OK", "curl", first_line.strip())
    report.record("OK")


def check_dig(report):
    """Check for `dig` -- OPTIONAL. Used for DNS troubleshooting when attaching
    a custom domain. Its absence is a WARN, never a FAIL, because the setup can
    proceed without it (the Cloudflare dashboard shows DNS state too).

    This check must NOT make a DNS query: preflight has to run on a brand-new
    or offline machine, so the only thing that matters is whether the binary
    exists. `run_command` reports a missing binary (FileNotFoundError) as
    ok=False with no network round-trip. We probe with `dig -v` first; some
    builds print version info to stderr and exit non-zero, so if that fails we
    fall back to invoking `dig` with no arguments -- it prints usage and exits
    non-zero, but that still proves the binary is present and on PATH.
    """
    found = _binary_exists(["dig", "-v"]) or _binary_exists(["dig"])
    if not found:
        print_line("WARN", "dig", "not found (optional)")
        print_remediation(install_hint("dig"))
        report.record("WARN")
        return

    print_line("OK", "dig", "available (DNS checks supported)")
    report.record("OK")


def _binary_exists(args):
    """Return True if running `args` proves the binary is installed.

    A missing binary surfaces as FileNotFoundError inside `run_command`, which
    returns ok=False with empty output. A binary that *is* present always runs
    -- even when it exits non-zero (e.g. `dig` with no args prints usage and
    exits 1) -- so any non-empty output, or a clean exit, proves it exists.
    This makes no network call.
    """
    ok, output = run_command(args)
    return ok or bool(output.strip())


def report_github_account(report, login):
    """Report GitHub account status, inferred from the earlier `gh` check."""
    if login:
        print_line("OK", "GitHub", f"signed in as {login}")
        report.record("OK")
    else:
        # Either gh is missing or not authenticated; the TOOLS section already
        # recorded that FAIL, so this is an INFO pointer, not a second failure.
        print_line("INFO", "GitHub", "account required -- not yet verified")
        print_remediation(
            "A GitHub account is needed to host the repo and run CI. "
            "Sign in with `gh auth login` (see the gh check above)."
        )


def report_cloudflare_account(report):
    """Report the Cloudflare account requirement.

    This genuinely CANNOT be auto-checked here: Wrangler (the Cloudflare CLI)
    is not installed until later in the setup flow, so there is no local
    credential to inspect. Print an INFO line so the user knows what is coming.
    """
    print_line("INFO", "Cloudflare", "account required -- verified later")
    print_remediation(
        "Cannot be checked now (Wrangler is installed during setup). "
        "Sign up free at dash.cloudflare.com; you will run `wrangler login` "
        "at the deploy step."
    )


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    """Run all checks, print the report, and return the process exit code."""
    print(_color("Astro 6 + Cloudflare Workers -- preflight check", "bold"))
    print(f"Platform: {_SYSTEM or 'unknown'} ({platform.machine()})")

    report = Report()

    # --- TOOLS -----------------------------------------------------------
    print_header("TOOLS")
    check_node(report)
    check_npm(report)
    check_git(report)
    # check_gh both records its own result and returns the login name so the
    # ACCOUNTS section does not have to re-run `gh auth status`.
    github_login = check_gh(report)
    check_python(report)
    check_curl(report)
    check_dig(report)

    # --- ACCOUNTS --------------------------------------------------------
    print_header("ACCOUNTS")
    report_github_account(report, github_login)
    report_cloudflare_account(report)

    # --- SUMMARY ---------------------------------------------------------
    print()
    summary = (
        f"{report.passed} passed, "
        f"{report.failed} failed, "
        f"{report.warnings} warnings"
    )
    if report.failed:
        print(_color(summary, "red"))
        print(
            _color("Preflight FAILED.", "red")
            + " Fix the items marked [FAIL] above, then run this again."
        )
        return 1

    print(_color(summary, "green"))
    if report.warnings:
        print(
            _color("Preflight passed", "green")
            + " with warnings -- optional items above are missing but setup "
            "can proceed."
        )
    else:
        print(_color("Preflight passed.", "green") + " You're ready to start.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
