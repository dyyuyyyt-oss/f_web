"""Create and verify a consistent online SQLite backup; never copy a live DB file."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import tempfile


def backup_database(source: Path, directory: Path) -> Path:
    source = source.resolve(strict=True)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    destination = directory / f'app-{stamp}.db'
    # Private permissions from mkstemp protect conversations in the backup.
    import os
    fd, name = tempfile.mkstemp(prefix='.backup-', suffix='.tmp', dir=directory)
    os.close(fd)
    temporary = Path(name)
    try:
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src:
            with closing(sqlite3.connect(temporary)) as dst:
                src.backup(dst)
                if dst.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise RuntimeError('Backup failed integrity_check')
                tables = {r[0] for r in dst.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'user', 'pet_episodes'} <= tables:
                    raise RuntimeError('Backup is missing required application tables')
        temporary.rename(destination)
        return destination
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    print(backup_database(args.source, args.directory))
