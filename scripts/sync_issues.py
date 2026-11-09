"""Build Zola content from a private GitHub issue repository; never log issue text."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request

import yaml

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'content' / 'posts'
ABOUT = ROOT / 'content' / 'about'
OWNER = os.environ.get('CONTENT_OWNER', '')
REPO = os.environ.get('CONTENT_REPO', '')
TOKEN = os.environ.get('CONTENT_PAT', '')
API = 'https://api.github.com'


def api(path):
    req = urllib.request.Request(API + path, headers={
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + TOKEN,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'issueforge-builder',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404 and path.endswith('/parent'):
            return None
        # Do not expose response text, URL, token, or issue contents.
        raise RuntimeError(f'GitHub API returned HTTP {error.code}') from None
    except Exception:
        raise RuntimeError('GitHub API request failed') from None


def pages(path):
    result = []
    for page in range(1, 1001):
        separator = '&' if '?' in path else '?'
        batch = api(f'{path}{separator}per_page=100&page={page}')
        if not isinstance(batch, list):
            raise RuntimeError('Unexpected API response')
        result.extend(batch)
        if len(batch) < 100:
            return result
    raise RuntimeError('API pagination exceeded limit')


def split_frontmatter(body):
    body = body or ''
    match = re.match(r'\A(---|\+\+\+)\s*\n(.*?)\n\1\s*(?:\n|\Z)', body, re.S)
    if not match:
        return {}, body
    try:
        metadata = yaml.safe_load(match[2]) if match[1] == '---' else tomllib.loads(match[2])
        if not isinstance(metadata, dict):
            raise ValueError('Front matter must be a mapping')
        return metadata, body[match.end():]
    except Exception:
        raise RuntimeError('Invalid article front matter') from None


def labels(issue):
    return [label['name'] for label in issue.get('labels', [])]


def clean_tags(values):
    if not isinstance(values, list):
        raise RuntimeError('Article tags must be an array')
    return [x for x in values if isinstance(x, str) and x and x.lower() != 'public' and not x.lower().startswith('content:')]


def frontmatter(issue, overrides):
    issue_tags = clean_tags(labels(issue))
    values = {
        'title': issue['title'],
        'date': issue['created_at'][:10],
        'updated': issue['updated_at'][:10],
        'tags': issue_tags,
    }
    for key in ('title', 'date', 'updated', 'description', 'tags'):
        if key in overrides:
            values[key] = overrides[key]
    values['tags'] = clean_tags(values['tags'])
    for key in ('title', 'date', 'updated', 'description'):
        if key in values and not isinstance(values[key], (str, dt.date, dt.datetime)):
            raise RuntimeError('Invalid article metadata type')
    return values


def encode(value):
    return json.dumps(str(value), ensure_ascii=False)


def write_article(path, issue, body, overrides):
    values = frontmatter(issue, overrides)
    lines = ['+++']
    for key in ('title', 'date', 'updated', 'description'):
        if key in values:
            lines.append(f'{key} = {encode(values[key])}')
    lines.append('[taxonomies]')
    lines.append('tags = ' + json.dumps(values['tags'], ensure_ascii=False))
    lines += ['+++', '', body]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines), encoding='utf-8')


def run():
    if not all((OWNER, REPO, TOKEN)) or not re.fullmatch(r'[\w.-]+', OWNER) or not re.fullmatch(r'[\w.-]+', REPO):
        raise RuntimeError('Missing or invalid content repository configuration')
    base = '/repos/' + urllib.parse.quote(OWNER) + '/' + urllib.parse.quote(REPO)
    # Do not keep a cross-run cache. The runner's content tree is recreated each run.
    import shutil
    if OUT.exists():
        shutil.rmtree(OUT)
    if ABOUT.exists():
        shutil.rmtree(ABOUT)
    (OUT / '_index.md').parent.mkdir(parents=True, exist_ok=True)
    (OUT / '_index.md').write_text('+++\ntitle = "Posts"\ntransparent = true\nrender = false\n+++\n', encoding='utf-8')
    issues = pages(base + '/issues?state=all')
    published = 0
    about_issue = None
    for issue in issues:
        if 'pull_request' in issue or 'public' not in labels(issue):
            continue
        # A public-labelled sub-issue is still only a chapter of its parent.
        if api(base + f'/issues/{issue["number"]}/parent') is not None:
            continue
        if 'content:about' in labels(issue):
            if about_issue is None or issue['updated_at'] > about_issue['updated_at']:
                about_issue = issue
            continue
        meta, body = split_frontmatter(issue.get('body'))
        children = pages(base + f'/issues/{issue["number"]}/sub_issues')
        for child in children:
            # Only the parent contributes title, labels, date, and front matter.
            _, part = split_frontmatter(child.get('body'))
            if part.strip():
                body += '\n\n' + part
        write_article(OUT / f'issue-{issue["number"]}.md', issue, body, meta)
        published += 1
    if about_issue:
        meta, body = split_frontmatter(about_issue.get('body'))
        for child in pages(base + f'/issues/{about_issue["number"]}/sub_issues'):
            _, part = split_frontmatter(child.get('body'))
            if part.strip():
                body += '\n\n' + part
        ABOUT.mkdir(parents=True, exist_ok=True)
        title = meta.get('title', about_issue['title'])
        if not isinstance(title, str):
            raise RuntimeError('Invalid about title')
        (ABOUT / '_index.md').write_text('+++\ntitle = ' + encode(title) + '\ntemplate = "about.html"\n+++\n\n' + body, encoding='utf-8')
    else:
        ABOUT.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'about-default.md', ABOUT / '_index.md')
    print(f'Content prepared: {published} posts; about page ready.')


if __name__ == '__main__':
    try:
        run()
    except Exception as exc:
        # Never print exception text from content parsers or HTTP response bodies.
        print('Content sync failed: ' + ('GitHub API error' if 'GitHub API' in str(exc) else 'configuration or article format error'), file=sys.stderr)
        sys.exit(1)
