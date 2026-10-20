#!/usr/bin/env python3
"""Bootstrap and run UseMe locally without third-party Python packages."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env.local"
ENV_TEMPLATE = ROOT / ".env.example"
MINIMUM_NODE_MAJOR = 22
GENERATED_KEYS = ("APP_SECRET", "CLEANUP_SECRET")


def fail(message: str) -> None:
    print(f"\nError: {message}", file=sys.stderr)
    raise SystemExit(1)


def command(name: str) -> str:
    executable = shutil.which(name)
    if not executable:
        fail(f"'{name}' is required but was not found on PATH.")
    return executable


def run(args: list[str], *, env: dict[str, str] | None = None) -> None:
    print(f"\n> {' '.join(args)}")
    try:
        subprocess.run(args, cwd=ROOT, env=env, check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error


def run_with_retries(
    args: list[str],
    *,
    env: dict[str, str] | None = None,
    attempts: int = 5,
) -> None:
    """Retry an idempotent command while a newly-created service settles."""
    for attempt in range(1, attempts + 1):
        print(f"\n> {' '.join(args)}")
        result = subprocess.run(args, cwd=ROOT, env=env, check=False)
        if result.returncode == 0:
            return
        if attempt == attempts:
            raise SystemExit(result.returncode)
        delay = min(2 ** attempt, 8)
        print(
            f"Command failed during service startup; retrying in {delay} seconds "
            f"({attempt}/{attempts})..."
        )
        time.sleep(delay)


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def ensure_local_env() -> bool:
    if ENV_FILE.exists():
        return False
    if not ENV_TEMPLATE.exists():
        fail(f"Missing environment template: {ENV_TEMPLATE}")

    replacements = {key: secrets.token_urlsafe(48) for key in GENERATED_KEYS}
    output: list[str] = []
    for line in ENV_TEMPLATE.read_text(encoding="utf-8").splitlines():
        key = line.split("=", 1)[0] if "=" in line else ""
        output.append(f"{key}={replacements[key]}" if key in replacements else line)

    ENV_FILE.write_text("\n".join(output) + "\n", encoding="utf-8")
    ENV_FILE.chmod(0o600)
    print("Created .env.local with unique APP_SECRET and CLEANUP_SECRET values.")
    return True


def validate_node(node: str) -> None:
    result = subprocess.run(
        [node, "--version"], cwd=ROOT, check=True, capture_output=True, text=True
    )
    version = result.stdout.strip().lstrip("v")
    try:
        major = int(version.split(".", 1)[0])
    except ValueError:
        fail(f"Could not understand Node.js version '{version}'.")
    if major < MINIMUM_NODE_MAJOR:
        fail(f"Node.js {MINIMUM_NODE_MAJOR}+ is required; found {version}.")
    print(f"Node.js {version} is ready.")


def missing_node_dependencies() -> list[str]:
    """Return declared packages absent from node_modules.

    Checking only the Next.js binary misses dependencies added after the first
    install, which otherwise produces a module-not-found error at runtime.
    """
    package_file = ROOT / "package.json"
    try:
        package = json.loads(package_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Could not read {package_file}: {error}")
    declared = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    return sorted(
        name for name in declared
        if not (ROOT / "node_modules" / Path(name)).exists()
    )


def validate_env(values: dict[str, str]) -> None:
    missing = [key for key in ("DATABASE_URL", "APP_SECRET", "CLEANUP_SECRET") if not values.get(key)]
    if missing:
        fail(f"Set these values in .env.local: {', '.join(missing)}")
    if len(values["APP_SECRET"]) < 32:
        fail("APP_SECRET in .env.local must contain at least 32 characters.")
    if len(values["CLEANUP_SECRET"]) < 24:
        fail("CLEANUP_SECRET in .env.local must contain at least 24 characters.")
    placeholders = [key for key in GENERATED_KEYS if values[key].startswith("generate-a-")]
    if placeholders:
        fail(
            f"Replace the template placeholder values for: {', '.join(placeholders)}. "
            "Delete .env.local and run this launcher again to generate them automatically."
        )
    has_supabase_url = bool(values.get("NEXT_PUBLIC_SUPABASE_URL"))
    has_supabase_key = bool(values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
    if has_supabase_url != has_supabase_key:
        fail("Supabase Auth needs both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
    if values.get("STORAGE_PROVIDER", "local") == "google-drive":
        drive_keys = (
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN",
            "GOOGLE_DRIVE_ROOT_FOLDER_ID",
        )
        missing_drive = [key for key in drive_keys if not values.get(key)]
        if missing_drive:
            fail(f"Google Drive storage needs: {', '.join(missing_drive)}")


def database_endpoint(database_url: str) -> tuple[str, int]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        fail("DATABASE_URL must be a PostgreSQL connection URL.")
    return parsed.hostname, parsed.port or 5432


def port_is_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


def postgres_container_is_ready(docker: str) -> bool:
    """Ask PostgreSQL itself whether the Compose database accepts connections."""
    result = subprocess.run(
        [
            docker,
            "compose",
            "exec",
            "-T",
            "postgres",
            "pg_isready",
            "-U",
            "useme",
            "-d",
            "useme",
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def start_local_postgres(database_url: str, *, no_docker: bool) -> None:
    host, port = database_endpoint(database_url)
    if no_docker:
        if port_is_open(host, port):
            print(f"PostgreSQL is reachable at {host}:{port}.")
            return
        fail(f"PostgreSQL is not reachable at {host}:{port} and --no-docker was supplied.")
    if host not in {"localhost", "127.0.0.1", "::1"}:
        fail(f"Remote PostgreSQL is not reachable at {host}:{port}.")

    docker = command("docker")
    run([docker, "info"])
    run([docker, "compose", "up", "-d", "postgres"])

    print(f"Waiting for PostgreSQL to accept connections at {host}:{port}", end="", flush=True)
    deadline = time.monotonic() + 60
    ready_checks = 0
    while time.monotonic() < deadline:
        if postgres_container_is_ready(docker):
            ready_checks += 1
            if ready_checks >= 2:
                print(" ready.")
                return
        else:
            ready_checks = 0
        print(".", end="", flush=True)
        time.sleep(1)
    print()
    fail("PostgreSQL did not become reachable within 60 seconds. Run 'docker compose logs postgres'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap and run the UseMe development server.")
    parser.add_argument("--check", action="store_true", help="check prerequisites without changing or starting anything")
    parser.add_argument("--no-docker", action="store_true", help="use an already-running PostgreSQL server")
    parser.add_argument("--no-install", action="store_true", help="do not run npm install when dependencies are absent")
    parser.add_argument("--no-migrate", action="store_true", help="skip the database migration")
    args = parser.parse_args()

    print(f"UseMe project: {ROOT}")
    node = command("node")
    npm = command("npm")
    validate_node(node)

    if args.check:
        missing_dependencies = missing_node_dependencies()
        print(f"Environment: {'ready' if ENV_FILE.exists() else 'will be created on first run'}")
        print(
            "Dependencies: ready"
            if not missing_dependencies
            else f"Dependencies: missing {', '.join(missing_dependencies)}"
        )
        print("Prerequisite check passed.")
        return

    created = ensure_local_env()
    values = parse_env(ENV_FILE)
    validate_env(values)
    child_env = os.environ.copy()
    child_env.update(values)

    missing_dependencies = missing_node_dependencies()
    if missing_dependencies:
        if args.no_install:
            fail(
                "Node dependencies are missing and --no-install was supplied: "
                + ", ".join(missing_dependencies)
            )
        print("Installing missing Node dependencies: " + ", ".join(missing_dependencies))
        run([npm, "install"], env=child_env)

    start_local_postgres(values["DATABASE_URL"], no_docker=args.no_docker)
    if not args.no_migrate:
        run_with_retries([npm, "run", "db:migrate"], env=child_env)

    url = values.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    if created:
        print("\nOptional: add Supabase URL and publishable key to .env.local to enable accounts.")
    print(f"\nStarting UseMe at {url} (press Ctrl+C to stop the web server).")
    os.chdir(ROOT)
    os.execvpe(npm, [npm, "run", "dev"], child_env)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
        raise SystemExit(130)
