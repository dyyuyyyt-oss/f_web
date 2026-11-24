"""Local-only readiness probe. Nonzero exit is recorded by systemd/journald."""
import json
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open('http://127.0.0.1:8000/health', timeout=10) as response:
            data = json.load(response)
        if data.get('status') != 'ok' or data.get('db') != 'ok':
            raise RuntimeError('application or database is unhealthy')
    except Exception as exc:
        print(f'fishweb health ALERT: {type(exc).__name__}', file=sys.stderr)
        return 1
    print('fishweb health OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
